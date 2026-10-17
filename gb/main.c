// Slow Horizons ROM (gb-seed-lab): receives a seed over the link cable, draws the landscape with gen.c, shows every phase
// on screen and sends the tiles back. Built with GBDK-2020 (see Makefile).
//
// Link (Game Boy is clock master, like gb-link-usb bridge mode: one byte per transfer, ~1 ms each):
//   PC -> GB  $7E 'S' seed(4) piece number(2) xor-of-those-6     start a drawing (little endian)
//   GB -> PC  $7E type len(2, LE) payload sum(2, LE, sum of payload bytes)
//     'H' "HORIZON1"                         hello, at boot
//     'B' seed(4) traits(9)                  drawing starts
//     'P' phase(1) n(1) n x [row(1) tiles(320)]  after each phase: the tile rows (20 tiles each) that changed on
//                                            screen; the first phase of a drawing sends all 18 rows
//     'D' seed(4) frames(2)                  done; frames = VBlanks since 'B' (59.7 per second)
//   Idle polls send $00.
#include <gb/gb.h>
#include <stdint.h>
#include <string.h>
#include "../gen/gen.h"

#define ROWS_PER_BANK 51

// tests in PyBoy (tools/emu.py): write seed bytes to mail[0..3], then mail[4] = 1; mail[5] = 1 while drawing
volatile u8 mail[9];   // [6..7] piece number (optional), [8] = 1: act as if a PC is connected (tests)
volatile u8 phase_now;      // last finished phase, for timing in the emulator
volatile u8 phase_seq;      // counts gen_phase calls (ridges repeat the same phase id)
volatile u8 in_upload;      // 1 while gen_phase converts and uploads tiles

u8 gb_rowbank[144];
u8 *gb_rowptr[144];
u8 gb_curbank = 0xFF;
static u8 tilerow[320];   // one row of 20 tiles, 2bpp (gen_phase, vfill)
static u8 *tilerow_scratch(void) { return tilerow; }
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

