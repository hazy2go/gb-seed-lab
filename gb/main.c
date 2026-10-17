// gb-seed-lab ROM: receives a seed over the link cable, draws the landscape with gen.c, shows every phase
// on screen and sends the tiles back. Built with GBDK-2020 (see Makefile).
//
// Link (Game Boy is clock master, like gb-link-usb bridge mode: one byte per transfer, ~1 ms each):
//   PC -> GB  $7E 'S' seed (4 bytes, little endian) xor-of-seed-bytes      start a drawing
//   GB -> PC  $7E type len(2, LE) payload sum(2, LE, sum of payload bytes)
//     'H' "SEEDLAB1"                         hello, at boot
//     'B' seed(4) traits(9)                  drawing starts
//     'P' phase(1) tiles(360 x 16)           after each phase: the tiles exactly as on screen
//     'D' seed(4) frames(2)                  done; frames = VBlanks since 'B' (59.7 per second)
//   Idle polls send $00.
#include <gb/gb.h>
#include <stdint.h>
#include "../gen/gen.h"

#define ROWS_PER_BANK 51

// emulator lane and tests: write seed bytes to mail[0..3], then mail[4] = 1; mail[5] = 1 while drawing
volatile u8 mail[6];

static u8 rowbank[144];
static u8 *rowptr[144];
static u8 curbank = 0xFF;
static volatile u16 frames;
static u8 tile[16];
static u8 linkmode;            // 1 once the PC has talked to us
static u32 pending_seed;
static u8 pending;
static u16 sum;

// ---------------------------------------------------------------- pixel buffer in cartridge RAM

u8 px_get(i16 x, i16 y) {
  u8 b = rowbank[(u8)y];
  if (b != curbank) { curbank = b; SWITCH_RAM(b); }
  return rowptr[(u8)y][(u8)x];
}
void px_set(i16 x, i16 y, u8 v) {
  u8 b = rowbank[(u8)y];
  if (b != curbank) { curbank = b; SWITCH_RAM(b); }
  rowptr[(u8)y][(u8)x] = v;
}

// ---------------------------------------------------------------- screen: 360 unique tiles, tile bank switch at line 72

static void vbl(void) { frames++; LCDC_REG |= LCDCF_BG8000; }
static void lcd(void) { while (STAT_REG & 3) ; LCDC_REG &= ~LCDCF_BG8000; }   // wait for HBlank of line 71

static u8 *tile_addr(u16 n) { return (u8 *)(n < 256 ? 0x8000 + n * 16 : 0x9000 + (n - 256) * 16); }

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

void gen_phase(u8 phase) {
  u16 n = 0;
  u8 ty, tx, r, c, lo, hi;
  if (linkmode) { frame_start('P', 1 + 360 * 16); put(phase); }
  for (ty = 0; ty < 18; ty++) for (tx = 0; tx < 20; tx++, n++) {
    for (r = 0; r < 8; r++) {
      u8 y = ty * 8 + r;
      lo = 0; hi = 0;
      for (c = 0; c < 8; c++) {
        u8 x = tx * 8 + c, v = px_get(x, y), s;
        if (v >= HARD) s = v & 3;
        else { u16 t = (u16)v + gen_bayer[(y & 7) * 8 + (x & 7)]; s = (u8)(t >> 6); if (s > 3) s = 3; }
        lo = (lo << 1) | (s & 1);
        hi = (hi << 1) | (s >> 1);
      }
      tile[r * 2] = lo; tile[r * 2 + 1] = hi;
    }
    set_data(tile_addr(n), tile, 16);
    if (linkmode) for (r = 0; r < 16; r++) put(tile[r]);
  }
  if (linkmode) frame_end();
  strip(seed_now, phase, 1);
}

static void draw(u32 seed) {
  u8 i;
  u16 f0;
  seed_now = seed;
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
  gen_draw(seed, 144, &tr);
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
  const char *hello = "SEEDLAB1";
  ENABLE_RAM;
  for (y = 0; y < 144; y++) { rowbank[y] = y / ROWS_PER_BANK; rowptr[y] = (u8 *)0xA000 + (u16)(y % ROWS_PER_BANK) * 160; }
  screen_init();
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
