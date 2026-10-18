// gb-seed-lab generator: the ten 1/1 scenes ("Ten Horizons"). Each is a hand-made scene drawn with the same machinery
// as the main collection (sky, light, layered ridges with rim light, snow, mist, water mirror), plus its own landmark
// and props. Everything here is a function of x and y (no random numbers), so the banner pass continues each scene
// sideways with care instead of extending ridges at random. Never reachable from a public mint: gen_special is set
// only by the admin path (server) or a separate frame (Game Boy).
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

enum { SP_FUJI = 1, SP_GATE, SP_SAHARA, SP_MILKY, SP_EARTH, SP_LANTERNS, SP_BALLOONS, SP_WHALE, SP_AURORA };

// palette, time, sky, terrain, ground, weather, layers, snowcaps, extras
static const u8 SPT[SP_N][9] = {
  { PAL_SP + 0, T_DAWN,   S_SUN,    R_PEAKS,   G_LAKE,      W_CLEAR, 4, 1, X_BIRDS },      // 1 Fuji at First Light
  { PAL_SP + 1, T_DUSK,   S_LOWSUN, R_HILLS,   G_SEA,       W_CLEAR, 3, 0, 0 },            // 2 The Floating Gate
  { PAL_SP + 2, T_NIGHT,  S_FULL,   R_DUNES,   G_DESERT,    W_CLEAR, 4, 0, X_SHOOTING },   // 3 Sahara Caravan
  { PAL_SP + 3, T_NIGHT,  S_NEW,    R_PEAKS,   G_LAKE,      W_CLEAR, 3, 0, X_SHOOTING },   // 4 Under the Milky Way
  { PAL_SP + 4, T_NIGHT,  S_NEW,    R_HILLS,   G_SNOWFIELD, W_CLEAR, 3, 0, 0 },            // 5 Earthrise
  { PAL_SP + 5, T_NIGHT,  S_NEW,    R_HILLS,   G_LAKE,      W_CLEAR, 3, 0, 0 },            // 6 Sky Lanterns
  { PAL_SP + 6, T_DAWN,   S_LOWSUN, R_HILLS,   G_DESERT,    W_CLEAR, 4, 0, 0 },            // 7 Balloons at Sunrise
  { PAL_SP + 7, T_NIGHT,  S_FULL,   R_ISLANDS, G_SEA,       W_CLEAR, 3, 0, 0 },            // 8 Moonlit Whale
  { PAL_SP + 8, T_NIGHT,  S_NEW,    R_PEAKS,   G_SNOWFIELD, W_CLEAR, 3, 1, 0 },            // 9 Aurora Cabin
};

u8 sp_clouds(void) GEN_BANKED { return gen_special == SP_FUJI || gen_special == SP_GATE; }

void sp_traits(traits_t *tt) GEN_BANKED {
  const u8 *s = SPT[gen_special - 1];
  tt->palette = s[0]; tt->time = s[1]; tt->sky = s[2]; tt->terrain = s[3]; tt->ground = s[4];
  tt->weather = s[5]; tt->layers = s[6]; tt->snowcaps = s[7]; tt->extras = s[8];
}

// horizon (wet scenes) and where the sun or moon sits
void sp_horizon(void) GEN_BANKED {
  static const u8 HZ[SP_N] = { 98, 92, 144, 104, 144, 100, 144, 100, 144 };
  horizon = HZ[gen_special - 1];
  skyBottom = wet ? horizon : GEN_HEIGHT * 80 / 100;
}

// ---------------------------------------------------------------- shapes

static u16 hsh(i16 x, i16 y) { u16 h = (u16)x * 31337u ^ (u16)y * 17863u ^ 0x5a3cu; h ^= h >> 7; h *= 0x2c1bu; h ^= h >> 9; h *= 0x9e37u; return h ^ (h >> 8); }
// gentle natural roughness: a few sines, amplitude a px
static i16 rough(i16 x, i16 a, u8 ph) {
  return (i16)(((i32)a * (SINA(x * 9 / 2 + ph) * 3 + SINA(x * 23 / 2 + ph * 3) * 2 + SINA(x * 41 / 2 + ph * 7))) / (127 * 6));
}
// smooth bump 0..256 at distance d of half-width w: (1 - u^2)^2
static i16 bump(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 0;
  u = (i32)d * 256 / w; u = 256 - u * u / 256;
  return (i16)(u * u / 256);
}
// concave volcano flank: 0 at the summit, 256 at the foot (steep high, gentle low)
static i16 flank(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 256;
  u = (i32)d * 256 / w;
  return (i16)(u * (512 - u) / 256);
}
// integer square root for small values
// a pillar: near-vertical sides, a rounded top
static i16 tower(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 0;
  u = (i32)d * 256 / w;
  if (u < 150) return 256 - (i16)(u * u / 600);
  return (i16)((256 - u) * 220 / 106);
}
static i16 isq(i16 v) { i16 r = 0; while ((i16)((r + 1) * (r + 1)) <= v) r++; return r; }