// 5x7 glyphs (bits 7..3), rows 0..6; index = ASCII - 32 for ' ' .. 'Z'
static const u8 FONT[59][7] = {
  {0,0,0,0,0,0,0}, {0x20,0x20,0x20,0x20,0x20,0,0x20}, {0x50,0x50,0,0,0,0,0}, {0x50,0xF8,0x50,0x50,0xF8,0x50,0},   /*  !"# */
  {0x20,0x78,0xA0,0x70,0x28,0xF0,0x20}, {0xC8,0xC8,0x10,0x20,0x40,0x98,0x98}, {0x60,0x90,0xA0,0x40,0xA8,0x90,0x68}, {0x20,0x20,0,0,0,0,0},
  {0x10,0x20,0x40,0x40,0x40,0x20,0x10}, {0x40,0x20,0x10,0x10,0x10,0x20,0x40}, {0,0x50,0x20,0xF8,0x20,0x50,0}, {0,0x20,0x20,0xF8,0x20,0x20,0},
  {0,0,0,0,0x60,0x20,0x40}, {0,0,0,0xF8,0,0,0}, {0,0,0,0,0,0x60,0x60}, {0x08,0x08,0x10,0x20,0x40,0x80,0x80},
  {0x70,0x88,0x98,0xA8,0xC8,0x88,0x70}, {0x20,0x60,0x20,0x20,0x20,0x20,0x70}, {0x70,0x88,0x08,0x30,0x40,0x80,0xF8}, {0xF8,0x10,0x20,0x10,0x08,0x88,0x70},
  {0x10,0x30,0x50,0x90,0xF8,0x10,0x10}, {0xF8,0x80,0xF0,0x08,0x08,0x88,0x70}, {0x30,0x40,0x80,0xF0,0x88,0x88,0x70}, {0xF8,0x08,0x10,0x20,0x40,0x40,0x40},
  {0x70,0x88,0x88,0x70,0x88,0x88,0x70}, {0x70,0x88,0x88,0x78,0x08,0x10,0x60}, {0,0x60,0x60,0,0x60,0x60,0}, {0,0x60,0x60,0,0x60,0x20,0x40},
  {0x10,0x20,0x40,0x80,0x40,0x20,0x10}, {0,0,0xF8,0,0xF8,0,0}, {0x40,0x20,0x10,0x08,0x10,0x20,0x40}, {0x70,0x88,0x08,0x10,0x20,0,0x20},
  {0x70,0x88,0xB8,0xA8,0xB8,0x80,0x78},
  {0x70,0x88,0x88,0xF8,0x88,0x88,0x88}, {0xF0,0x88,0x88,0xF0,0x88,0x88,0xF0}, {0x70,0x88,0x80,0x80,0x80,0x88,0x70}, {0xE0,0x90,0x88,0x88,0x88,0x90,0xE0},
  {0xF8,0x80,0x80,0xF0,0x80,0x80,0xF8}, {0xF8,0x80,0x80,0xF0,0x80,0x80,0x80}, {0x70,0x88,0x80,0xB8,0x88,0x88,0x78}, {0x88,0x88,0x88,0xF8,0x88,0x88,0x88},
  {0x70,0x20,0x20,0x20,0x20,0x20,0x70}, {0x38,0x10,0x10,0x10,0x10,0x90,0x60}, {0x88,0x90,0xA0,0xC0,0xA0,0x90,0x88}, {0x80,0x80,0x80,0x80,0x80,0x80,0xF8},
  {0x88,0xD8,0xA8,0xA8,0x88,0x88,0x88}, {0x88,0x88,0xC8,0xA8,0x98,0x88,0x88}, {0x70,0x88,0x88,0x88,0x88,0x88,0x70}, {0xF0,0x88,0x88,0xF0,0x80,0x80,0x80},
  {0x70,0x88,0x88,0x88,0xA8,0x90,0x68}, {0xF0,0x88,0x88,0xF0,0xA0,0x90,0x88}, {0x78,0x80,0x80,0x70,0x08,0x08,0xF0}, {0xF8,0x20,0x20,0x20,0x20,0x20,0x20},
  {0x88,0x88,0x88,0x88,0x88,0x88,0x70}, {0x88,0x88,0x88,0x88,0x88,0x50,0x20}, {0x88,0x88,0x88,0xA8,0xA8,0xA8,0x50}, {0x88,0x88,0x50,0x20,0x50,0x88,0x88},
  {0x88,0x88,0x50,0x20,0x20,0x20,0x20}, {0xF8,0x08,0x10,0x20,0x40,0x80,0xF8}
};
static const u8 *glyph(char c) { if (c >= 'a' && c <= 'z') c -= 32; return (c < 32 || c > 'Z') ? FONT[0] : FONT[c - 32]; }

// The strip (window, bottom 8 lines) uses its own tiles 360..382, light text on dark: these characters only
static const char STRIP_CHARS[] = "0123456789ABCDEFNO.#- ";
#define STRIP_TILE 360          // window lines sit in the bottom half, so map index = tile - 256
static u8 strip_index(char c) { u8 i; for (i = 0; STRIP_CHARS[i]; i++) if (STRIP_CHARS[i] == c) return STRIP_TILE - 256 + i; return STRIP_TILE - 256 + 21; }

// 2bpp row bytes for one 8-pixel row: bits set = shade fg, clear = shade bg
static void row2bpp(u8 bits, u8 fg, u8 bg, u8 *out) {
  out[0] = (u8)((fg & 1 ? bits : 0) | (bg & 1 ? (u8)~bits : 0));
  out[1] = (u8)((fg & 2 ? bits : 0) | (bg & 2 ? (u8)~bits : 0));
}

