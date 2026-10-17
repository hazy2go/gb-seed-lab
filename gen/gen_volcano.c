// gb-seed-lab generator: the volcano's plume and crater glow. Its own switchable ROM bank on the Game Boy
// (gen_ridges.c filled its bank).
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

// volcano top, drawn right after its own layer so nearer ridges cover it: a fading plume that leans away from the
// sun or moon and ends below the top edge, and at dusk or night a thin lava line in the crater with a soft glow.
// No randomness, so the banner pass draws exactly the same plume.
void draw_volcano(void) GEN_BANKED {
  u8 glow = night || t->time == T_DUSK || !vol_lit;   // in front of a dark sky (storm, overcast) it glows, or it would vanish
  i16 k, x, y, dir = lx > volx ? -1 : 1, dy = clampi((voly - 10) / 7, 2, 5);   // little room above the crater: a flatter plume
  u8 cone = inb(volx, voly + 3) ? px_get(volx, voly + 3) : HARD;
  smoke_sun = 1;   // a crater in front of the sun still smokes from its top
  for (k = 0; k < 9; k++) {
    i16 py = imax(voly - 2 - k * dy, 7 + k / 2), r = imin(imin(7, 2 + k * 5 / 8), py - 4), px = volx + dir * (k * k / 2 + k * (7 - dy) / 2) + imin(k, 2) * SINA(k * 37 + volx * 5) / 127, sk;
    sk = skyAt(py);   // with no room above, the plume spreads sideways under the top edge
    if (k < 3 && cone < HARD && cone > sk) sk = cone;   // over the cone the first puffs stay darker than the rock, never a pale patch on the crater
    smoke(px, py, r, glow ? sk - (vol_lit ? 24 : 40) : imin(184, sk + 76 - k * 3), 236 - k * 14);   // darkest at the crater, thinning as it rises
  }
  smoke_sun = 0;
  if (glow) {   // a thin lava line in the crater, brightest in the middle, and a soft glow around it
    for (x = -3; x <= 3; x++) {
      i16 y0 = hgt[IX(volx + x)] / 8;
      setH(volx + x, y0, iabs(x) <= 1 ? 0 : 1);
      if (iabs(x) <= 1) setH(volx + x, y0 + 1, 1);
    }
    for (y = voly - 14; y < voly + 10; y++) for (x = volx - 16; x < volx + 16; x++) {
      i16 d2 = (x - volx) * (x - volx) + (y - voly) * (y - voly);   // < 16^2 + 14^2
      if (d2 < 256) addT(x, y, -(i16)(64 * (256 - d2) / 256));
    }
  }
}