// fairy chimneys of the balloon scene, far to near
static const i16 FCX[3][9] = { { -126, -92, -48, -10, 30, 66, 112, 176, 240 }, { -110, -60, -20, 18, 132, 150, 200, 262, 300 }, { -120, -70, 4, 154, 186, 240, 290, 330, 400 } };
static const u8 FCW[3] = { 4, 6, 9 }, FCH[3] = { 16, 30, 44 }, FCB[3] = { 108, 128, 146 };
static i16 sp_y(i16 l, i16 x) {   // ridge line of layer l at column x, in px from the top (SENT = none)
  i16 hz = horizon - 1, k;
  switch (gen_special) {
    case SP_FUJI:
      if (l == 0) return 64 + rough(x + 300, 4, 11) - bump(x - 10, 60) / 32 - bump(x - 170, 70) / 28;
      if (l == 1) { i16 d = x - 80, tp = 24; if (iabs(d) <= 5) return tp + iabs(d) / 4 + (d == 0 ? 1 : 0); return tp + 1 + (i16)((i32)(hz - tp - 1) * flank(iabs(d) - 5, 96) / 256) + rough(x, 1, 3); }
      if (l == 2) return hz - 2 - bump(x + 4, 44) / 14 - bump(x - 156, 40) / 16 - bump(x + 110, 60) / 18 - bump(x - 250, 60) / 18 + rough(x, 1, 40);   // shores at the sides, open water under the mountain
      return hz - bump(x - 6, 26) / 16 - bump(x - 152, 22) / 22 - bump(x + 120, 60) / 24 - bump(x - 220, 70) / 26;
    case SP_GATE:   // Misen's soft ridge across the bay
      if (l == 1) return hz - 8 - bump(x - 20, 60) / 14 - bump(x - 150, 50) / 18 - bump(x + 90, 80) / 13 - bump(x - 250, 70) / 14 + rough(x, 2, 5);   // darker: the middle layer
      return SENT;
    case SP_SAHARA: {   // dune crests
      static const u8 LAM[4] = { 70, 90, 120, 160 }, BY[4] = { 82, 92, 104, 120 }, AM[4] = { 8, 12, 16, 18 }, PH[4] = { 7, 41, 90, 13 };
      i16 lam = LAM[l], s = (i16)(((i32)(x + 1000 + PH[l] * 3) % lam) * 256 / lam), wv = s < 180 ? (i16)((i32)s * 256 / 180) : (i16)((i32)(256 - s) * 256 / 76);
      wv = (i16)((i32)wv * wv / 256);
      return BY[l] - (i16)((i32)AM[l] * wv / 256) + rough(x, 1, PH[l]);
    }
    case SP_MILKY: {   // one dark silhouette: sharp ranges low on the horizon, a little shore in front (the tent's)
      static const i16 MX[7] = { -110, -40, 6, 44, 138, 200, 262 };
      static const u8 MW[7] = { 66, 48, 56, 30, 54, 64, 50 }, MH[7] = { 18, 12, 16, 6, 20, 14, 17 };
      i16 v = 0;
      if (l < 2) return SENT;
      for (k = 0; k < 7; k++) { i16 d = x - MX[k], sk = k % 2 ? 10 : -8, f = k % 3 ? bump(d + (d < 0 ? sk : 0), MW[k]) : 256 - flank(d, MW[k] * 2 / 3); v = imax(v, (i16)((i32)f * MH[k] / 256)); }
      v = imax(v, 2 + bump(x - 108, 22) / 64);
      return hz - v + rough(x, 2, 12) / 2;
    }
    case SP_EARTH:   // the curved lunar horizon, crater rims beyond, a dusty foreground
      if (l == 0) return 86 + (i16)((i32)(x - 80) * (x - 80) / 2400) - bump(x - 30, 22) / 40 - bump(x - 150, 30) / 34 - bump(x + 80, 30) / 32 + rough(x, 1, 9);
      if (l == 1) return SENT;
      return 112 + (i16)((i32)(x - 80) * (x - 80) / 1600) + rough(x, 1, 71);
    case SP_LANTERNS:   // low hills across a dark lake
      if (l == 1) return hz - 6 - bump(x - 40, 60) / 22 - bump(x - 150, 50) / 24 - bump(x + 90, 70) / 20 - bump(x - 260, 60) / 22 + rough(x, 2, 17);   // dark hills across the water
      return SENT;
    case SP_BALLOONS: {   // fairy chimneys (cones topped with dark rock caps) along ridges; a valley in front
      i16 v = 0;
      if (l == 0) return SENT;   // no far ridge: its valley mist read as pale blocks
      for (k = 0; k < 9; k++) v = imax(v, (i16)((i32)tower(x - FCX[l - 1][k], FCW[l - 1] + (k * 3) % 4) * (FCH[l - 1] + (k * 7) % 9) / 256));
      return FCB[l - 1] - v - (l == 1 ? bump(x - 80, 140) / 30 : l == 2 ? bump(x - 30, 70) / 22 + bump(x - 140, 60) / 26 + bump(x + 80, 70) / 24 + bump(x - 230, 70) / 24 : 0) + rough(x, l == 2 ? 2 : 1, (u8)(l * 37));
    }
    case SP_WHALE:   // open sea; a faint far coast in the banner only
      if (bump(x - 240, 34)) return hz - imax(bump(x - 230, 16) / 22, bump(x - 252, 22) / 40) - bump(x - 240, 34) / 128 + rough(x, 1, 19);   // islands: two humps each, not a lens
      if (bump(x + 76, 28)) return hz - imax(bump(x + 82, 13) / 30, bump(x + 66, 16) / 46) - bump(x + 76, 28) / 128 + rough(x, 1, 29);
      return SENT;
    case SP_AURORA:   // snowy peaks far off, a dark forest line, the snowfield
      if (l == 0) return SENT;
      if (l == 1) return 92 - bump(x - 40, 40) / 9 - bump(x - 130, 36) / 8 - bump(x + 60, 50) / 9 - bump(x - 220, 46) / 8 + rough(x, 3, 21);
      return 122 + rough(x, 1, 83) - bump(x - 80, 60) / 40;
  }
  return hz;
}

// layer profile for the current special scene into hgt[] (1/8 px)
u8 sp_profile(i16 l) GEN_BANKED {
  i16 x;
  for (x = GX0; x < GX1; x++) {
    i16 y = sp_y(l, x);
    if (y == SENT) { hgt[IX(x)] = SENT; continue; }
    y = clampi(y, 6, wet ? horizon - 1 : GEN_HEIGHT - 1);
    hgt[IX(x)] = y * 8;
  }
  return 1;
}

