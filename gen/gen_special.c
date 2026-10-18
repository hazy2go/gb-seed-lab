// gb-seed-lab generator: the ten 1/1 scenes ("Ten Horizons"). Each is a hand-made scene drawn with the same machinery
// as the main collection (sky, light, layered ridges with rim light, snow, mist, water mirror), plus its own landmark
// and props. Everything here is a function of x and y (no random numbers), so the banner pass continues each scene
// sideways with care instead of extending ridges at random. Never reachable from a public mint: gen_special is set
// only by the admin path (server) or a separate frame (Game Boy).
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

enum { SP_FUJI = 1, SP_GATE, SP_SAHARA, SP_MILKY, SP_EARTH, SP_LANTERNS, SP_BALLOONS, SP_WHALE, SP_AURORA, SP_TREE };

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
  { PAL_SP + 8, T_AURORA, S_NEW,    R_PEAKS,   G_SNOWFIELD, W_CLEAR, 3, 1, 0 },            // 9 Aurora Cabin
  { PAL_SP + 9, T_NIGHT,  S_FULL,   R_HILLS,   G_MEADOW,    W_CLEAR, 3, 0, 0 },            // 10 Lone Tree
};

u8 sp_clouds(void) GEN_BANKED { return gen_special == SP_FUJI || gen_special == SP_GATE || gen_special == SP_BALLOONS; }

void sp_traits(traits_t *tt) GEN_BANKED {
  const u8 *s = SPT[gen_special - 1];
  tt->palette = s[0]; tt->time = s[1]; tt->sky = s[2]; tt->terrain = s[3]; tt->ground = s[4];
  tt->weather = s[5]; tt->layers = s[6]; tt->snowcaps = s[7]; tt->extras = s[8];
}

