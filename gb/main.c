// Slow Horizons ROM (gb-seed-lab): receives a seed over the link cable, draws the landscape with gen.c, shows every phase
// on screen and sends the tiles back. Built with GBDK-2020 (see Makefile).
//
// Link (Game Boy is clock master, like gb-link-usb bridge mode: one byte per transfer, ~1 ms each):
//   PC -> GB  $7E 'S' seed (4 bytes, little endian) xor-of-seed-bytes      start a drawing
//   GB -> PC  $7E type len(2, LE) payload sum(2, LE, sum of payload bytes)
//     'H' "HORIZON1"                         hello, at boot
//     'B' seed(4) traits(9)                  drawing starts
//     'P' phase(1) n(1) n x [row(1) tiles(320)]  after each phase: the tile rows (20 tiles each) that changed on
//                                            screen; the first phase of a drawing sends all 18 rows
//     'D' seed(4) frames(2)                  done; frames = VBlanks since 'B' (59.7 per second)
//   Idle polls send $00.
#include <gb/gb.h>
#include <stdint.h>
#include "../gen/gen.h"

#define ROWS_PER_BANK 51

// tests in PyBoy (tools/emu.py): write seed bytes to mail[0..3], then mail[4] = 1; mail[5] = 1 while drawing
volatile u8 mail[6];
volatile u8 phase_now;      // last finished phase, for timing in the emulator
volatile u8 phase_seq;      // counts gen_phase calls (ridges repeat the same phase id)
volatile u8 in_upload;      // 1 while gen_phase converts and uploads tiles

u8 gb_rowbank[144];
u8 *gb_rowptr[144];
u8 gb_curbank = 0xFF;
static volatile u16 frames;
static u8 tile[16];
static u8 linkmode;            // 1 once the PC has talked to us
static u32 pending_seed;
static u8 pending;
static u16 sum;

// ---------------------------------------------------------------- screen: 360 unique tiles, tile bank switch at line 72

static void vbl(void) { frames++; LCDC_REG |= LCDCF_BG8000; }
static void lcd(void) { while (STAT_REG & 3) ; LCDC_REG &= ~LCDCF_BG8000; }   // wait for HBlank of line 71

// tiles 0..359 are contiguous from $8000 (tile 256 is $9000); the map indexes them as described in screen_init
static u8 *tile_addr(u16 n) { return (u8 *)(0x8000 + n * 16); }

// 5x7 glyphs, 1 bit per pixel: 0-9 A-F, '#', '-'
static const u8 FONT[18][8] = {
  { 0x70,0x88,0x98,0xA8,0xC8,0x88,0x70,0 }, { 0x20,0x60,0x20,0x20,0x20,0x20,0x70,0 }, { 0x70,0x88,0x08,0x30,0x40,0x80,0xF8,0 },
  { 0xF8,0x10,0x20,0x10,0x08,0x88,0x70,0 }, { 0x10,0x30,0x50,0x90,0xF8,0x10,0x10,0 }, { 0xF8,0x80,0xF0,0x08,0x08,0x88,0x70,0 },
  { 0x30,0x40,0x80,0xF0,0x88,0x88,0x70,0 }, { 0xF8,0x08,0x10,0x20,0x40,0x40,0x40,0 }, { 0x70,0x88,0x88,0x70,0x88,0x88,0x70,0 },
  { 0x70,0x88,0x88,0x78,0x08,0x10,0x60,0 }, { 0x70,0x88,0x88,0xF8,0x88,0x88,0x88,0 }, { 0xF0,0x88,0x88,0xF0,0x88,0x88,0xF0,0 },
  { 0x70,0x88,0x80,0x80,0x80,0x88,0x70,0 }, { 0xE0,0x90,0x88,0x88,0x88,0x90,0xE0,0 }, { 0xF8,0x80,0x80,0xF0,0x80,0x80,0xF8,0 },
  { 0xF8,0x80,0x80,0xF0,0x80,0x80,0x80,0 }, { 0x50,0xF8,0x50,0x50,0xF8,0x50,0x00,0 }, { 0x00,0x00,0x00,0xF8,0x00,0x00,0x00,0 }
};
#define G_HASH 16
#define G_DASH 17
#define FONT_TILE 360          // tiles 360..377; window lines sit in the bottom half, so map index = n - 256
#define BLANK_TILE 378