// ---------------------------------------------------------------- sky pieces (drawn in the sky phase)

// smooth value noise 0..255 on a grid of `cell` px (bilinear between hashed corners)
static i16 vnoise(i16 x, i16 y, i16 cell, i16 salt) {
  i16 cx = (i16)((x + 4096) / cell), cy = (i16)((y + 4096) / cell), fx = (i16)((i32)((x + 4096) % cell) * 256 / cell), fy = (i16)((i32)((y + 4096) % cell) * 256 / cell);
  i16 a = (i16)(hsh(cx, cy + salt) & 255), b = (i16)(hsh(cx + 1, cy + salt) & 255), c = (i16)(hsh(cx, cy + 1 + salt) & 255), d = (i16)(hsh(cx + 1, cy + 1 + salt) & 255);
  i16 top = a + (i16)((i32)(b - a) * fx / 256), bot = c + (i16)((i32)(d - c) * fx / 256);
  return top + (i16)((i32)(bot - top) * fy / 256);
}
// the Milky Way rising from the horizon: a broad glow with a bright bulge at its foot, clumpy star clouds, the dark
// Great Rift splitting it, ragged dust patches, and a star field that thickens toward it (a function of x and y)
static void galaxy(void) {
  i16 x, y, x0 = 34, y0 = horizon + 4, dx = 112, dy = -(horizon + 20);
  i32 len = 112 + (i32)(horizon + 20) * (horizon + 20) / 300;
  for (y = 0; y < horizon; y++) for (x = GX0; x < GX1; x++) {
    i32 n = (i32)(x - x0) * dy - (i32)(y - y0) * dx, al = (i32)(x - x0) * dx + (i32)(y - y0) * dy;
    i16 sd = (i16)(n / len), along = (i16)(al / len), w, b, clouds, rift, glow, bx, by;
    i16 wob = 6 * SINA(along * 2 + 30) / 127 + 3 * SINA(along * 5) / 127 - (i16)((i32)along * along / 900);   // a gentle arch
    w = 30 + along / 6 + (vnoise(along, 0, 24, 3) - 128) / 12;   // wider and more ragged higher up
    b = bump(sd + wob, w);
    clouds = vnoise(x, y, 9, 11);   // clumpy star clouds
    b = (i16)((i32)b * (96 + clouds) / 352);
    bx = x - (x0 + 14); by = y - (horizon - 4);
    { i32 r2 = (i32)bx * bx + (i32)by * by * 2; glow = r2 < 2116 ? bump(isq((i16)r2), 46) : 0; }   // the bulge near the horizon
    b += glow / 2;
    rift = sd + wob - (4 * SINA(along * 4 + 60) / 127 + 2 * SINA(along * 9) / 127 - 3);   // the Great Rift, wandering along the band
    if (b > 40 && iabs(rift) < 2 + (vnoise(along, 9, 14, 7) > 150 ? 2 : 0) + (along < 40 ? 1 : 0)) b = b / 4;
    if (b > 40 && vnoise(x + 300, y, 6, 23) < 52) b = b * 2 / 3;   // ragged dust patches
    if (b > 0) addT(x, y, -(i16)((i32)b * 120 / 256));
    { u16 h = hsh(x, y); if ((h & 1023) < 3 + (u16)b / 4) setStar(x, y, (h >> 12) > 12 || b > 170 ? 0 : 1); }
  }
}
// the Earth as Apollo 8 saw it: lit from the left, deep blue ocean, a brown-grey continent, white cloud bands
// swirling across, a soft terminator; the night side is just black (no ring)
static void earth(i16 cx, i16 cy, i16 r) {
  i16 x, y;
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) {
    i16 d2 = x * x + y * y, term, land, swirl, s;
    if (d2 > r * r) continue;
    term = x - r * 3 / 10 - y / 6;   // > 0: night
    if (term > 1) continue;
    land = vnoise(x * 3 + 40, y * 3, 9, 5);
    swirl = SINA(y * 9 + SINA(x * 8 + y * 2) / 3 + x * 3);   // latitude streaks that bend
    s = 2;
    if (land > 176) s = 1;   // a continent
    if (swirl > 96 || vnoise(x * 4, y * 4, 5, 19) > 214) s = 0;   // white cloud bands and puffs
    if (term > -4 && ((x + y) & 1)) s = s == 0 ? 2 : 3;   // the terminator, dithered soft
    if (term > -1) s = 3;
    if (d2 > (r - 1) * (r - 1) && x < -r / 2) s = 0;   // the bright limb toward the sun
    setH(cx + x, cy + y, (u8)s);
  }
}
// a giant aurora: two curtains with rays, brightest low
static void aurora_big(void) {   // two folded curtains: a bright sharp lower hem, rays streaming up and fading
  i16 x, y, k;
  for (k = 0; k < 2; k++) for (x = GX0; x < GX1; x++) {
    i16 hem = (k ? 26 : 44) + (k ? 5 : 7) * SINA(x * (k ? 3 : 2) + (k ? 90 : 20)) / 127 + 4 * SINA(x * 6 + k * 50) / 127;
    i16 len = (k ? 22 : 34) + 12 * SINA(x * 5 / 2 + k * 70) / 127, I, top = hem - len;
    I = (k ? 110 : 170) + (vnoise(x, k * 50, 3, 41 + k) - 128) / 2 + (vnoise(x, k * 70, 17, 43 + k) - 128) / 2;   // rays and slower folds
    if (I < 0) I = 0;
    for (y = imax(0, top); y <= hem + 9 && y < skyBottom; y++) {
      i16 f = (i16)((i32)(y - top) * 256 / (len + 1)), pr = y > hem ? 150 - (y - hem) * 15 : (i16)((i32)f * f / 256);   // brightest at the hem, a soft glow below it
      addT(x, y, -(i16)((i32)I * pr / 256 * 150 / 256));
    }
  }
}