// Text and fills drawn straight into the picture tiles (the tile map never changes). Used for the commission
// card and the screensaver; the next drawing's first phase re-uploads every row anyway.
static void vfill(u8 shade) {
  u8 r;
  for (r = 0; r < 16; r += 2) row2bpp(0, 0, shade, tile + r);
  for (r = 0; r < 20; r++) memcpy(tilerow_scratch() + r * 16, tile, 16);
  for (r = 0; r < 18; r++) set_data(tile_addr((u16)r * 20), tilerow_scratch(), 320);
}
static void vchar(u8 tx, u8 ty, char c, u8 fg, u8 bg) {
  const u8 *g = glyph(c);
  u8 r;
  for (r = 0; r < 8; r++) row2bpp(r < 7 ? g[r] >> 1 : 0, fg, bg, tile + r * 2);   // one column of space on the left
  set_data(tile_addr((u16)ty * 20 + tx), tile, 16);
}
static void vtext(u8 tx, u8 ty, const char *s, u8 fg, u8 bg) { for (; *s && tx < 20; s++, tx++) vchar(tx, ty, *s, fg, bg); }
// double size: a 5x7 glyph becomes 10x14 inside a 2x2 tile block
static void vbig(u8 tx, u8 ty, const char *s, u8 fg, u8 bg) {
  for (; *s && tx < 19; s++, tx += 2) {
    const u8 *g = glyph(*s);
    u8 q, r;
    for (q = 0; q < 4; q++) {           // q: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
      for (r = 0; r < 8; r++) {
        u8 py = (q >> 1) * 8 + r, bits = 0, k;
        if (py >= 1 && py < 15) {
          u8 src = g[(py - 1) >> 1];
          u16 wide = 0;
          for (k = 0; k < 5; k++) if (src & (0x80 >> k)) wide |= 0xC000 >> (3 + k * 2);
          bits = (q & 1) ? (u8)wide : (u8)(wide >> 8);
        }
        row2bpp(bits, fg, bg, tile + r * 2);
      }
      set_data(tile_addr((u16)(ty + (q >> 1)) * 20 + tx + (q & 1)), tile, 16);
    }
  }
}

static void sio(void);   // serial interrupt, defined with the drawing code

static void screen_init(void) {
  u8 map[20], x, y, i;
  u16 n;
  DISPLAY_OFF;
  BGP_REG = 0xE4;
  for (i = 0; i < 22; i++) {
    const u8 *g = glyph(STRIP_CHARS[i]);
    for (y = 0; y < 8; y++) row2bpp(y < 7 ? g[y] >> 1 : 0, 0, 3, tile + y * 2);   // light text on the dark strip
    set_data(tile_addr(STRIP_TILE + i), tile, 16);
  }
  for (y = 0; y < 18; y++) {
    for (x = 0; x < 20; x++) { n = y * 20 + x; map[x] = (u8)(y < 9 ? n : n < 256 ? n : n - 256); }
    set_bkg_tiles(0, y, 20, 1, map);
  }
  for (x = 0; x < 20; x++) map[x] = strip_index(' ');
  set_win_tiles(0, 0, 20, 1, map);
  move_win(7, 136);
  LYC_REG = 71;
  STAT_REG = STATF_LYC;
  CRITICAL {
    add_VBL(vbl);
    add_LCD(lcd);
    add_SIO(sio);
  }
  set_interrupts(VBL_IFLAG | LCD_IFLAG | SIO_IFLAG);
  SHOW_BKG; HIDE_WIN; DISPLAY_ON;
  enable_interrupts();
}

static void hex8(char *out, u32 v) { u8 i; for (i = 0; i < 8; i++) { u8 d = (u8)((v >> (28 - i * 4)) & 15); out[i] = (char)(d < 10 ? '0' + d : 'A' + d - 10); } out[8] = 0; }
static u8 dec(char *out, u16 v) { char t[6]; u8 n = 0, i; do { t[n++] = (char)('0' + v % 10); v /= 10; } while (v); for (i = 0; i < n; i++) out[i] = t[n - 1 - i]; out[n] = 0; return n; }

// strip during a drawing: "#1A2B3C4D" on the left, "NO.142" on the right
static void strip(u32 seed, u16 n) {
  char h[9], d[6];
  u8 m[20], i, len;
  for (i = 0; i < 20; i++) m[i] = strip_index(' ');
  hex8(h, seed);
  m[1] = strip_index('#');
  for (i = 0; i < 8; i++) m[2 + i] = strip_index(h[i]);
  if (n) {
    len = dec(d, n);
    m[19 - len - 3] = strip_index('N'); m[19 - len - 2] = strip_index('O'); m[19 - len - 1] = strip_index('.');
    for (i = 0; i < len; i++) m[19 - len + i] = strip_index(d[i]);
  }
  set_win_tiles(0, 0, 20, 1, m);
}

// ---------------------------------------------------------------- link