// horizon (wet scenes) and where the sun or moon sits
void sp_horizon(void) GEN_BANKED {
  static const u8 HZ[SP_N] = { 98, 92, 144, 104, 144, 100, 144, 100, 144, 144 };
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

static i16 sp_y(i16 l, i16 x) {   // ridge line of layer l at column x, in px from the top (SENT = none)
  i16 hz = horizon - 1, k;
  switch (gen_special) {
    case SP_FUJI:
      if (l == 0) return 64 + rough(x + 300, 4, 11) - bump(x - 10, 60) / 32 - bump(x - 170, 70) / 28;
      if (l == 1) { i16 d = x - 80, tp = 24; if (iabs(d) <= 5) return tp + iabs(d) / 4 + (d == 0 ? 1 : 0); return tp + 1 + (i16)((i32)(hz - tp - 1) * flank(iabs(d) - 5, 96) / 256) + rough(x, 1, 3); }
      if (l == 2) return hz - 9 - bump(x + 10, 50) / 22 - bump(x - 150, 46) / 20 + rough(x, 2, 40);
      return hz - 3 - bump(x - 4, 26) / 16 - bump(x + 120, 60) / 22 - bump(x - 220, 70) / 24 + rough(x, 1, 90);
    case SP_GATE:   // Misen's soft ridge across the bay
      if (l == 0) return hz - 10 - bump(x - 20, 60) / 14 - bump(x - 150, 50) / 18 - bump(x + 90, 80) / 13 - bump(x - 250, 70) / 14 + rough(x, 2, 5);
      return SENT;
    case SP_SAHARA: {   // dune crests
      static const u8 LAM[4] = { 70, 90, 120, 160 }, BY[4] = { 82, 92, 104, 120 }, AM[4] = { 8, 12, 16, 18 }, PH[4] = { 7, 41, 90, 13 };
      i16 lam = LAM[l], s = (i16)(((i32)(x + 1000 + PH[l] * 3) % lam) * 256 / lam), wv = s < 180 ? (i16)((i32)s * 256 / 180) : (i16)((i32)(256 - s) * 256 / 76);
      wv = (i16)((i32)wv * wv / 256);
      return BY[l] - (i16)((i32)AM[l] * wv / 256) + rough(x, 1, PH[l]);
    }
    case SP_MILKY:   // dark ranges low on the horizon, a lake, a little shore
      if (l == 0) return SENT;
      if (l == 1) return hz - 8 - bump(x - 128, 34) / 14 - bump(x + 4, 44) / 18 - bump(x - 240, 54) / 15 - bump(x + 104, 56) / 14 + rough(x, 3, 12);
      return hz - 2 - bump(x - 112, 26) / 40 - bump(x + 84, 40) / 28 + rough(x, 1, 81);
    case SP_EARTH:   // the curved lunar horizon, crater rims beyond, a dusty foreground
      if (l == 0) return 86 + (i16)((i32)(x - 80) * (x - 80) / 2400) - bump(x - 30, 22) / 40 - bump(x - 150, 30) / 34 - bump(x + 80, 30) / 32 + rough(x, 1, 9);
      if (l == 1) return SENT;
      return 112 + (i16)((i32)(x - 80) * (x - 80) / 1600) + rough(x, 1, 71);
    case SP_LANTERNS:   // low hills across a dark lake
      if (l == 0) return hz - 7 - bump(x - 40, 60) / 24 - bump(x - 150, 50) / 26 - bump(x + 90, 70) / 22 - bump(x - 260, 60) / 24 + rough(x, 2, 17);
      if (l == 1) return hz - 3 - bump(x - 120, 30) / 40 - bump(x + 40, 40) / 36 - bump(x - 230, 40) / 36 + rough(x, 1, 50);
      return SENT;
    case SP_BALLOONS: {   // a long ridge with fairy chimneys: rounded pillars, some with dark caps; a valley in front
      static const i16 PX[2][9] = { { -126, -92, -48, -10, 30, 66, 112, 176, 240 }, { -110, -60, -20, 18, 132, 150, 200, 262, 300 } };
      static const u8 PW[2] = { 4, 6 }, PHT[2] = { 16, 30 }, BASE[2] = { 108, 128 };
      i16 v = 0;
      if (l == 0) return 94 + rough(x, 2, 3) - bump(x - 60, 90) / 36 - bump(x + 100, 70) / 40;
      if (l == 3) return 140 + rough(x, 1, 91) - bump(x - 80, 120) / 40;
      for (k = 0; k < 9; k++) v = imax(v, (i16)((i32)tower(x - PX[l - 1][k], PW[l - 1] + (k * 3) % 4) * (PHT[l - 1] + (k * 7) % 9) / 256));
      return BASE[l - 1] - v - bump(x - 80, 140) / 30 + rough(x, 1, (u8)(l * 37));
    }
    case SP_WHALE:   // open sea; a faint far coast in the banner only
      if (bump(x - 240, 50)) return hz - bump(x - 240, 50) / 40;
      if (bump(x + 90, 40)) return hz - bump(x + 90, 40) / 46;
      return SENT;
    case SP_AURORA:   // snowy peaks far off, a dark forest line, the snowfield
      if (l == 0) return SENT;
      if (l == 1) return 92 - bump(x - 40, 40) / 9 - bump(x - 130, 36) / 8 - bump(x + 60, 50) / 9 - bump(x - 220, 46) / 8 + rough(x, 3, 21);
      return 122 + rough(x, 1, 83) - bump(x - 80, 60) / 40;
    case SP_TREE:   // one soft hill, the meadow
      if (l == 0) return 116 + rough(x, 1, 13) - bump(x - 200, 80) / 50 - bump(x + 60, 80) / 50;
      if (l == 1) return 118 + rough(x, 1, 31);
      return 104 + (i16)((i32)(256 - bump(x - 64, 110)) * 30 / 256) + rough(x, 1, 7);
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

// the Milky Way's core rising from the horizon: a bright band, a dark dust lane, dense stars
static void galaxy(void) {
  i16 x, y, x0 = 22, y0 = horizon, dx = 128, dy = -(horizon + 12);
  i32 len = 128 + (i32)(horizon + 12) * (horizon + 12) / 256;
  for (y = 0; y < horizon; y++) for (x = GX0; x < GX1; x++) {
    i32 n = (i32)(x - x0) * dy - (i32)(y - y0) * dx, al = (i32)(x - x0) * dx + (i32)(y - y0) * dy;
    i16 sd = (i16)(n / len), along = (i16)(al / len), w = 26 + along / 10, b, lane;
    b = bump(sd + 3 * SINA(along * 3) / 127, w);
    b = b + bump(sd, w / 3) / 2;
    if (b > 0) addT(x, y, -(i16)((i32)b * 118 / 384));
    lane = 2 * SINA(along * 5 + 40) / 127 - 1 + SINA(along * 11) / 64;
    if (b > 110 && iabs(sd - lane) < 2 + (along % 7 == 0 ? 1 : 0)) addT(x, y, 60);
    { u16 h = hsh(x, y); if ((h & 1023) < 4 + (u16)b / 6) setStar(x, y, (h >> 12) > 11 ? 0 : 1); }
  }
}
// the Earth, lit from the left: oceans, continents, cloud streaks, a thin bright limb
static void earth(i16 cx, i16 cy, i16 r) {
  i16 x, y;
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) {
    i16 d2 = x * x + y * y, land, cloud;
    if (d2 > r * r) continue;
    if (x > r * 3 / 10 + y / 8) { setH(cx + x, cy + y, d2 > (r - 1) * (r - 1) ? 2 : 3); continue; }   // night side, a faint limb
    land = SINA(x * 9 + y * 4 + 30) + SINA(x * 5 - y * 11 + 90) + SINA(y * 7 + 10) / 2;
    cloud = SINA(x * 3 + y * 17 + 50) + SINA(x * 13 - y * 5);
    setH(cx + x, cy + y, cloud > 170 ? 0 : land > 90 ? 1 : 2);
    if (d2 > (r - 1) * (r - 1) && x < 0) setH(cx + x, cy + y, 0);
  }
}
// a giant aurora: two curtains with rays, brightest low
static void aurora_big(void) {
  i16 x, y, k;
  for (k = 0; k < 2; k++) for (x = GX0; x < GX1; x++) {
    i16 yb = (k ? 34 : 12) + (k ? 10 : 14) * SINA(x * (k ? 3 : 2) + (k ? 90 : 20)) / 127 + 5 * SINA(x * 7 + k * 50) / 127;
    i16 len = (k ? 30 : 40) + 10 * SINA(x * 5 / 2 + k * 70) / 127, ray = SINA(x * 23 + k * 40), I;
    I = 70 + (i16)((i32)ray * ray / 220) - k * 18;
    for (y = imax(0, yb); y < yb + len && y < skyBottom; y++) {
      i16 f = (i16)((i32)(y - yb) * 256 / len), pr = f > 200 ? (256 - f) * 4 : f < 40 ? f * 3 + 136 : 256 - (f - 40) / 3;
      addT(x, y, -(i16)((i32)I * pr / 256 * 96 / 256));
    }
  }
}

void sp_light(void) GEN_BANKED {
  static const i16 LP[SP_N][3] = {   // x, y, radius
    { 128, 22, 8 },    // Fuji: a small morning sun beside the summit
    { 80, 62, 17 },    // the gate: the sun sets behind it
    { 118, 30, 14 },   // Sahara: a big full moon
    { -400, 10, 6 },   // the Milky Way: no moon
    { -400, 10, 6 },   // Earthrise: the Earth is drawn on its own
    { -400, 10, 6 },   // lanterns: no moon, the lanterns are the light
    { 132, 82, 12 },   // balloons: the sun just up
    { 84, 56, 30 },    // whale: a huge full moon
    { -400, 10, 6 },   // aurora: no moon
    { 104, 58, 30 },   // lone tree: an enormous moon behind the tree
  };
  const i16 *p = LP[gen_special - 1];
  lx = p[0]; ly = p[1]; lrad = p[2];
  side = 1;
  if (gen_special == SP_MILKY) galaxy();
  if (gen_special == SP_EARTH) { i16 y; for (y = 0; y < skyBottom; y++) fill_row(y, 199 - y / 6); earth(110, 40, 22); }   // no air: a black sky
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
// a camel: body, hump, neck, head, four legs (dir 1 walks right)
static void camel(i16 x, i16 gy, i16 dir, u8 rider) {
  static const i8 BODY[] = { -5, -4, -3, -2, -1, 0, 1, 2, 3, 4 };
  i16 k, y;
  for (k = 0; k < 10; k++) { i16 bx = x + dir * BODY[k], top = gy - 9 - (k >= 2 && k <= 6 ? (k == 4 ? 3 : 2) : 0); vline(bx, top, gy - 6, 3); }
  for (k = 0; k < 4; k++) { i16 lx0 = x + dir * (k < 2 ? -4 + k * 2 : 2 + (k - 2) * 2); vline(lx0, gy - 5, gy, 3); }
  for (y = 0; y < 6; y++) setH(x + dir * (5 + y / 2), gy - 8 - y, 3);   // neck
  hline(imin(x + dir * 8, x + dir * 10), imax(x + dir * 8, x + dir * 10), gy - 14, 3);   // head
  setH(x + dir * 10, gy - 13, 3);
  if (rider) { vline(x, gy - 16, gy - 12, 3); setH(x - 1, gy - 15, 3); setH(x + 1, gy - 15, 3); setH(x, gy - 17, 3); }
}
// cherry blossom branch from (x0,y0), going dir, n segments
static void blossom(i16 x0, i16 y0, i16 dir, u8 n, u8 ph) {
  i16 k, x = x0, y = y0;
  for (k = 0; k < n; k++) {
    i16 nx = x + dir * 3, ny = y + (SINA(k * 40 + ph) > 30 ? 1 : 0), j;
    for (j = 0; j < 3; j++) { setH(x + dir * j, y + (j == 2 ? ny - y : 0), 3); if (k < n / 2) setH(x + dir * j, y + 1, 3); }
    if (k % 3 == 1) {   // a twig going down with a cluster
      i16 tx = x + dir, ty = y;
      for (j = 0; j < 4; j++) { tx += (j % 2) * dir; ty++; setH(tx, ty, 3); }
      for (j = -3; j <= 3; j++) { i16 c; for (c = -3 + iabs(j) / 2; c <= 3 - iabs(j) / 2; c++) if ((c * 7 + j * 3 + k + 40) % 5) setH(tx + c, ty + 2 + j, (c + j + k) % 4 ? 1 : 0); }
    }
    if (k % 2 == 0) { for (j = -2; j <= 2; j++) { i16 c; for (c = -2 + iabs(j) / 2; c <= 2 - iabs(j) / 2; c++) if ((c * 5 + j + k + 20) % 4) setH(x + c, y - 2 + j, (c + k) % 3 ? 1 : 0); } }
    x = nx; y = ny;
  }
}
// a torii gate standing in the sea (drawn after the water, with its own reflection)
static void torii(i16 x, i16 base, i16 ht) {
  i16 w = ht * 6 / 10, k, y;
  for (k = -1; k <= 1; k += 2) { i16 px = x + k * w / 2; rect(px - 2, base - ht, px + 2, base, 3); rect(px - 3, base - 2, px + 3, base, 3); }
  rect(x - w / 2 - 4, base - ht + 6, x + w / 2 + 4, base - ht + 8, 3);   // nuki
  for (k = -w / 2 - 9; k <= w / 2 + 9; k++) {   // kasagi, rising at both ends
    i16 e = iabs(k) > w / 2 ? (iabs(k) - w / 2) / 3 : 0;
    vline(x + k, base - ht - 4 - e, base - ht - 1 - e / 2, 3);
  }
  vline(x, base - ht + 1, base - ht + 6, 3); setH(x - 1, base - ht + 3, 3); setH(x + 1, base - ht + 3, 3);   // gakuzuka
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
// a small figure standing, looking up at the sky
static void person(i16 x, i16 gy) {
  rect(x - 1, gy - 7, x + 1, gy - 3, 3); vline(x - 1, gy - 2, gy, 3); vline(x + 1, gy - 2, gy, 3);
  rect(x - 1, gy - 10, x + 1, gy - 8, 3); setH(x, gy - 11, 3); setH(x + 1, gy - 11, 3);
}
// a pine
static void pine(i16 x, i16 gy, i16 ht) {
  i16 y, k;
  vline(x, gy - ht, gy, 3);
  for (y = 3; y < ht; y++) { i16 w = (ht - y) * 2 / 5 + (y % 4 == 0 ? 1 : 0); for (k = -w; k <= w; k++) setH(x + k, gy - y, 3); }
}
// a paper lantern rising, size s 1..3, with its glow
static void lantern(i16 x, i16 y, i16 s) {
  halo(x, y, 4 + s * 3, 40 + s * 12);
  rect(x - s, y - s - 1, x + s, y + s + 1, 1);
  if (s > 1) rect(x - s + 1, y - s, x + s - 1, y + s, 0); else setH(x, y, 0);
  hline(x - s, x + s, y + s + 2, 2);
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
// a whale breaching: body along a curve from the water up to the head, a long pectoral fin
static void whale(i16 x0, i16 y0) {
  i16 k, n = 36;
  for (k = 0; k <= n; k++) {
    i16 cx = x0 + k * 30 / n + SINA(k * 4) / 64, cy = y0 - k * 58 / n, th = 3 + (i16)((i32)SINA(k * 112 / n) * 8 / 127) + (k > n - 6 ? -(k - (n - 6)) / 2 : 0), dx, dy;
    for (dy = -th; dy <= th; dy++) for (dx = -th; dx <= th; dx++) if (dx * dx + dy * dy <= th * th) setH(cx + dx, cy + dy, 3);
    if (k > 6 && k < n - 6 && k % 3 == 0) setH(cx - th + 2, cy + 1, 2);   // ventral grooves, catching the moonlight
  }
  for (k = 0; k < 18; k++) { i16 fx = x0 + 18 + k * 9 / 10, fy = y0 - 30 + k * 5 / 6; setH(fx, fy, 3); setH(fx + 1, fy, 3); if (k < 12) setH(fx, fy + 1, 3); }   // pectoral fin
  setH(x0 + 26, y0 - 52, 1);   // an eye glint
}
// a broad tree with a swing (the lone tree)
static void bigtree(i16 x, i16 gy) {
  static const i8 CX[9] = { -22, -12, 0, 12, 22, -16, 6, 18, -4 }, CY[9] = { -30, -40, -46, -40, -30, -48, -54, -48, -36 }, CR[9] = { 9, 11, 12, 11, 9, 9, 10, 8, 10 };
  i16 y, k;
  for (y = 0; y < 26; y++) { i16 w = 2 + (y < 4 ? (4 - y) : 0) + (y > 18 ? (y - 18) / 2 : 0); hline(x - w, x + w, gy - y, 3); }
  for (k = 0; k < 14; k++) { setH(x - 3 - k, gy - 22 - k / 2, 3); setH(x - 3 - k, gy - 23 - k / 2, 3); setH(x + 3 + k, gy - 21 - k * 2 / 3, 3); setH(x + 3 + k, gy - 22 - k * 2 / 3, 3); }   // boughs
  for (k = 0; k < 9; k++) {   // the crown: overlapping rounded clumps
    i16 cx = x + CX[k], cy = gy + CY[k], r = CR[k], dx, dy;
    for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r - ((hsh(cx + dx, cy + dy) & 7) < 2 ? r : 0)) setH(cx + dx, cy + dy, 3);
  }
  vline(x + 13, gy - 20, gy - 7, 2); vline(x + 19, gy - 22, gy - 7, 2); hline(x + 12, x + 20, gy - 6, 3);   // the swing
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
      for (k = 0; k < 5; k++) { i16 cx = 34 + k * 22; camel(cx, ground_y(2, cx), 1, (u8)(k == 0)); }
#ifndef __SDCC
      if (WIDE) { for (k = 1; k <= 5; k++) { i16 cx = 34 - k * 22; camel(cx, ground_y(2, cx), 1, 0); } for (k = 0; k < 4; k++) { i16 cx = 200 + k * 22; camel(cx, ground_y(2, cx), 1, (u8)(k == 2)); } }
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
      for (x = GX0 + 3; x < GX1 - 3; x += 7) {
        u16 h = hsh(x, 77);
        i16 y = 8 + (i16)(h % 70), s = y > 56 ? 3 : y > 30 ? 2 : 1, xx = x + (i16)((h >> 8) % 5);
        if ((h >> 4) % 3 == 0) continue;   // gaps, so it reads as a drift, not a grid
        lantern(xx, y, s);
        if ((h >> 6) % 4 == 0) lantern(xx + 3, y + 18 + (i16)((h >> 10) % 12), s > 1 ? s - 1 : 1);
      }
      for (k = -6; k <= 6; k++) setH(70 + k, horizon - 1, 3);   // the boat
      for (k = -4; k <= 4; k++) setH(70 + k, horizon - 2, 3);
      person(68, horizon - 3); lantern(72, horizon - 18, 2);
      break;
    }
    case SP_BALLOONS:   // balloons drifting at different heights
      balloon(56, 30, 14, 0); balloon(110, 50, 9, 1); balloon(22, 66, 6, 1); balloon(142, 26, 6, 0); balloon(86, 80, 4, 1);
#ifndef __SDCC
      if (WIDE) { balloon(-40, 36, 8, 1); balloon(-96, 58, 5, 0); balloon(-120, 22, 4, 1); balloon(210, 40, 9, 0); balloon(260, 64, 5, 1); balloon(236, 18, 4, 0); }
#endif
      break;
    case SP_WHALE:   // the whale breaching in front of the moon (its reflection follows in the water)
      whale(64, horizon + 2);
      break;
    case SP_AURORA:   // the cabin, windows lit, pines around, light spilling on the snow
      gy = ground_y(2, 84);
      halo(84, gy + 4, 30, 70);
      house(84, gy, 12, 10, 0);
      rect(77, gy - 7, 79, gy - 5, 0); rect(89, gy - 7, 91, gy - 5, 0); rect(83, gy - 6, 85, gy, 1);   // windows and the door
      vline(93, gy - 26, gy - 18, 3); vline(94, gy - 26, gy - 19, 3);   // chimney
      for (k = 0; k < 7; k++) smoke(94 + k * 2 + k * k / 4, gy - 29 - k * 3, 1 + k / 2, skyAt(40) - 40, 236 - k * 24);
      pine(34, ground_y(2, 34), 24); pine(46, ground_y(2, 46) + 1, 18); pine(124, ground_y(2, 124), 26); pine(138, ground_y(2, 138), 17); pine(12, ground_y(2, 12), 14);
#ifndef __SDCC
      if (WIDE) { for (k = 0; k < 6; k++) pine(-120 + k * 19, ground_y(2, -120 + k * 19), 14 + (k * 5) % 12); for (k = 0; k < 6; k++) pine(176 + k * 21, ground_y(2, 176 + k * 21), 13 + (k * 7) % 13); }
#endif
      break;
    case SP_TREE:   // the tree on the hill, in front of the moon
      bigtree(60, ground_y(2, 60));
      break;
  }
}

// after the water and weather, before dithering: foreground (no reflection)
void sp_after(void) GEN_BANKED {
  i16 x, y, k;
  switch (gen_special) {
    case SP_FUJI:   // a cherry branch entering from the top right
      blossom(GEN_W + 40, 10, -1, 20, 9); blossom(GEN_W + 10, 2, -1, 9, 50);
#ifndef __SDCC
      if (WIDE) { blossom(-150, 12, 1, 16, 33); blossom(-140, 3, 1, 7, 71); }
#endif
      break;
    case SP_GATE:   // the gate in the sea, the sun behind it
      torii(80, horizon + 20, 46);
#ifndef __SDCC
      if (WIDE) pagoda(-74, ground_y(0, -74) + 2, 5);
#endif
      break;
    case SP_EARTH: {   // craters in the dust (left walls in shadow), a flag, footprints
      static const i16 CX[7] = { 28, 70, 118, 146, 50, 100, 10 }, CY[7] = { 128, 136, 124, 138, 118, 116, 140 }, CR[7] = { 10, 14, 8, 9, 5, 6, 7 };
      for (k = 0; k < 7; k++) {
        i16 cx = CX[k], cy = CY[k], r = CR[k], b = r / 3 + 1;
        for (y = -b; y <= b; y++) for (x = -r; x <= r; x++) {
          i32 e = (i32)x * x * b * b + (i32)y * y * r * r, rr = (i32)r * r * b * b;
          if (e > rr) continue;
          if (e > rr * 3 / 4) addT(cx + x, cy + y, x > 0 ? -40 : 30);
          else addT(cx + x, cy + y, x < 0 ? 70 : 10);
        }
      }
      vline(92, 106, 122, 3); rect(93, 106, 103, 111, 0); hline(93, 103, 108, 1); hline(93, 103, 110, 1); rect(93, 106, 96, 108, 2);   // the flag
      for (k = 0; k < 9; k++) { setH(88 - k * 5, 124 + k * 2, 2); setH(90 - k * 5, 126 + k * 2, 2); }   // footprints
#ifndef __SDCC
      if (WIDE) for (k = 0; k < 4; k++) { i16 cx = -100 + k * 30, cy = 120 + (k * 7) % 14, r = 6 + k % 3 * 3; for (x = -r; x <= r; x++) { addT(cx + x, cy, x < 0 ? 60 : -30); addT(cx + x, cy + 1, x < 0 ? 50 : 0); addT(220 + k * 25 + x, cy + 4, x < 0 ? 60 : -30); } }
#endif
      break;
    }
    case SP_WHALE:   // spray and the splash where it leaves the water
      for (k = 0; k < 90; k++) {
        u16 h = hsh(k, 31);
        i16 sx = 52 + (i16)(h % 40), sy = horizon - (i16)((h >> 6) % 18);
        setH(sx, sy, (h >> 12) > 9 ? 0 : 1);
      }
      for (x = 40; x < 100; x++) { i16 a = SINA((x - 40) * 4 + 10); if (a > 0) for (y = 0; y < a / 50 + 1; y++) setH(x, horizon + 1 - y + ((x * 3) % 2), (x + y) % 3 ? 0 : 1); }
#ifndef __SDCC
      if (WIDE) for (k = 0; k < 3; k++) { i16 bx = -60 + k * 9; setH(bx, horizon - 2, 3); setH(bx + 1, horizon - 3, 3); setH(bx + 2, horizon - 2, 3); vline(bx + 1, horizon - 8, horizon - 4, 1); }   // far off, another whale's back and spout
#endif
      break;
  }
}