void sp_light(void) GEN_BANKED {
  static const i16 LP[SP_N][3] = {   // x, y, radius
    { 112, 38, 8 },    // Fuji: a small morning sun beside the summit, clear of the branch
    { 80, 62, 17 },    // the gate: the sun sets behind it
    { 118, 30, 14 },   // Sahara: a big full moon
    { -400, 10, 6 },   // the Milky Way: no moon
    { -400, 10, 6 },   // Earthrise: the Earth is drawn on its own
    { -400, 10, 6 },   // lanterns: no moon, the lanterns are the light
    { 132, 82, 12 },   // balloons: the sun just up
    { 84, 56, 30 },    // whale: a huge full moon
    { -400, 10, 6 },   // aurora: no moon
  };
  const i16 *p = LP[gen_special - 1];
  lx = p[0]; ly = p[1]; lrad = p[2];
  side = 1;
  if (gen_special == SP_MILKY) galaxy();
  if (gen_special == SP_EARTH) { i16 y; for (y = 0; y < skyBottom; y++) fill_row(y, 199); earth(110, 40, 22); }   // no air: a black sky to the horizon   // no air: a black sky
  if (gen_special == SP_AURORA) aurora_big();
}

// ---------------------------------------------------------------- props

static void hline(i16 x0, i16 x1, i16 y, u8 s) { i16 x; for (x = x0; x <= x1; x++) setH(x, y, s); }
static void vline(i16 x, i16 y0, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) setH(x, y, s); }
static void rect(i16 x0, i16 y0, i16 x1, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) hline(x0, x1, y, s); }
static i16 ground_y(i16 l, i16 x) { i16 y = sp_y(l, x); return y == SENT ? horizon : y; }
static void halo(i16 cx, i16 cy, i16 r, i16 a) {   // a soft light, lighter toward the middle
  i16 x, y, r2 = r * r;
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) { i16 d2 = x * x + y * y; if (d2 < r2) addT(cx + x, cy + y, -(i16)((i32)a * (r2 - d2) / r2)); }
}