static u8 rxstate, rxbuf[7];
static u16 pending_n;
static void rx(u8 b) {
  if (rxstate == 0) { if (b == 0x7E) rxstate = 1; return; }
  if (rxstate == 1) { rxstate = b == 'S' ? 2 : 0; return; }
  rxbuf[rxstate - 2] = b;
  if (++rxstate == 9) {   // seed(4) piece number(2) xor(1)
    rxstate = 0;
    if ((u8)(rxbuf[0] ^ rxbuf[1] ^ rxbuf[2] ^ rxbuf[3] ^ rxbuf[4] ^ rxbuf[5]) == rxbuf[6]) {
      pending_seed = (u32)rxbuf[0] | ((u32)rxbuf[1] << 8) | ((u32)rxbuf[2] << 16) | ((u32)rxbuf[3] << 24);
      pending_n = (u16)rxbuf[4] | ((u16)rxbuf[5] << 8);
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

static u8 changed[18];    // tile rows that differ from what is on screen
static u8 force_full;     // first phase of a drawing: send every row
#define PREV_BANK 3       // cartridge RAM bank 3 keeps a copy of the tiles on screen (18 x 320 bytes)
#define PREV ((u8 *)0xA000)

// conv.s: one pixel row -> 20 tile rows (same rules as gen_draw's final dither)
u8 *conv_src, *conv_out;
u8 conv_bay[8], conv_diff;
void conv_row(void);
void cmp_copy(void);

// Background sending: after a phase, the changed rows go out from the serial interrupt while the next
// phase is being drawn. The frame reads the rows from the screen copy in bank 3, so the next gen_phase
// waits until the frame is out before it updates that copy.
static volatile u8 tx_busy;
static u8 tx_hdr[6], tx_tail[2], tx_rows[18];
static u8 tx_stage, tx_pos, tx_nrows, tx_rowi;
static u16 tx_byte;
static u8 tx_next(u8 *out) {
  if (tx_stage == 0) { *out = tx_hdr[tx_pos++]; if (tx_pos == 6) { tx_stage = tx_nrows ? 1 : 2; tx_pos = 0; tx_rowi = 0; tx_byte = 0; } return 1; }
  if (tx_stage == 1) {
    u8 ty = tx_rows[tx_rowi];
    if (tx_byte == 0) *out = ty;
    else {   // the row bytes live in cartridge RAM bank 3; switch there and back to the drawing's bank
      SWITCH_RAM(PREV_BANK);
      *out = PREV[(u16)ty * 320 + tx_byte - 1];
      SWITCH_RAM(gb_curbank);
    }
    if (++tx_byte == 321) { tx_byte = 0; if (++tx_rowi == tx_nrows) tx_stage = 2; }
    return 1;
  }
  if (tx_stage == 2) { *out = tx_tail[tx_pos++]; if (tx_pos == 2) tx_stage = 3; return 1; }
  return 0;
}
static void sio(void) {
  u8 b;
  if (!tx_busy) return;            // a synchronous xfer() handles its own byte
  rx(SB_REG);
  if (tx_next(&b)) { SB_REG = b; SC_REG = 0x81; }
  else tx_busy = 0;
}
static void tx_wait(void) { while (tx_busy) ; }

void gen_phase(u8 phase) {
  u8 ty, r, x, nchanged = 0, b0;
  u16 i, psum = 0;
  tx_wait();
  in_upload = 1;
  // convert every tile row, keep only the rows that changed
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
    if (diff) {
      tx_rows[nchanged++] = ty;
      set_data(tile_addr((u16)ty * 20), tilerow, 320);
      if (linkmode) { psum += ty; for (i = 0; i < 320; i++) psum += tilerow[i]; }
    }
  }
  // queue the frame: phase, count, then (row index, 320 bytes) per changed row; the interrupt sends it
  if (linkmode) {
    u16 len = 2 + (u16)nchanged * 321;
    psum += phase; psum += nchanged;
    tx_hdr[0] = 0x7E; tx_hdr[1] = 'P'; tx_hdr[2] = (u8)len; tx_hdr[3] = (u8)(len >> 8); tx_hdr[4] = phase; tx_hdr[5] = nchanged;
    tx_tail[0] = (u8)psum; tx_tail[1] = (u8)(psum >> 8);
    tx_nrows = nchanged; tx_stage = 0; tx_pos = 0;
    tx_next(&b0);
    tx_busy = 1;
    SB_REG = b0; SC_REG = 0x81;
  }
  force_full = 0;
  in_upload = 0;
  phase_now = phase;
  phase_seq++;
}

// ---------------------------------------------------------------- screens around the drawing

#define CARD_FRAMES 90           // commission card, 1.5 s
#define SHOW_FRAMES 10750        // a finished piece stays up 3 minutes, then the screensaver
#define SAVER_FRAMES 300         // the screensaver text moves every 5 s
static u16 last_n;

static void center_text(u8 ty, const char *s, u8 fg, u8 bg) { vtext((u8)((20 - strlen(s)) / 2), ty, s, fg, bg); }

// Shown the moment a commission arrives, before the sky is drawn: the camera sees the number and seed.
static void card(u32 seed, u16 n) {
  char t[16], h[9];
  u8 len;
  vfill(3);
  t[0] = 'N'; t[1] = 'O'; t[2] = '.'; len = dec(t + 3, n);
  vbig((u8)((20 - (len + 3) * 2) / 2), 4, t, 0, 3);
  hex8(h, seed);
  t[0] = 'S'; t[1] = 'E'; t[2] = 'E'; t[3] = 'D'; t[4] = ' '; memcpy(t + 5, h, 9);
  center_text(9, t, 1, 3);
  center_text(12, "DRAWING NOW", 0, 3);
  center_text(16, "SLOW HORIZONS", 2, 3);
}

// Screensaver: dark screen, soft text that jumps to a new place every few seconds, so no part of the
// LCD shows the same thing for long (the DMG's LCD is not known to burn in (verify), but a moving screen
// also tells the stream the console is alive).
static void saver(u8 step) {
  static const u8 X[8] = { 3, 6, 1, 5, 2, 7, 4, 0 };
  static const u8 Y[8] = { 2, 9, 5, 12, 3, 10, 7, 13 };
  u8 x = X[step & 7], y = Y[(step >> 3 ^ step) & 7];
  char t[16];
  vfill(3);
  vtext(x, y, "SLOW HORIZONS", 1, 3);
  if (last_n) { memcpy(t, "LAST NO.", 8); dec(t + 8, last_n); vtext(x, y + 2, t, 2, 3); }
  else vtext(x, y + 2, "READY", 2, 3);
}

static void draw(u32 seed, u16 n) {
  u8 i;
  u16 f0;
  seed_now = seed;
  force_full = 1;
  mail[5] = 1;
  card(seed, n);
  f0 = frames; while ((u16)(frames - f0) < CARD_FRAMES) wait_vbl_done();
  strip(seed, n);
  SHOW_WIN;
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
  HIDE_WIN;   // the finished piece is shown whole
  tx_wait();  // the last phase's frame goes out first
  if (linkmode) {
    frame_start('D', 6);
    for (i = 0; i < 4; i++) put((u8)(seed >> (i * 8)));
    put((u8)f0); put((u8)(f0 >> 8));
    frame_end();
  }
  last_n = n;
  mail[5] = 0;
}

void main(void) {
  u8 y, i, saving = 1, step = 0;
  u16 since, next;
  const char *hello = "HORIZON1";
  ENABLE_RAM;
  for (y = 0; y < 144; y++) { gb_rowbank[y] = y / ROWS_PER_BANK; gb_rowptr[y] = (u8 *)0xA000 + (u16)(y % ROWS_PER_BANK) * 160; }
  screen_init();
  SWITCH_RAM(PREV_BANK); gb_curbank = PREV_BANK;
  for (i16 k = 0; k < 18 * 320; k++) PREV[k] = 0;
  frame_start('H', 8);
  for (i = 0; i < 8; i++) put((u8)hello[i]);
  frame_end();
  since = next = frames;
  while (1) {
    if (mail[4]) {
      mail[4] = 0;
      if (mail[8]) linkmode = 1;
      draw((u32)mail[0] | ((u32)mail[1] << 8) | ((u32)mail[2] << 16) | ((u32)mail[3] << 24), (u16)mail[6] | ((u16)mail[7] << 8));
      saving = 0; since = frames;
    } else if (pending) {
      pending = 0;
      draw(pending_seed, pending_n);
      saving = 0; since = frames;
    } else {
      xfer(0x00);   // idle poll, about 1 ms; keeps the link (and the heartbeat measurement) going
      if (!saving && (u16)(frames - since) > SHOW_FRAMES) { saving = 1; next = frames; }
      if (saving && (i16)(frames - next) >= 0) { saver(step++); next = frames + SAVER_FRAMES; }
    }
  }
}
