// Banner (PC and web only, never on the Game Boy): the exact piece in the middle of a 432x144 picture, with the
// same scene continued sideways. The normal pass draws the piece and records its ridges and sky parameters; the
// wide pass (columns -136..295) replays them and extends the ridges past both edges; then the piece is pasted back
// in the middle, so the centre is pixel-identical to the minted piece.
#include "gen_int.h"

#define BANNER_W 432
#define BANNER_X0 (-136)   // a multiple of 8, so the dither pattern lines up with the piece

u8 *gen_platform_buffer(void);   // the platform's pixel buffer (row stride = GX1 - GX0)

void gen_banner(u32 seed, u8 *out, traits_t *tr) {
  u8 *buf = gen_platform_buffer();
  i16 x, y;
  GX0 = 0; GX1 = GEN_W; WIDE = 0;
  gen_draw(seed, tr);
  for (y = 0; y < GEN_HEIGHT; y++) for (x = 0; x < GEN_W; x++) out[y * BANNER_W + x - BANNER_X0] = buf[y * GEN_W + x];
  GX0 = BANNER_X0; GX1 = BANNER_X0 + BANNER_W; WIDE = 1;
  gen_draw(seed, tr);
  for (y = 0; y < GEN_HEIGHT; y++) for (x = 0; x < BANNER_W; x++) {
    i16 px = BANNER_X0 + x;
    if (px < 0 || px >= GEN_W) out[y * BANNER_W + x] = buf[y * BANNER_W + x];
  }
  GX0 = 0; GX1 = GEN_W; WIDE = 0;
}