// a little house: w wide, walls hw high, a steep roof, an optional lit window
static void house(i16 x, i16 gy, i16 w, i16 hw, u8 lit) {
  i16 y, k;
  rect(x - w, gy - hw, x + w, gy, 3);
  for (y = 0; y <= w + 1; y++) hline(x - w - 1 + y, x + w + 1 - y, gy - hw - y, 3);
  for (k = -w - 1; k <= 0; k++) setH(x + k, gy - hw - (k + w + 1), 2);   // a lighter roof edge
  if (lit) { setH(x - 1, gy - hw / 2, 0); setH(x, gy - hw / 2, 0); setH(x - 1, gy - hw / 2 + 1, 1); setH(x, gy - hw / 2 + 1, 1); }
}
// a dromedary walking right (dir 1) or left: one hump, long legs, an S-shaped neck, the head held level; a rider on
// the hump; a lead rope back to the camel behind. Feet on gy, x = the middle of the body.
static void camel(i16 x, i16 gy, i16 dir, u8 rider) {
  static const char *const C[16] = {
    "                   ",
    "             ###   ",
    "            ###### ",
    "            ### ## ",
    "           ###     ",
    "    ##     ##      ",
    "   ####   ###      ",
    "  ######  ##       ",
    " ###########       ",
    "############       ",
    "# #########        ",
    "  ## ##  ## ##     ",
    "  #  #    #  #     ",
    "  #  #    #  #     ",
    "  #   #   #   #    ",
    " ##  ##  ##  ##    " };
  i16 r, c;
  for (r = 0; r < 16; r++) for (c = 0; c < 19; c++) if (C[r][c] == '#') setH(x + dir * (c - 7), gy - 15 + r, 3);
  if (rider) {   // a rider in a head wrap, sitting on the hump
    for (r = 0; r < 5; r++) for (c = -1; c <= 1; c++) setH(x + dir * (-2 + c), gy - 15 + r, 3);   // body, on the hump
    setH(x + dir * -2, gy - 17, 3); setH(x + dir * -2, gy - 16, 3); setH(x + dir * -3, gy - 16, 3); setH(x + dir * -1, gy - 16, 3);   // wrapped head
    setH(x + dir * 0, gy - 13, 3); setH(x + dir * 1, gy - 12, 3);   // an arm holding the rein
  }
}
// one cherry blossom: five petals around a light centre (3x3, the corners left out)
static void flower(i16 x, i16 y, u8 v) {
  setH(x, y, 0);
  setH(x - 1, y, 1); setH(x + 1, y, 1); setH(x, y - 1, 1); setH(x, y + 1, 1);
  if (v & 1) setH(x + 1, y + 1, 1); else setH(x - 1, y - 1, 1);
}
// a cherry branch: enters from beyond the frame at xs (it starts outside the picture, so it never floats), sags
// toward xe, thins, sends twigs down, flowers in clusters along it. A function of x: the banner continues it exactly.
static void cherry(i16 xs, i16 ys, i16 xe, i16 sag) {
  i16 dir = xe > xs ? 1 : -1, n = iabs(xe - xs), k, x, y, th;
  for (k = 0; k <= n; k++) {
    x = xs + dir * k;
    y = ys + (i16)((i32)sag * k * k / ((i32)n * n)) + SINA(x * 6) / 90;
    th = 3 - k * 3 / (n + 1);   // 3 px at the frame, 1 px at the tip
    vline(x, y, y + th - 1, 3);
    if (th >= 2) setH(x, y - 1, 2);   // bark catching the light on top
    if (k > 6 && (hsh(x, 5) & 15) < 5) {   // a twig hanging down to a cluster
      i16 tl = 3 + (i16)(hsh(x, 6) % 6), j, tx = x, ty = y + th;
      for (j = 0; j < tl; j++) { if (j % 2) tx += dir; setH(tx, ty + j, 3); }
      ty += tl;
      for (j = 0; j < 10; j++) { u16 h = hsh(x + j * 7, 9); flower(tx + (i16)(h % 9) - 4, ty + (i16)((h >> 4) % 7) - 3, (u8)(h >> 9)); }
    }
    if ((hsh(x, 3) & 3) == 0) { u16 h = hsh(x, 4); flower(x + (i16)(h % 3) - 1, y - 2 - (i16)((h >> 3) % 3), (u8)(h >> 7)); }   // flowers sitting on the branch
    if ((hsh(x, 8) & 31) == 0 && k > 10) setH(x + 2, y + 9 + (i16)(hsh(x, 2) % 14), 1);   // a falling petal
  }
}
// the great torii standing in the sea (Itsukushima's ryobu style: each main pillar braced by two smaller legs),
// drawn after the water with its own broken reflection
static void torii(i16 x, i16 base, i16 ht) {
  i16 w = ht * 6 / 10, k, y;
  for (k = -1; k <= 1; k += 2) {
    i16 px = x + k * w / 2, j;
    rect(px - 2, base - ht, px + 2, base, 3); rect(px - 3, base - 2, px + 3, base, 3);   // main pillar and its foot
    for (j = -1; j <= 1; j += 2) vline(px + j * 5, base - ht * 30 / 100, base, 3);   // the bracing legs
    hline(px - 5, px + 5, base - ht * 30 / 100, 3);   // their tie beam
  }
  rect(x - w / 2 - 4, base - ht + 7, x + w / 2 + 4, base - ht + 9, 3);   // nuki
  hline(x - w / 2 - 6, x + w / 2 + 6, base - ht - 1, 3);   // shimaki under the top beam
  for (k = -w / 2 - 10; k <= w / 2 + 10; k++) {   // kasagi, sweeping up at both ends
    i16 e = iabs(k) > w / 2 - 2 ? (iabs(k) - w / 2 + 2) * (iabs(k) - w / 2 + 2) / 36 : 0;
    vline(x + k, base - ht - 5 - e, base - ht - 2 - e / 2, 3);
  }
  rect(x - 2, base - ht + 1, x + 2, base - ht + 6, 3); setH(x, base - ht + 3, 2);   // the name plaque (gakuzuka)
  for (y = 1; y < 14; y++) for (k = -1; k <= 1; k += 2) {   // a broken reflection of the pillars
    i16 px = x + k * w / 2 + SINA(y * 50) / 64;
    if (y % 3) hline(px - 2, px + 2, base + y, y > 8 ? 2 : 3);
  }
}
// a pagoda silhouette (banner sides)
static void pagoda(i16 x, i16 gy, u8 tiers) {
  i16 k, w;
  for (k = 0; k < tiers; k++) {
    i16 y = gy - k * 6;
    w = 6 - k;
    rect(x - w + 2, y - 4, x + w - 2, y, 3);
    hline(x - w - 1, x + w + 1, y - 5, 3); setH(x - w - 2, y - 6, 3); setH(x + w + 2, y - 6, 3);
  }
  vline(x, gy - tiers * 6 - 6, gy - tiers * 6, 3);
}
// a tent glowing from inside, with a warm halo
static void tent(i16 x, i16 gy) {
  i16 y, k;
  for (y = -12; y <= 5; y++) for (k = -20; k <= 20; k++) { i16 d2 = k * k + y * y * 4; if (d2 < 400) addT(x + k, gy - 4 + y, -(i16)(80 * (400 - d2) / 400)); }
  for (y = 0; y < 9; y++) { hline(x - y - 1, x + y + 1, gy - 9 + y, y < 8 ? 1 : 3); setH(x - y - 2, gy - 9 + y, 3); setH(x + y + 2, gy - 9 + y, 3); }
  vline(x, gy - 12, gy - 10, 3);
  for (y = 3; y < 9; y++) for (k = -(y - 3) / 2; k <= (y - 3) / 2; k++) setH(x + k, gy - 9 + y, 0);   // the open door
}
// a small figure standing, head tilted up at the sky, one arm pointing
static void person(i16 x, i16 gy) {
  vline(x - 1, gy - 3, gy, 3); vline(x + 1, gy - 3, gy, 3);   // legs
  rect(x - 2, gy - 8, x + 2, gy - 4, 3);   // coat
  rect(x - 1, gy - 11, x + 1, gy - 9, 3); setH(x + 1, gy - 12, 3);   // head, tipped back
  setH(x + 3, gy - 8, 3); setH(x + 4, gy - 9, 3); setH(x + 5, gy - 10, 3); setH(x + 6, gy - 11, 3);   // pointing up
}
// a pine
static void pine(i16 x, i16 gy, i16 ht) {
  i16 y, k;
  vline(x, gy - ht, gy, 3);
  for (y = 3; y < ht; y++) { i16 w = (ht - y) * 2 / 5 + (y % 4 == 0 ? 1 : 0); for (k = -w; k <= w; k++) setH(x + k, gy - y, 3); }
}
// a paper sky lantern rising, size s 1..3: taller than wide, a little wider at the top, the flame glowing at its
// open bottom, a small soft glow around it
static void lantern(i16 x, i16 y, i16 s) {
  i16 h = 2 * s + 2, r;
  halo(x, y + s, 2 + s * 2, 22 + s * 7);
  for (r = 0; r <= h; r++) { i16 w = s - (r * 2 > h ? 1 : 0) + (s == 1 ? 0 : 0); hline(x - w, x + w, y - h / 2 + r, r == h ? 0 : 1); }
  if (s > 1) { setH(x, y + h / 2 - 1, 0); setH(x - 1, y + h / 2 - 1, 0); }   // the flame
  hline(x - s, x + s, y - h / 2, 2);   // the top fold
}
// a hot air balloon: striped envelope, basket, ropes
static void balloon(i16 x, i16 y, i16 r, u8 pat) {
  i16 dy, dx;
  for (dy = -r; dy <= r + r / 2; dy++) {
    i16 w = dy <= 0 ? isq(r * r - dy * dy) : (i16)((i32)(r + r / 2 - dy) * (isq(r * r - (dy * dy) / 2) + 1) / (r + r / 2));
    for (dx = -w; dx <= w; dx++) {
      i16 g = (i16)((i32)(dx + w) * 6 / (2 * w + 1));
      u8 s = (u8)((g + pat) % 2 ? 1 : (dx < -w / 2 ? 1 : 0));
      if (dx > w * 2 / 3) s = 2;   // the shaded side
      if (dx == -w || dx == w) s = 3;
      setH(x + dx, y + dy, s);
    }
  }
  for (dy = 1; dy <= 3; dy++) { setH(x - r / 4 - 1, y + r + r / 2 + dy, 3); setH(x + r / 4 + 1, y + r + r / 2 + dy, 3); }
  rect(x - r / 4 - 1, y + r + r / 2 + 4, x + r / 4 + 1, y + r + r / 2 + 6, 3);
}
// a humpback breaching, belly to us: a long spindle body rising from the water, the head tapering to a knobbly
// rostrum, throat pleats, and the huge scalloped pectoral fins thrown out (pale undersides, dark leading edge)
static void fin(i16 ax, i16 ay, i16 n, i16 dir, i16 lift) {
  i16 f, j;
  for (f = 0; f <= n; f++) {
    i16 fx = ax + dir * f, fy = ay + (i16)((i32)f * lift / 16) + f * f / 90;
    i16 w = f < 3 ? 3 + f : 6 - (i16)((i32)(f - 3) * 5 / (n - 2));   // a narrow root, broad blade, tapering tip
    for (j = 0; j <= w; j++) setH(fx, fy + j, j == 0 || j == w ? 3 : 1);   // dark edges, the pale underside between
    if (f % 4 == 2 && f < n - 3) setH(fx, fy - 1, 3);   // the scalloped leading edge
  }
}
static i16 wh_th(i16 u) {   // body half-width at u (0 = the water, 256 = the rostrum tip)
  i16 v;
  if (u < 150) return 5 + (i16)((i32)u * 6 / 150);
  v = (i16)((i32)(256 - u) * 256 / 106);
  return 3 + (i16)((i32)8 * (65536L - (i32)(256 - v) * (256 - v)) / 65536L);
}
static void whale(i16 x0, i16 y0) {
  i16 k, n = 64, pass, ax = 0, ay = 0, ath = 0;
  for (pass = 0; pass < 2; pass++) for (k = 0; k <= n; k++) {
    i16 u = (i16)((i32)k * 256 / n), th = wh_th(u), dx, dy;
    i16 cx = x0 + (i16)((i32)k * 26 / n) - (i16)((i32)SINA(k * 128 / n) * 4 / 127), cy = y0 - (i16)((i32)k * 64 / n);
    if (!pass) { for (dy = -th; dy <= th; dy++) for (dx = -th; dx <= th; dx++) if (dx * dx + dy * dy <= th * th) setH(cx + dx, cy + dy, 3); continue; }
    if (u > 160 && u < 236) { setH(cx - th * 2 / 3, cy, 2); setH(cx - th / 4, cy, 2); setH(cx + th / 6, cy, 2); }   // throat pleats, moonlit
    if (u > 212 && k % 3 == 0) setH(cx + th - 2, cy, 2);   // knobs on the rostrum
    if (k == n * 66 / 100) { ax = cx; ay = cy; ath = th; }
    if (k == n * 80 / 100) { setH(cx - th + 2, cy + 1, 2); }   // the eye, at the corner of the mouth
  }
  fin(ax - ath + 2, ay + 1, 22, -1, 9);   // the near fin flung out and down, past the moon's edge
  fin(ax + ath - 2, ay - 2, 13, 1, -7);    // the far fin raised behind the body
}
// soft dithered maria on a full moon, darker toward the upper left (the stock craters read as squares on big moons)
static void maria(i16 cx, i16 cy, i16 r) {
  i16 x, y, c = imax(4, r * 11 / 30);
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) if (x * x + y * y < (r - 1) * (r - 1)) {
    i16 m = vnoise(x + 40, y + 40, c, 61) + (x < 0 ? 18 : -10) + (y < 0 ? 10 : -8);
    setH(cx + x, cy + y, m > 178 && ((x + y) & 1) ? 1 : 0);
  }
}