static void screen_init(void) {
  u8 map[20], x, y, i;
  u16 n;
  DISPLAY_OFF;
  BGP_REG = 0xE4;
  for (i = 0; i < 18; i++) {
    for (y = 0; y < 8; y++) { u8 b = (u8)~FONT[i][y]; tile[y * 2] = b; tile[y * 2 + 1] = b; }   // light text on dark strip
    set_data(tile_addr(FONT_TILE + i), tile, 16);
  }
  for (y = 0; y < 16; y++) tile[y] = 0xFF;
  set_data(tile_addr(BLANK_TILE), tile, 16);
  for (y = 0; y < 16; y++) tile[y] = 0;
  for (n = 0; n < 360; n++) set_data(tile_addr(n), tile, 16);
  for (y = 0; y < 18; y++) {
    for (x = 0; x < 20; x++) { n = y * 20 + x; map[x] = (u8)(y < 9 ? n : n < 256 ? n : n - 256); }
    set_bkg_tiles(0, y, 20, 1, map);
  }
  for (x = 0; x < 20; x++) map[x] = BLANK_TILE - 256;
  set_win_tiles(0, 0, 20, 1, map);
  move_win(7, 136);
  LYC_REG = 71;
  STAT_REG = STATF_LYC;
  CRITICAL {
    add_VBL(vbl);
    add_LCD(lcd);
  }
  set_interrupts(VBL_IFLAG | LCD_IFLAG);
  SHOW_BKG; SHOW_WIN; DISPLAY_ON;
  enable_interrupts();
}

static void strip(u32 seed, u8 phase, u8 known) {
  u8 m[20], i;
  for (i = 0; i < 20; i++) m[i] = BLANK_TILE - 256;
  m[1] = FONT_TILE + G_HASH - 256;
  for (i = 0; i < 8; i++) m[2 + i] = FONT_TILE - 256 + (known ? (u8)((seed >> (28 - i * 4)) & 15) : G_DASH);
  if (phase) m[18] = FONT_TILE - 256 + (phase & 15);
  set_win_tiles(0, 0, 20, 1, m);
}

// ---------------------------------------------------------------- link

static u8 rxstate, rxbuf[5];
static void rx(u8 b) {
  if (rxstate == 0) { if (b == 0x7E) rxstate = 1; return; }
  if (rxstate == 1) { rxstate = b == 'S' ? 2 : 0; return; }
  rxbuf[rxstate - 2] = b;
  if (++rxstate == 7) {
    rxstate = 0;
    if ((u8)(rxbuf[0] ^ rxbuf[1] ^ rxbuf[2] ^ rxbuf[3]) == rxbuf[4]) {
      pending_seed = (u32)rxbuf[0] | ((u32)rxbuf[1] << 8) | ((u32)rxbuf[2] << 16) | ((u32)rxbuf[3] << 24);
      pending = 1; linkmode = 1;
    }
  }
}
static void xfer(u8 b) {
  SB_REG = b;
  SC_REG = 0x81;
  while (SC_REG & 0x80) ;
  rx(SB_REG);
}
static void put(u8 b) { sum += b; xfer(b); }
static void frame_start(u8 type, u16 len) { xfer(0x7E); xfer(type); xfer((u8)len); xfer((u8)(len >> 8)); sum = 0; }
static void frame_end(void) { xfer((u8)sum); xfer((u8)(sum >> 8)); }

// ---------------------------------------------------------------- drawing

static u32 seed_now;
static traits_t tr;

static u8 tilerow[320];   // one row of 20 tiles, 2bpp
static u8 changed[18];    // tile rows that differ from what is on screen
static u8 force_full;     // first phase of a drawing: send every row
#define PREV_BANK 3       // cartridge RAM bank 3 keeps a copy of the tiles on screen (18 x 320 bytes)
#define PREV ((u8 *)0xA000)

// conv.s: one pixel row -> 20 tile rows (same rules as gen_draw's final dither)
u8 *conv_src, *conv_out;
u8 conv_bay[8], conv_diff;
void conv_row(void);
void cmp_copy(void);

void gen_phase(u8 phase) {
  u8 ty, r, x, nchanged = 0;
  u16 i;
  in_upload = 1;
  // pass 1: convert every tile row, keep only the rows that changed
  for (ty = 0; ty < 18; ty++) {
    u8 *prev, diff = force_full;
    for (r = 0; r < 8; r++) {
      u8 y = ty * 8 + r, b = gb_rowbank[y];
      if (b != gb_curbank) { gb_curbank = b; SWITCH_RAM(b); }
      for (x = 0; x < 8; x++) conv_bay[x] = gen_bayer[r * 8 + x];
      conv_src = gb_rowptr[y]; conv_out = tilerow + r * 2;
      conv_row();
    }
    gb_curbank = PREV_BANK; SWITCH_RAM(PREV_BANK);
    prev = PREV + (u16)ty * 320;
    conv_src = tilerow; conv_out = prev; conv_diff = diff;
    cmp_copy();
    diff = conv_diff;
    changed[ty] = diff;
    if (diff) { nchanged++; set_data(tile_addr((u16)ty * 20), tilerow, 320); }
  }
  // pass 2: send the changed rows: phase, count, then (row index, 320 bytes) per row
  if (linkmode) {
    frame_start('P', 2 + (u16)nchanged * 321);
    put(phase); put(nchanged);
    gb_curbank = PREV_BANK; SWITCH_RAM(PREV_BANK);
    for (ty = 0; ty < 18; ty++) if (changed[ty]) {
      u8 *prev = PREV + (u16)ty * 320;
      put(ty);
      for (i = 0; i < 320; i++) put(prev[i]);
    }
    frame_end();
  }
  force_full = 0;
  strip(seed_now, phase, 1);
  in_upload = 0;
  phase_now = phase;
  phase_seq++;
}

static void draw(u32 seed) {
  u8 i;
  u16 f0;
  seed_now = seed;
  force_full = 1;
  mail[5] = 1;
  strip(seed, 0, 1);
  gen_traits(seed, &tr);
  if (linkmode) {
    frame_start('B', 13);
    for (i = 0; i < 4; i++) put((u8)(seed >> (i * 8)));
    put(tr.palette); put(tr.time); put(tr.sky); put(tr.terrain); put(tr.ground); put(tr.weather); put(tr.layers); put(tr.snowcaps); put(tr.extras);
    frame_end();
  }
  f0 = frames;
  gen_draw(seed, &tr);
  f0 = frames - f0;
  if (linkmode) {
    frame_start('D', 6);
    for (i = 0; i < 4; i++) put((u8)(seed >> (i * 8)));
    put((u8)f0); put((u8)(f0 >> 8));
    frame_end();
  }
  mail[5] = 0;
}

void main(void) {
  u8 y, i;
  const char *hello = "HORIZON1";
  ENABLE_RAM;
  for (y = 0; y < 144; y++) { gb_rowbank[y] = y / ROWS_PER_BANK; gb_rowptr[y] = (u8 *)0xA000 + (u16)(y % ROWS_PER_BANK) * 160; }
  screen_init();
  SWITCH_RAM(PREV_BANK); gb_curbank = PREV_BANK;
  for (i16 k = 0; k < 18 * 320; k++) PREV[k] = 0;
  strip(0, 0, 0);
  frame_start('H', 8);
  for (i = 0; i < 8; i++) put((u8)hello[i]);
  frame_end();
  while (1) {
    if (mail[4]) {
      mail[4] = 0;
      draw((u32)mail[0] | ((u32)mail[1] << 8) | ((u32)mail[2] << 16) | ((u32)mail[3] << 24));
    } else if (pending) {
      pending = 0;
      draw(pending_seed);
    } else xfer(0x00);   // idle poll, about 1 ms
  }
}