// before the water: things on the ground or the shore (they reflect)
void sp_features(void) GEN_BANKED {
  i16 k, gy;
  switch (gen_special) {
    case SP_FUJI:   // a lakeside house with its light on; in the banner the Chureito pagoda on the left hill
      house(32, ground_y(3, 32), 5, 5, 1);
#ifndef __SDCC
      if (WIDE) { pagoda(-84, ground_y(2, -84) + 1, 5); house(-30, ground_y(3, -30), 4, 4, 1); house(230, ground_y(3, 230), 4, 4, 0); }
#endif
      break;
    case SP_SAHARA:   // a caravan along the near-middle crest
      maria(118, 30, 14);
      for (k = 0; k < 5; k++) {   // nose to tail, each tied to the one ahead
        i16 cx = 28 + k * 24, j;
        camel(cx, ground_y(2, cx), 1, (u8)(k == 4));
        if (k) { i16 y0 = ground_y(2, cx - 24) - 12, y1 = ground_y(2, cx) - 6; for (j = cx - 13; j <= cx - 8; j++) setH(j, y0 + (y1 - y0) * (j - cx + 13) / 5, 3); }   // the lead rope: from the one behind's nose to this one's saddle
      }
#ifndef __SDCC
      if (WIDE) { for (k = 1; k <= 5; k++) { i16 cx = -18 - (k - 1) * 24;   // wholly left of the piece, so no head pokes past its edge
        camel(cx, ground_y(2, cx), 1, (u8)(k == 5)); } for (k = 0; k < 4; k++) { i16 cx = 206 + k * 24; camel(cx, ground_y(2, cx), 1, (u8)(k == 3)); } }
#endif
      break;
    case SP_MILKY:   // a glowing tent on the shore and someone looking up
      tent(108, ground_y(2, 108));
      person(90, ground_y(2, 90));
#ifndef __SDCC
      if (WIDE) pine(-84, ground_y(2, -84) + 1, 20);
#endif
      break;
    case SP_LANTERNS: {   // lanterns rising over the lake (they reflect), a boat releasing one
      i16 x;
      for (x = GX0 + 3; x < GX1 - 3; x += 6) {
        u16 h = hsh(x, 77);
        i16 y = 6 + (i16)((i32)(h % 74) * (h % 74) / 74), s = y > 58 ? 3 : y > 30 ? 2 : 1, xx = x + (i16)((h >> 8) % 4);
        if ((h >> 4) % 3 == 0) continue;   // gaps, so it reads as a drift, not a grid
        if (y > horizon - 18) y = horizon - 18 - (i16)((h >> 3) % 24);   // never a row of them on one line
        lantern(xx, y, s);
        if ((h >> 6) % 3 == 0) lantern(xx + 2, y - 14 - (i16)((h >> 10) % 10), s > 1 ? s - 1 : 1);
      }
      for (k = -8; k <= 8; k++) { setH(70 + k, horizon - 1, 3); if (iabs(k) < 7) setH(70 + k, horizon - 2, 3); }   // the boat
      setH(62, horizon - 3, 3); setH(78, horizon - 3, 3);
      person(68, horizon - 3); lantern(73, horizon - 20, 2);
      break;
    }
    case SP_BALLOONS:   // dark caps on the chimneys, then balloons drifting at different heights
      for (gy = 1; gy <= 3; gy++) for (k = 0; k < 9; k++) {
        i16 cx = FCX[gy - 1][k], w = FCW[gy - 1] + (k * 3) % 4, ty = sp_y(gy, cx);
        if ((k + gy) % 3 == 0 || gy == 1) continue;   // not every chimney has a cap; the far ones are lost in the haze
        { i16 hw = w * 3 / 4 + 1, sh = gy == 1 ? 2 : 3;   // a mushroom cap wider than the shaft, toned with its layer
          hline(cx - hw, cx + hw, ty, sh); hline(cx - hw, cx + hw, ty + 1, sh); hline(cx - hw + 1, cx + hw - 1, ty - 1, sh); hline(cx - hw + 2, cx + hw - 2, ty - 2, sh); }
      }
      balloon(56, 30, 14, 0); balloon(110, 50, 9, 1); balloon(28, 56, 6, 1); balloon(142, 26, 6, 0); balloon(86, 80, 4, 1);
#ifndef __SDCC
      if (WIDE) { balloon(-40, 36, 8, 1); balloon(-96, 58, 5, 0); balloon(-120, 22, 4, 1); balloon(210, 40, 9, 0); balloon(260, 64, 5, 1); balloon(236, 18, 4, 0); }
#endif
      break;
    case SP_WHALE:   // the whale breaching in front of the moon (its reflection follows in the water)
      maria(84, 56, 30);
      whale(62, horizon + 3);
      break;
    case SP_AURORA:   // the cabin, windows lit, pines around, light spilling on the snow
      {   // snow on the far peaks: lit faces toward the aurora, shaded ones dithered, gullies running down
        i16 x, y;
        for (x = GX0 + 1; x < GX1 - 1; x++) {
          i16 tp = sp_y(1, x), sl = sp_y(1, x + 1) - sp_y(1, x - 1), dep = (i16)((i32)imax(0, 82 - tp) * (130 + vnoise(x, 5, 3, 71)) / 300);   // none on the low saddles
          for (y = tp; y < tp + dep; y++) { u8 sh = sl <= 0 ? 0 : 1; if (sl > 0 && ((x + y) & 1)) sh = 2; if (y > tp + dep - 3 && ((x + y) & 1)) continue; setH(x, y, sh); }
        }
      }
      gy = ground_y(2, 84);
      halo(84, gy + 4, 30, 70);
      house(84, gy, 12, 10, 0);
      rect(77, gy - 7, 79, gy - 5, 0); rect(89, gy - 7, 91, gy - 5, 0); rect(83, gy - 6, 85, gy, 1);   // windows and the door
      vline(93, gy - 26, gy - 18, 3); vline(94, gy - 26, gy - 19, 3);   // chimney
      for (k = 0; k < 10; k++) {   // chimney smoke drifting right, thinning as it rises
        i16 cx = 94 + k * 2 + k * k / 5, cy = gy - 28 - k * 3, r = 1 + k / 2, dx, dy;
        for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && (k < 3 || ((cx + dx + cy + dy) & 1)) && (k < 7 || ((cy + dy) & 1))) setH(cx + dx, cy + dy, k < 4 ? 0 : 1);
      }
      pine(34, ground_y(2, 34), 24); pine(46, ground_y(2, 46) + 1, 18); pine(124, ground_y(2, 124), 26); pine(138, ground_y(2, 138), 17); pine(12, ground_y(2, 12), 14);
#ifndef __SDCC
      if (WIDE) { for (k = 0; k < 6; k++) pine(-120 + k * 19, ground_y(2, -120 + k * 19), 14 + (k * 5) % 12); for (k = 0; k < 6; k++) pine(176 + k * 21, ground_y(2, 176 + k * 21), 13 + (k * 7) % 13); }
#endif
      break;
  }
}

// after the water and weather, before dithering: foreground (no reflection)
void sp_after(void) GEN_BANKED {
  i16 x, y, k;
  switch (gen_special) {
    case SP_FUJI:   // a cherry branch entering from the top right
      cherry(300, 0, 114, 18);   // from beyond the right edge of the banner, so it enters the piece and the banner from the frame
#ifndef __SDCC
      if (WIDE) cherry(GX0 - 4, 1, -74, 16);   // and a second one entering the banner from the left
#endif
      break;
    case SP_GATE:   // the gate in the sea, the sun behind it
      torii(80, horizon + 20, 46);
#ifndef __SDCC
      if (WIDE) pagoda(-74, ground_y(1, -74) + 2, 5);
#endif
      break;
    case SP_EARTH: {   // craters (lit rims, the wall toward the sun in shadow), the lander, the flag, footprints
      static const i16 CX[7] = { 26, 66, 120, 148, 48, 98, 8 }, CY[7] = { 128, 137, 124, 139, 117, 116, 140 }, CR[7] = { 10, 14, 8, 9, 5, 6, 7 };
      for (k = 0; k < 7; k++) {
        i16 cx = CX[k], cy = CY[k], r = CR[k], b = r / 3 + 1;
        for (y = -b - 1; y <= b + 1; y++) for (x = -r - 1; x <= r + 1; x++) {
          i32 e = (i32)x * x * b * b + (i32)y * y * r * r, rr = (i32)r * r * b * b, ro = (i32)(r + 1) * (r + 1) * (b + 1) * (b + 1);
          if (e <= rr * 55 / 100) { if (x < -r / 3 + y) setH(cx + x, cy + y, 3); else if (x < r / 4) setH(cx + x, cy + y, 2); }   // floor: shadow under the near wall
          else if (e <= rr) setH(cx + x, cy + y, x < 0 ? 2 : 0);   // inner wall: dark toward the sun, lit across
          else if ((i32)x * x * (b + 1) * (b + 1) + (i32)y * y * (r + 1) * (r + 1) <= ro && x > 0) setH(cx + x, cy + y, 0);   // the raised rim, lit
        }
      }
      {   // the lander's descent stage: a foil box on four splayed legs
        i16 lx0 = 132, ly0 = 112;
        rect(lx0 - 4, ly0 - 6, lx0 + 4, ly0 - 2, 1); hline(lx0 - 4, lx0 + 4, ly0 - 6, 0); vline(lx0 + 4, ly0 - 6, ly0 - 2, 2);
        for (k = 0; k < 4; k++) { setH(lx0 - 5 - k, ly0 - 2 + k, 3); setH(lx0 + 5 + k, ly0 - 2 + k, 3); }
        hline(lx0 - 10, lx0 - 8, ly0 + 2, 3); hline(lx0 + 8, lx0 + 10, ly0 + 2, 3);
        vline(lx0, ly0 - 1, ly0 + 1, 3);
      }
      vline(92, 104, 122, 3); rect(93, 104, 103, 109, 0); hline(93, 103, 106, 1); hline(93, 103, 108, 1); rect(93, 104, 96, 106, 2);   // the flag
      for (k = 0; k < 10; k++) { setH(89 - k * 4, 124 + k * 2, 2); setH(91 - k * 4, 125 + k * 2, 2); }   // footprints back to the lander's side
#ifndef __SDCC
      if (WIDE) for (k = 0; k < 5; k++) {   // more craters across the plain
        i16 cx = k < 3 ? -112 + k * 34 : 196 + (k - 3) * 52, cy = 116 + (k * 9) % 22, r = 6 + (k * 5) % 7, b = r / 3 + 1;
        for (y = -b; y <= b; y++) for (x = -r; x <= r; x++) { i32 e = (i32)x * x * b * b + (i32)y * y * r * r, rr = (i32)r * r * b * b; if (e <= rr) setH(cx + x, cy + y, e > rr * 55 / 100 ? (x < 0 ? 2 : 0) : (x < -r / 3 + y ? 3 : 2)); }
      }
#endif
      break;
    }
    case SP_WHALE:   // spray and the splash where it leaves the water
      for (k = 0; k < 90; k++) {
        u16 h = hsh(k, 31);
        i16 sx = 48 + (i16)(h % 36), sy = horizon - (i16)((h >> 6) % ((h & 3) ? 10 : 22));
        setH(sx, sy, (h >> 12) > 9 ? 0 : 1);
      }
      for (x = 40; x < 100; x++) { i16 a = SINA((x - 40) * 4 + 10); if (a > 0) for (y = 0; y < a / 50 + 1; y++) setH(x, horizon + 1 - y + ((x * 3) % 2), (x + y) % 3 ? 0 : 1); }
#ifndef __SDCC
      if (WIDE) for (k = 0; k < 3; k++) { i16 bx = -60 + k * 9; setH(bx, horizon - 2, 3); setH(bx + 1, horizon - 3, 3); setH(bx + 2, horizon - 2, 3); vline(bx + 1, horizon - 8, horizon - 4, 1); }   // far off, another whale's back and spout
#endif
      break;
  }
}
