// gb-seed-lab generator: the ten 1/1 scenes ("Ten Horizons"; list, ids and the build plan in docs/ONE-OF-ONES.md). Each is a hand-made scene drawn with the same machinery
// as the main collection (sky, light, layered ridges with rim light, snow, mist, water mirror), plus its own landmark
// and props. Everything here is a function of x and y (no random numbers), so the banner pass continues each scene
// sideways with care instead of extending ridges at random. gen_special is set only by the server: by the fair
// rule in docs/ONE-OF-ONES.md during the mint (a flag byte in the start frame), or by the admin's leftover draw after it.
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

// On the Game Boy this file is compiled five times (gb/Makefile, -DSP_PART=0..4), each time keeping one part, so every
// part fits one 16 KB ROM bank: 0 = traits, ridge profile, sky and the dispatchers; 1 = Fuji, Gate, Milky Way, Whale;
// 2 = Shirakawa-go, Golden Pavilion; 3 = Ramen, Bamboo; 4 = Lighthouse, Lanterns. Small helpers are compiled into each
// part that needs them; sp_y and the per-scene functions are banked calls. The PC and WASM builds compile it once, whole.
#ifdef SP_PART
#define SP_ALL 0
#else
#define SP_ALL 1
#define SP_PART 0
#endif
#define SPP(n) (SP_ALL || SP_PART == (n))
i16 sp_y(i16 l, i16 x) GEN_BANKED;
void spf_fuji(void) GEN_BANKED;
void spf_village(void) GEN_BANKED;
void spf_kinkaku(void) GEN_BANKED;
void spf_ramen(void) GEN_BANKED;
void spf_milky(void) GEN_BANKED;
void spf_lanterns(void) GEN_BANKED;
void spf_whale(void) GEN_BANKED;
void spa_fuji(void) GEN_BANKED;
void spa_gate(void) GEN_BANKED;
void spa_ramen(void) GEN_BANKED;
void spa_storm(void) GEN_BANKED;
void spa_bamboo(void) GEN_BANKED;
void spa_kinkaku(void) GEN_BANKED;
void spa_whale(void) GEN_BANKED;

enum { SP_FUJI = 1, SP_GATE, SP_VILLAGE, SP_MILKY, SP_KINKAKU, SP_LANTERNS, SP_BAMBOO, SP_WHALE, SP_RAMEN, SP_STORM };

// palette, time, sky, terrain, ground, weather, layers, snowcaps, extras
#if SPP(0)
static const u8 SPT[SP_N][9] = {
  { PAL_SP + 0, T_DAWN,   S_SUN,      R_PEAKS,   G_LAKE,      W_CLEAR,    4, 1, X_BIRDS },      // 1 Fuji at First Light
  { PAL_SP + 1, T_DUSK,   S_LOWSUN,   R_HILLS,   G_SEA,       W_CLEAR,    3, 0, 0 },            // 2 The Floating Gate
  { PAL_SP + 2, T_NIGHT,  S_NEW,      R_PEAKS,   G_SNOWFIELD, W_SNOWFALL, 3, 1, 0 },            // 3 Shirakawa-go
  { PAL_SP + 3, T_NIGHT,  S_NEW,      R_PEAKS,   G_LAKE,      W_CLEAR,    3, 0, X_SHOOTING },   // 4 Under the Milky Way
  { PAL_SP + 4, T_DAY,    S_SUN,      R_HILLS,   G_LAKE,      W_CLEAR,    3, 0, 0 },            // 5 Golden Pavilion in Snow
  { PAL_SP + 5, T_NIGHT,  S_NEW,      R_HILLS,   G_LAKE,      W_CLEAR,    3, 0, 0 },            // 6 Sky Lanterns
  { PAL_SP + 6, T_DUSK,   S_NEW,      R_HILLS,   G_FOREST,    W_CLEAR,    3, 0, 0 },            // 7 Bamboo and Fireflies
  { PAL_SP + 7, T_NIGHT,  S_FULL,     R_ISLANDS, G_SEA,       W_CLEAR,    3, 0, 0 },            // 8 Moonlit Whale
  { PAL_SP + 8, T_NIGHT,  S_NEW,      R_HILLS,   G_LAKE,      W_RAIN,     3, 0, 0 },            // 9 Ramen in the Rain
  { PAL_SP + 9, T_NIGHT,  S_NEW,      R_ISLANDS, G_SEA,       W_CLEAR,    3, 0, 0 },            // 10 Lighthouse in the Storm
};
#endif

#if SPP(0)
u8 sp_clouds(void) GEN_BANKED { return gen_special == SP_FUJI || gen_special == SP_GATE; }
#endif

#if SPP(0)
void sp_traits(traits_t *tt) GEN_BANKED {
  const u8 *s = SPT[gen_special - 1];
  tt->palette = s[0]; tt->time = s[1]; tt->sky = s[2]; tt->terrain = s[3]; tt->ground = s[4];
  tt->weather = s[5]; tt->layers = s[6]; tt->snowcaps = s[7]; tt->extras = s[8];
}
#endif

// horizon (wet scenes) and where the sun or moon sits
#if SPP(0)
void sp_horizon(void) GEN_BANKED {
  static const u8 HZ[SP_N] = { 98, 92, 144, 104, 102, 100, 144, 100, 116, 100 };
  horizon = HZ[gen_special - 1];
  skyBottom = wet ? horizon : GEN_HEIGHT * 80 / 100;
}
#endif

// ---------------------------------------------------------------- shapes

#if SPP(0) || SPP(1) || SPP(2) || SPP(3) || SPP(4)
static u16 hsh(i16 x, i16 y) { u16 h = (u16)x * 31337u ^ (u16)y * 17863u ^ 0x5a3cu; h ^= h >> 7; h *= 0x2c1bu; h ^= h >> 9; h *= 0x9e37u; return h ^ (h >> 8); }
#endif
// 4x4 ordered dither threshold 0..15 (clean pixel-art patterns instead of noise)
#if SPP(1) || SPP(2) || SPP(3) || SPP(4)
static u8 bayer(i16 x, i16 y) { static const u8 B[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 }; return B[((u8)y & 3) * 4 + ((u8)x & 3)]; }
#endif
// gentle natural roughness: a few sines, amplitude a px
#if SPP(0) || SPP(2) || SPP(4)
static i16 rough(i16 x, i16 a, u8 ph) {
  return (i16)(((i32)a * (SINA(x * 9 / 2 + ph) * 3 + SINA(x * 23 / 2 + ph * 3) * 2 + SINA(x * 41 / 2 + ph * 7))) / (127 * 6));
}
#endif
// smooth bump 0..256 at distance d of half-width w: (1 - u^2)^2
#if SPP(0) || SPP(2) || SPP(4)
static i16 bump(i16 d, i16 w) {   // 16-bit maths, same results (0 <= d < w, so u <= 255 and then 2..256)
  u16 u;
  if (d < 0) d = -d;
  if (d >= w) return 0;
  u = w < 256 ? (u16)d * 256u / (u16)w : (u16)((i32)d * 256 / w); u = 256 - (u16)(u * u) / 256;   // d < w < 256: d * 256 fits 16 bits
  return u == 256 ? 256 : (i16)((u16)(u * u) / 256);
}
#endif
// concave volcano flank: 0 at the summit, 256 at the foot (steep high, gentle low)
#if SPP(0)
static i16 flank(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 256;
  u = (i32)d * 256 / w;
  return (i16)(u * (512 - u) / 256);
}
#endif
// integer square root for small values
// a pillar: near-vertical sides, a rounded top
#if SPP(0) || SPP(3)
static i16 isq(i16 v) {   // floor(sqrt(v)), 0 for v <= 0; bit by bit (same results as counting up, checked for every v)
  u16 op, res = 0, one = 1u << 14;
  if (v <= 0) return 0;
  op = (u16)v;
  while (one > op) one >>= 2;
  while (one) { if (op >= res + one) { op -= res + one; res = (u16)((res >> 1) + one); } else res >>= 1; one >>= 2; }
  return (i16)res;
}
#endif

#if SPP(0) || SPP(1) || SPP(2) || SPP(3) || SPP(4)
static i16 vnoise(i16 x, i16 y, i16 cell, i16 salt);
#endif
// vnoise's caches: one copy for all five ROM parts (defined in part 0, the others refer to it), to spare work RAM
#if SP_ALL || SP_PART == 0
#define SP_SHARED
#else
#define SP_SHARED extern
#endif
SP_SHARED u16 vx_c[4], vx_u[4], vx_q[4], vx_r[4], vx_fq[4], vx_fr[4], vx_q256[4], vx_r256[4], vy_c[4], vy_u[4];
SP_SHARED i16 vy_q[4], vy_f[4], vh_cx[4], vh_cy[4], vh_salt[4], vh_a[4], vh_b[4], vh_c[4], vh_d[4];
SP_SHARED u8 vh_ok[4], vx_n, vy_n;
#if SPP(0)
i16 sp_y(i16 l, i16 x) GEN_BANKED {   // ridge line of layer l at column x, in px from the top (SENT = none)
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
    case SP_MILKY: {   // one dark silhouette: sharp ranges low on the horizon, a little shore in front (the tent's)
      static const i16 MX[7] = { -110, -40, 6, 44, 138, 200, 262 };
      static const u8 MW[7] = { 66, 48, 56, 30, 54, 64, 50 }, MH[7] = { 18, 12, 16, 6, 20, 14, 17 };
      i16 v = 0;
      if (l < 2) return SENT;
      for (k = 0; k < 7; k++) { i16 d = x - MX[k], sk = k % 2 ? 10 : -8, f = k % 3 ? bump(d + (d < 0 ? sk : 0), MW[k]) : 256 - flank(d, MW[k] * 2 / 3); v = imax(v, (i16)((i32)f * MH[k] / 256)); }
      v = imax(v, 2 + bump(x - 108, 22) / 64);
      return hz - v + rough(x, 2, 12) / 2;
    }
    case SP_LANTERNS:   // low hills across a dark lake
      if (l == 1) return hz - 6 - bump(x - 40, 60) / 22 - bump(x - 150, 50) / 24 - bump(x + 90, 70) / 20 - bump(x - 260, 60) / 22 + rough(x, 2, 17);   // dark hills across the water
      return SENT;
    case SP_WHALE:   // open sea; a faint far coast in the banner only
      if (bump(x - 240, 34)) return hz - imax(bump(x - 230, 16) / 22, bump(x - 252, 22) / 40) - bump(x - 240, 34) / 128 + rough(x, 1, 19);   // islands: two humps each, not a lens
      if (bump(x + 76, 28)) return hz - imax(bump(x + 82, 13) / 30, bump(x + 66, 16) / 46) - bump(x + 76, 28) / 128 + rough(x, 1, 29);
      return SENT;
    case SP_VILLAGE:   // Shirakawa-go: snowy peaks, a dark forested ridge, the snowfield the farmhouses stand on
      if (l == 0) return 50 - bump(x - 34, 56) / 10 - bump(x - 128, 48) / 9 - bump(x + 70, 60) / 10 - bump(x - 236, 60) / 9 + rough(x, 2, 23);
      if (l == 1) return 74 - bump(x - 96, 70) / 12 - bump(x + 24, 60) / 14 - bump(x - 206, 70) / 12 + rough(x, 3, 61);
      return 104 - bump(x - 80, 90) / 64 + rough(x, 1, 47);
    case SP_KINKAKU:   // Kinugasa's soft hill behind, a dark wall of pines along the far shore of the pond
      return SENT;   // drawn by hand in hard shades (the gold palette must not show up in dithered tones)
    case SP_BAMBOO: case SP_RAMEN: case SP_STORM:
      return SENT;
  }
  return hz;
}
#endif

// layer profile for the current special scene into hgt[] (1/8 px)
#if SPP(0)
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
#endif

// ---------------------------------------------------------------- sky pieces (drawn in the sky phase)

// smooth value noise 0..255 on a grid of `cell` px (bilinear between hashed corners)
#if SPP(0) || SPP(1) || SPP(2) || SPP(3) || SPP(4)
static i16 vnoise(i16 x, i16 y, i16 cell, i16 salt) {
  // 16-bit maths, same results: x + 4096 and y + 4096 are never negative here, cell <= 255, and every lerp step is
  // |difference| <= 255 times a fraction <= 255 (mul256s: x * a / 256 truncated toward zero, like the C division)
  // On the Game Boy each divide costs a lot and this runs several times per pixel, so the cell and fraction are
  // carried along: x usually moves forward by a step smaller than the cell (remainder and fraction stepped with adds),
  // y usually repeats (a small cache). Same numbers as dividing every time.
  u16 ux = (u16)(x + 4096), uy = (u16)(y + 4096), uc = (u16)cell;
  i16 cx, cy, fx, fy;
  u8 k, kx;
  for (k = 0; k < 4 && !(vx_c[k] == uc && ux >= vx_u[k] && ux - vx_u[k] < 3); k++) ;
  if (k < 4) {   // step forward from the last x of this cell size
    while (vx_u[k] != ux) {
      vx_u[k]++;
      if (++vx_r[k] == uc) { vx_r[k] = 0; vx_q[k]++; vx_fq[k] = 0; vx_fr[k] = 0; }
      else { vx_fq[k] += vx_q256[k]; vx_fr[k] += vx_r256[k]; if (vx_fr[k] >= uc) { vx_fr[k] -= uc; vx_fq[k]++; } }
    }
  } else {
    k = vx_n; vx_n = (vx_n + 1) & 3;
    vh_ok[k] = 0;
    vx_c[k] = uc; vx_u[k] = ux; vx_q[k] = ux / uc; vx_r[k] = ux % uc; vx_q256[k] = 256u / uc; vx_r256[k] = 256u % uc;
    vx_fq[k] = vx_r[k] * 256u / uc; vx_fr[k] = vx_r[k] * 256u % uc;
  }
  cx = (i16)vx_q[k]; fx = (i16)vx_fq[k];
  kx = k;
  for (k = 0; k < 4 && !(vy_c[k] == uc && vy_u[k] == uy); k++) ;
  if (k == 4) { k = vy_n; vy_n = (vy_n + 1) & 3; vy_c[k] = uc; vy_u[k] = uy; vy_q[k] = (i16)(uy / uc); vy_f[k] = (i16)((uy % uc) * 256u / uc); }
  cy = vy_q[k]; fy = vy_f[k];
  i16 a, b, c, d;
  if (vh_ok[kx] && vh_cx[kx] == cx && vh_cy[kx] == cy && vh_salt[kx] == salt) { a = vh_a[kx]; b = vh_b[kx]; c = vh_c[kx]; d = vh_d[kx]; }   // same cell: same corners
  else {
    a = (i16)(hsh(cx, cy + salt) & 255); b = (i16)(hsh(cx + 1, cy + salt) & 255); c = (i16)(hsh(cx, cy + 1 + salt) & 255); d = (i16)(hsh(cx + 1, cy + 1 + salt) & 255);
    vh_ok[kx] = 1; vh_cx[kx] = cx; vh_cy[kx] = cy; vh_salt[kx] = salt; vh_a[kx] = a; vh_b[kx] = b; vh_c[kx] = c; vh_d[kx] = d;
  }
  i16 top = a + mul256s(b - a, (u16)fx), bot = c + mul256s(d - c, (u16)fx);
  return top + mul256s(bot - top, (u16)fy);
}
#endif
// the Milky Way rising from the horizon: a broad glow with a bright bulge at its foot, clumpy star clouds, the dark
// Great Rift splitting it, ragged dust patches, and a star field that thickens toward it (a function of x and y)
#if SPP(0)
// v / 127 truncated toward zero for |v| <= 16000, without a divide (checked for every v in range)
static i16 d127(i16 v) { u16 a = (u16)(v < 0 ? -v : v), q = (u16)((a + 1 + (a >> 7)) >> 7); return v < 0 ? -(i16)q : (i16)q; }
static void galaxy(void) {
  i16 m_along = 32767, m_wob = 0, m_w = 0, m_rift = 0; u8 m_wide = 0;   // the terms that depend only on `along`, kept while it repeats
  i16 x, y, x0 = 34, y0 = horizon + 4, dx = 112, dy = -(horizon + 20);
  i32 len = 112 + (i32)(horizon + 20) * (horizon + 20) / 300;
  for (y = 0; y < horizon; y++) {
  // n and al move by dy and dx per column; their quotients by len are stepped as floor quotient + remainder and turned
  // into C's truncation (toward zero) per pixel: no multiply or divide in the inner loop, same numbers
  i32 n = (i32)(GX0 - x0) * dy - (i32)(y - y0) * dx, al = (i32)(GX0 - x0) * dx + (i32)(y - y0) * dy, nq, nr, aq, ar;
  nq = n / len; nr = n % len; if (nr < 0) { nr += len; nq--; }
  aq = al / len; ar = al % len; if (ar < 0) { ar += len; aq--; }
  for (x = GX0; x < GX1; x++) {
    i16 sd = (i16)(nq + (nq < 0 && nr ? 1 : 0)), along = (i16)(aq + (aq < 0 && ar ? 1 : 0)), w, b, clouds, rift, glow, bx, by;
    i16 wob;
    if (along != m_along) {
      u16 aa = (u16)(along < 0 ? -along : along);
      m_along = along;
      m_wob = d127(6 * SINA(along * 2 + 30)) + d127(3 * SINA(along * 5)) - (aa < 256 ? (i16)((u16)(aa * aa) / 900) : (i16)((i32)along * along / 900));   // a gentle arch
      m_w = 30 + along / 6 + (vnoise(along, 0, 24, 3) - 128) / 12;   // wider and more ragged higher up
      m_rift = d127(4 * SINA(along * 4 + 60)) + d127(2 * SINA(along * 9)) - 3;   // the Great Rift wanders along the band
      m_wide = vnoise(along, 9, 14, 7) > 150;
    }
    wob = m_wob; w = m_w;
    b = bump(sd + wob, w);
    clouds = vnoise(x, y, 9, 11);   // clumpy star clouds
    { u16 bc = (u16)(96 + clouds); b = b < 186 ? (i16)((u16)b * bc / 352u) : (i16)((i32)b * bc / 352); }   // b >= 0, clouds <= 255: under 186, b * bc fits 16 bits
    bx = x - (x0 + 14); by = y - (horizon - 4);
    { i32 r2 = (i32)bx * bx + (i32)by * by * 2; glow = r2 < 2116 ? bump(isq((i16)r2), 46) : 0; }   // the bulge near the horizon
    b += glow / 2;
    rift = sd + wob - m_rift;   // the Great Rift, wandering along the band
    if (b > 40 && iabs(rift) < 2 + (m_wide ? 2 : 0) + (along < 40 ? 1 : 0)) b = b / 4;
    if (b > 40 && vnoise(x + 300, y, 6, 23) < 52) b = b * 2 / 3;   // ragged dust patches
    if (b > 0) addT(x, y, -(i16)((i32)b * 120 / 256));
    { u16 h = hsh(x, y); if ((h & 1023) < 3 + (u16)b / 4) setStar(x, y, (h >> 12) > 12 || b > 170 ? 0 : 1); }
    nr += dy; while (nr < 0) { nr += len; nq--; } while (nr >= len) { nr -= len; nq++; }
    ar += dx; while (ar < 0) { ar += len; aq--; } while (ar >= len) { ar -= len; aq++; }
  }
  if (y % 26 == 25 && y < horizon - 1) gen_phase(P_LIGHT);   // the slowest scene: show the band rising in steps (live viewers)
  }
}
#endif
#if SPP(0)
void sp_light(void) GEN_BANKED {
  static const i16 LP[SP_N][3] = {   // x, y, radius
    { 112, 38, 8 },    // Fuji: a small morning sun beside the summit, clear of the branch
    { 80, 62, 17 },    // the gate: the sun sets behind it
    { -400, 10, 6 },   // Shirakawa-go: no moon, snow falling
    { -400, 10, 6 },   // the Milky Way: no moon
    { -400, 10, 6 },   // the pavilion: an overcast winter day
    { -400, 10, 6 },   // lanterns: no moon, the lanterns are the light
    { -400, 10, 6 },   // bamboo: dusk light at the end of the path
    { 84, 56, 30 },    // whale: a huge full moon
    { -400, 10, 6 },   // ramen: a rainy night, no sky light
    { -400, 10, 6 },   // lighthouse: storm clouds
  };
  const i16 *p = LP[gen_special - 1];
  lx = p[0]; ly = p[1]; lrad = p[2];
  side = 1;
  if (gen_special == SP_MILKY) galaxy();
  if (gen_special == SP_STORM) {   // storm clouds: heavy billows, lit from below near the horizon and around the lightning
    i16 x, y;
    for (y = 0; y < horizon; y++) for (x = GX0; x < GX1; x++) {
      i16 n = vnoise(x, y * 2, 16, 5) + vnoise(x * 2, y * 3, 9, 6) / 2 - 192, glow = bump(x - 34, 70) / 4 - y / 3;
      setT(x, y, clampi(178 - n / 2 - y / 2 - (glow > 0 ? glow : 0), 60, 199));
    }
  }
  if (gen_special == SP_KINKAKU) { i16 y; for (y = 0; y < skyBottom; y++) fill_row(y, 0); }   // a white winter sky
}
#endif

// ---------------------------------------------------------------- props

#if SPP(1) || SPP(2) || SPP(3) || SPP(4)
static void hline(i16 x0, i16 x1, i16 y, u8 s) { i16 x; for (x = x0; x <= x1; x++) setH(x, y, s); }
#endif
#if SPP(1) || SPP(2) || SPP(3) || SPP(4)
static void vline(i16 x, i16 y0, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) setH(x, y, s); }
#endif
#if SPP(1) || SPP(2) || SPP(3) || SPP(4)
static void rect(i16 x0, i16 y0, i16 x1, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) hline(x0, x1, y, s); }
#endif
#if SPP(1) || SPP(2)
static i16 ground_y(i16 l, i16 x) { i16 y = sp_y(l, x); return y == SENT ? horizon : y; }
#endif
#if SPP(2) || SPP(3) || SPP(4)
static void halo(i16 cx, i16 cy, i16 r, i16 a) {   // a soft light, lighter toward the middle
  i16 x, y, r2 = r * r;
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) { i16 d2 = x * x + y * y; if (d2 < r2) addT(cx + x, cy + y, -(i16)((i32)a * (r2 - d2) / r2)); }
}
#endif

// a little house: w wide, walls hw high, a steep roof, an optional lit window
#if SPP(1)
static void house(i16 x, i16 gy, i16 w, i16 hw, u8 lit) {
  i16 y, k;
  rect(x - w, gy - hw, x + w, gy, 3);
  for (y = 0; y <= w + 1; y++) hline(x - w - 1 + y, x + w + 1 - y, gy - hw - y, 3);
  for (k = -w - 1; k <= 0; k++) setH(x + k, gy - hw - (k + w + 1), 2);   // a lighter roof edge
  if (lit) { setH(x - 1, gy - hw / 2, 0); setH(x, gy - hw / 2, 0); setH(x - 1, gy - hw / 2 + 1, 1); setH(x, gy - hw / 2 + 1, 1); }
}
#endif
// a round cluster of cherry blossom: a soft pink puff, white five-petal flowers sprinkled over it (more on the lit
// upper left), a shadowed underside, a ragged edge so the sky shows through
#if SPP(1)
static void bloom(i16 cx, i16 cy, i16 r, u16 seed) {
  i16 dx, dy, k, j;
  for (j = 0; j < 3; j++) {   // three overlapping puffs, so the outline is lumpy, not a ball
    i16 ox = j == 0 ? 0 : (j == 1 ? -r / 2 - 1 : r / 2 + 1), oy = j == 0 ? -r / 3 : r / 3, rr = j == 0 ? r : r * 2 / 3 + 1;
    for (dy = -rr; dy <= rr; dy++) for (dx = -rr; dx <= rr; dx++) {
      i16 e = dx * dx + dy * dy - rr * rr + (i16)(hsh(cx + ox + dx, cy + oy + dy) % (u16)(rr + 2));
      if (e > 0) continue;
      setH(cx + ox + dx, cy + oy + dy, (dx + dy > rr && (bayer(cx + dx, cy + dy) & 3) == 0) ? 3 : 1);
    }
  }
  for (k = 0; k < r * r / 2 + 3; k++) {   // white five-petal flowers, thickest on the lit upper left
    u16 h = hsh(k + (i16)seed, 23);
    i16 fx = (i16)(h % (u16)(2 * r + 1)) - r, fy = (i16)((h >> 5) % (u16)(2 * r + 1)) - r - r / 3;
    if (fx * fx + fy * fy > r * r || (fx + fy > 0 && (h >> 12) % 3)) continue;
    setH(cx + fx - 1, cy + fy, 0); setH(cx + fx + 1, cy + fy, 0); setH(cx + fx, cy + fy - 1, 0); setH(cx + fx, cy + fy + 1, 0);
    setH(cx + fx, cy + fy, 1);
  }
}
#endif
// a cherry branch hanging into the picture from above its frame: a curved limb thinning toward its tip, twigs
// dropping off it, blossom clusters along it and at every tip, petals falling. All a function of its endpoints.
#if SPP(1)
static void sakura(i16 xs, i16 ys, i16 xe, i16 ye, i16 sag, u16 seed) {
  i16 n = imax(iabs(xe - xs), iabs(ye - ys)), k, px = xs, py = ys;
  for (k = 0; k <= n; k++) {
    i16 t = (i16)((i32)k * 256 / n), x = xs + (i16)((i32)(xe - xs) * t / 256), y = ys + (i16)((i32)(ye - ys) * t / 256) + (i16)((i32)sag * t / 256 * (256 - t) / 256 * 4 / 4), th = 4 - t * 3 / 256, j;
    for (j = 0; j < th; j++) { setH(x, y + j, 3); setH(x + 1, y + j, 3); }
    if (th > 1) setH(x, y - 1, 2);   // bark lit on top
    if (k > 0 && (k % (n / 4 + 1)) == n / 8 && k < n * 7 / 8) {   // a twig dropping away from the limb, a cluster at its end
      i16 dir = xe > xs ? 1 : -1, tl = 6 + (i16)(hsh(k, (i16)seed) % 8), tx = x, ty = y + th, m;
      for (m = 0; m < tl; m++) { tx += (m & 1) ? dir : 0; ty++; setH(tx, ty, 3); }
      bloom(tx, ty + 3, 5 + (i16)(hsh(k, (i16)seed + 1) % 3), seed + (u16)k);
    }
    px = x; py = y;
  }
  for (k = 1; k <= 4; k++) {   // clusters riding along the limb, the biggest at the tip
    i16 t = k * 64, x = xs + (i16)((i32)(xe - xs) * t / 256), y = ys + (i16)((i32)(ye - ys) * t / 256) + (i16)((i32)sag * t / 256 * (256 - t) / 256);
    bloom(x + (k & 1 ? 2 : -2), y + (k == 4 ? 2 : -1), 3 + k, seed + 100 + (u16)k);
  }
  for (k = 0; k <= n * 3 / 4; k++) {   // the limb again, thin, where it shows between the blossoms
    i16 t = (i16)((i32)k * 256 / n), x = xs + (i16)((i32)(xe - xs) * t / 256), y = ys + (i16)((i32)(ye - ys) * t / 256) + (i16)((i32)sag * t / 256 * (256 - t) / 256);
    if ((k / 5) % 3 != 1) { setH(x, y + 1, 3); setH(x + 1, y + 1, 3); }
  }
  for (k = 0; k < 9; k++) { u16 h = hsh(k + (i16)seed, 29); i16 fx = imin(xs, xe) + (i16)(h % (u16)(iabs(xe - xs) + 10)), fy = imax(ys, 0) + 8 + (i16)((h >> 6) % 40); setH(fx, fy, 1); if ((h >> 13) & 1) setH(fx + 1, fy, 0); }   // falling petals
  (void)px; (void)py;
}
#endif
// the great torii standing in the sea (Itsukushima's ryobu style: each main pillar braced by two smaller legs),
// drawn after the water with its own broken reflection
#if SPP(1)
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
#endif
// a pagoda silhouette (banner sides)
#if SP_ALL
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
#endif
// a tent glowing from inside, with a warm halo
#if SPP(1)
static void tent(i16 x, i16 gy) {
  i16 y, k;
  for (y = -12; y <= 5; y++) for (k = -20; k <= 20; k++) { i16 d2 = k * k + y * y * 4; if (d2 < 400) addT(x + k, gy - 4 + y, -(i16)(80 * (400 - d2) / 400)); }
  for (y = 0; y < 9; y++) { hline(x - y - 1, x + y + 1, gy - 9 + y, y < 8 ? 1 : 3); setH(x - y - 2, gy - 9 + y, 3); setH(x + y + 2, gy - 9 + y, 3); }
  vline(x, gy - 12, gy - 10, 3);
  for (y = 3; y < 9; y++) for (k = -(y - 3) / 2; k <= (y - 3) / 2; k++) setH(x + k, gy - 9 + y, 0);   // the open door
}
#endif
// a small figure standing, head tilted up at the sky, one arm pointing
#if SPP(1) || SPP(4)
static void person(i16 x, i16 gy) {
  vline(x - 1, gy - 3, gy, 3); vline(x + 1, gy - 3, gy, 3);   // legs
  rect(x - 2, gy - 8, x + 2, gy - 4, 3);   // coat
  rect(x - 1, gy - 11, x + 1, gy - 9, 3); setH(x + 1, gy - 12, 3);   // head, tipped back
  setH(x + 3, gy - 8, 3); setH(x + 4, gy - 9, 3); setH(x + 5, gy - 10, 3); setH(x + 6, gy - 11, 3);   // pointing up
}
#endif
// a pine
#if SP_ALL
static void pine(i16 x, i16 gy, i16 ht) {
  i16 y, k;
  vline(x, gy - ht, gy, 3);
  for (y = 3; y < ht; y++) { i16 w = (ht - y) * 2 / 5 + (y % 4 == 0 ? 1 : 0); for (k = -w; k <= w; k++) setH(x + k, gy - y, 3); }
}
#endif
// a paper sky lantern rising, size s 1..3: taller than wide, a little wider at the top, the flame glowing at its
// open bottom, a small soft glow around it
#if SPP(4)
static void lantern(i16 x, i16 y, i16 s) {
  i16 h = 2 * s + 2, r;
  halo(x, y + s, 2 + s * 2, 22 + s * 7);
  for (r = 0; r <= h; r++) { i16 w = s - (r * 2 > h ? 1 : 0) + (s == 1 ? 0 : 0); hline(x - w, x + w, y - h / 2 + r, r == h ? 0 : 1); }
  if (s > 1) { setH(x, y + h / 2 - 1, 0); setH(x - 1, y + h / 2 - 1, 0); }   // the flame
  hline(x - s, x + s, y - h / 2, 2);   // the top fold
}
#endif
// a humpback breaching, belly to us: a long spindle body rising from the water, the head tapering to a knobbly
// rostrum, throat pleats, and the huge scalloped pectoral fins thrown out (pale undersides, dark leading edge)
#if SPP(1)
static void fin(i16 ax, i16 ay, i16 n, i16 dir, i16 lift) {
  i16 f, j;
  for (f = 0; f <= n; f++) {
    i16 fx = ax + dir * f, fy = ay + (i16)((i32)f * lift / 16) + f * f / 90;
    i16 w = f < 3 ? 3 + f : 6 - (i16)((i32)(f - 3) * 5 / (n - 2));   // a narrow root, broad blade, tapering tip
    for (j = 0; j <= w; j++) setH(fx, fy + j, j == 0 || j == w ? 3 : 1);   // dark edges, the pale underside between
    if (f % 4 == 2 && f < n - 3) setH(fx, fy - 1, 3);   // the scalloped leading edge
  }
}
#endif
#if SPP(1)
static i16 wh_th(i16 u) {   // body half-width at u (0 = the water, 256 = the rostrum tip)
  i16 v;
  if (u < 150) return 5 + (i16)((i32)u * 6 / 150);
  v = (i16)((i32)(256 - u) * 256 / 106);
  return 3 + (i16)((i32)8 * (65536L - (i32)(256 - v) * (256 - v)) / 65536L);
}
#endif
#if SPP(1)
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
#endif
// soft dithered maria on a full moon, darker toward the upper left (the stock craters read as squares on big moons)
#if SPP(1)
static void maria(i16 cx, i16 cy, i16 r) {
  i16 x, y, c = imax(4, r * 11 / 30);
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) if (x * x + y * y < (r - 1) * (r - 1)) {
    i16 m = vnoise(x + 40, y + 40, c, 61) + (x < 0 ? 18 : -10) + (y < 0 ? 10 : -8);
    setH(cx + x, cy + y, m > 178 && ((x + y) & 1) ? 1 : 0);
  }
}
#endif

// fill a convex polygon (scanline: min and max crossing per row)
#if SPP(2)
static void fill_poly(const i16 *px, const i16 *py, u8 n, u8 sh) {
  i16 y, y0 = 32767, y1 = -32767;
  u8 i;
  for (i = 0; i < n; i++) { y0 = imin(y0, py[i]); y1 = imax(y1, py[i]); }
  for (y = y0; y <= y1; y++) {
    i16 xa = 32767, xb = -32767;
    for (i = 0; i < n; i++) {
      i16 ax = px[i], ay = py[i], bx = px[(i + 1) % n], by = py[(i + 1) % n], x;
      if ((y < ay && y < by) || (y > ay && y > by)) continue;
      x = ay == by ? imin(ax, bx) : ax + (i16)((i32)(bx - ax) * (y - ay) / (by - ay));
      xa = imin(xa, x); xb = imax(xb, x);
      if (ay == by) xb = imax(xb, imax(ax, bx));
    }
    if (xa <= xb) hline(xa, xb, y, sh);
  }
}
#endif
// a gassho-zukuri farmhouse, gable end to us: the steep thatched gable (dark, rows of lit windows), the long roof
// plane running back under thick snow, a dark lower storey with warm paper windows. s = half the gable width.
#if SPP(2)
static void gassho(i16 x, i16 gy, i16 s) {
  i16 rh = s * 8 / 5, hw = s / 2 + 2, dx = s * 3 / 2, dy = -(s / 3) - 1, k, y;
  i16 ax = x, ay = gy - hw - rh, ex = x + s + 2, ey = gy - hw, lx0 = x - s - 2;
  {   // the snow-covered roof plane running back
    i16 qx[4] = { ax, ex, ex + dx, ax + dx }, qy[4] = { ay, ey, ey + dy, ay + dy };
    fill_poly(qx, qy, 4, 0);
    for (k = 0; k <= dx; k++) { i16 bx = ex + k, by = ey + (i16)((i32)dy * k / dx); setH(bx, by, 1); setH(bx, by + 1, 3); if (k & 1) setH(bx, by - 1, 1); }   // the eave: dithered edge, dark thatch under it
    for (k = 0; k <= dx; k++) { i16 bx = ax + k, by = ay + (i16)((i32)dy * k / dx); setH(bx, by - 1, 0); }   // snow piled on the ridge
  }
  {   // the side wall under the eave, running back
    i16 qx[4] = { ex - 1, ex + dx, ex + dx, ex - 1 }, qy[4] = { ey + 1, ey + dy + 1, gy + dy, gy };
    fill_poly(qx, qy, 4, 3);
    for (k = 3; k < dx - 2; k += 5) { i16 wy = gy - hw / 2 + (i16)((i32)dy * k / dx) - 1; rect(ex + k, wy, ex + k + 1, wy + 1, 1); }
  }
  {   // the gable: a thick dark thatch edge, the wooden face inside, three rows of small lit windows
    i16 tx[3] = { ax, ex, lx0 }, ty[3] = { ay - 1, ey, ey };
    fill_poly(tx, ty, 3, 3);
    for (y = ay + 4; y < ey - 1; y++) { i16 w = (i16)((i32)(y - ay) * (s + 2) / rh) - 3; if (w > 0) hline(x - w, x + w, y, 2); }
    for (k = 0; k < 3; k++) {
      i16 wy = ey - 4 - k * (rh / 4), wn = (i16)((i32)(wy - ay) * (s + 2) / rh) - 4, wx;
      for (wx = -wn + 1; wx <= wn - 1; wx += 3) { setH(x + wx, wy, 0); setH(x + wx, wy + 1, 1); }
    }
    for (k = 0; k <= rh; k++) { i16 w = (i16)((i32)k * (s + 2) / rh); setH(x - w - 1, ay + k - 1, 0); if (k & 1) setH(x - w - 2, ay + k, 1); }   // snow along the left slope
  }
  rect(x - s - 1, ey + 1, x + s + 1, gy, 3);   // the lower storey
  for (k = -s + 1; k <= s - 2; k += 4) { rect(x + k, gy - hw + 2, x + k + 2, gy - 2, 0); vline(x + k + 1, gy - hw + 2, gy - 2, 1); }   // paper windows, lit
  for (k = -s - 2; k <= s + 2 + dx; k++) setH(x + k, gy + 1 + (k > s + 2 ? (i16)((i32)dy * (k - s - 2) / dx) : 0), 0);   // snow banked at the foot
}
#endif
// a cedar under snow: dark tiers, each loaded with snow on top
#if SPP(2)
static void snowpine(i16 x, i16 gy, i16 ht) {
  i16 y, k;
  vline(x, gy - 2, gy, 3);
  for (y = 2; y < ht; y++) {
    i16 t = (y - 2) % 5, w = (ht - y) * 2 / 5 + (t == 0 ? 2 : t == 1 ? 1 : 0);
    for (k = -w; k <= w; k++) setH(x + k, gy - y, t == 0 || (t == 1 && (k + y) % 3 == 0) ? 0 : 3);
  }
  setH(x, gy - ht, 0);
}
#endif

// one roof of the pavilion: a dark eave at y with flared ends, a thin soffit shadow under it, thick snow on the slope
// up to the storey above (half width w_up, rise px higher)
#if SPP(2)
static void kroof(i16 x, i16 y, i16 hw, i16 w_up, i16 rise) {
  i16 k;
  for (k = -hw; k <= hw; k++) {
    i16 a = iabs(k), e = a > hw - 7 ? (a - hw + 7) * (a - hw + 7) / 14 : 0, top = a <= w_up ? y - rise : y - rise + (i16)((i32)(a - w_up) * rise / (hw - w_up + 1));
    vline(x + k, top - e / 2, y - e - 2, 0);   // snow on the roof
    setH(x + k, top - e / 2 - 1, 2);   // its outline against the white sky
    setH(x + k, y - e - 1, 3); setH(x + k, y - e, 3);   // the eave
    if (a < hw - 2) setH(x + k, y - e + 1, 2);   // its shadow
  }
}
#endif
// Kinkaku-ji: three storeys (dark wood below, gold leaf above), snow on every roof, the phoenix on top; the little
// fishing pavilion on the right over the water
#if SPP(2)
static void kinkaku(i16 x, i16 gy) {
  i16 k;
  rect(x - 26, gy - 12, x + 26, gy, 2);   // storey 1 (Hosui-in): dark wood, a few paper panels, open to the pond
  for (k = -26; k <= 26; k += 7) vline(x + k, gy - 12, gy, 3);
  for (k = -19; k <= 19; k += 14) rect(x + k, gy - 9, x + k + 4, gy - 3, 0);
  hline(x - 27, x + 27, gy, 3); hline(x - 26, x + 26, gy - 12, 3);
  rect(x + 27, gy - 8, x + 38, gy, 2); vline(x + 38, gy - 8, gy, 3); vline(x + 32, gy - 8, gy, 3); hline(x + 27, x + 38, gy, 3);   // the fishing pavilion
  kroof(x + 33, gy - 9, 8, 1, 5);
  kroof(x, gy - 13, 35, 23, 8);
  rect(x - 23, gy - 33, x + 23, gy - 22, 1);   // storey 2 (Cho-on-do): gold leaf, a balcony, shuttered windows
  hline(x - 24, x + 24, gy - 22, 3); hline(x - 24, x + 24, gy - 25, 3);
  for (k = -23; k <= 23; k += 3) { setH(x + k, gy - 23, 3); setH(x + k, gy - 24, 3); }
  for (k = -19; k <= 15; k += 8) rect(x + k, gy - 31, x + k + 3, gy - 27, 2);
  vline(x - 23, gy - 33, gy - 22, 2); vline(x + 23, gy - 33, gy - 22, 2);
  kroof(x, gy - 34, 31, 14, 8);
  rect(x - 14, gy - 53, x + 14, gy - 43, 1);   // storey 3 (Kukkyo-cho): gold, bell-shaped windows
  hline(x - 15, x + 15, gy - 43, 3);
  for (k = -8; k <= 8; k += 8) { rect(x + k - 2, gy - 50, x + k + 2, gy - 45, 2); hline(x + k - 1, x + k + 1, gy - 51, 2); }
  for (k = -21; k <= 21; k++) {   // the top roof: a pyramid under snow with flared eaves
    i16 a = iabs(k), e = a > 13 ? (a - 13) * (a - 13) / 12 : 0, top = gy - 68 + a * 3 / 5;
    vline(x + k, top, gy - 56 - e, 0); setH(x + k, top - 1, 2); setH(x + k, gy - 55 - e, 3); setH(x + k, gy - 54 - e, 3);
    if (a < 19) setH(x + k, gy - 53 - e, 2);
    if (a > 3 && a % 6 == 0) setH(x + k, top + 2, 2);
  }
  vline(x, gy - 74, gy - 68, 3);   // the phoenix on its post, wings up
  setH(x - 2, gy - 76, 1); setH(x - 1, gy - 75, 1); setH(x, gy - 75, 1); setH(x + 1, gy - 75, 1); setH(x + 2, gy - 76, 1); setH(x + 3, gy - 77, 1);
  setH(x - 3, gy - 77, 1); setH(x, gy - 76, 3); setH(x + 1, gy - 74, 1);
}
#endif
// one bamboo culm from the top of the frame down to gy: w px wide, shade sh, nodes every gap px (a light ring
// above a dark one), a lit edge on the left; leaf sprays off the upper nodes
#if SPP(3)
static void culm(i16 x, i16 gy, i16 w, u8 sh, i16 gap, u16 seed) {
  i16 y, k, ph = (i16)(seed % (u16)gap);
  for (y = -4; y <= gy; y++) {
    hline(x, x + w - 1, y, sh);
    if (w > 2 && sh > 1) setH(x, y, sh == 3 ? 2 : 1);   // the lit edge
    if (w > 4) setH(x + 1, y, 2);
    if ((y + ph) % gap == 0) { hline(x - (w > 2), x + w - 1 + (w > 2), y, sh == 3 ? 2 : sh + 1); if (sh > 1) hline(x, x + w - 1, y + 1, sh == 3 ? 3 : sh - 1); }   // the node
  }
  for (y = -4 + (gap - ph) % gap; y < gy * 2 / 3; y += gap) {   // leaf sprays: thin blades angling down from the node
    u16 h = hsh(x, y + (i16)seed);
    i16 dir = h & 1 ? 1 : -1, n = 2 + (i16)(h >> 3) % 3;
    if ((h >> 6) % 3 == 0) continue;
    for (k = 0; k < n; k++) {
      i16 bx = dir > 0 ? x + w + 1 : x - 2, by = y + 1 + k * 2, j, len = 4 + w + (i16)((h >> (8 + k)) & 3);
      for (j = 0; j < len; j++) setH(bx + dir * j, by + j / 3 + (k & 1) * j / 5, sh);
    }
  }
}
#endif
// the bamboo grove at dusk: glow at the end of the path, culms in four depths, the path, fireflies
#if SPP(3)
static void grove(void) {
  i16 x, y, d, k;
  for (y = 0; y < H; y++) for (x = GX0; x < GX1; x++) {   // the deep green wood, glowing toward the light at the path's end
    i16 dx = x - 80, dy = (y - 84) * 2, r = isq((i16)imin(16000, (i16)(((i32)dx * dx + (i32)dy * dy) / 4))), g = 255 - r * 5;
    u8 sh = 2;
    if (g > 0) sh = (i16)bayer(x, y) * 16 < g - 128 ? 0 : ((i16)bayer(x, y) * 16 < g ? 1 : 2);
    setH(x, y, sh);
  }
  for (y = 86; y < H; y++) {   // the path: a pale strip narrowing to the light, dark ground on either side
    i16 hw = 3 + (y - 86) * 7 / 10, e = (y - 86) / 3;
    for (x = GX0; x < GX1; x++) {
      i16 a = iabs(x - 80 - (y - 86) / 8);
      u8 sh;
      if (a <= hw) sh = (i16)bayer(x, y) < 12 - e ? 0 : (bayer(x * 3, y * 5) == 0 && (hsh(x / 3, y / 2) & 3) == 0 ? 2 : 1);   // pale gravel
      else if (a <= hw + 1) sh = 2;
      else sh = (i16)bayer(x, y) < 4 + (vnoise(x, y, 6, 91) - 128) / 32 ? 2 : 3;   // leaf litter
      setH(x, y, sh);
    }
  }
  for (y = 86; y < H; y++) {   // the brushwood fences lining the path: a hatched band that grows toward us
    i16 hw = 3 + (y - 86) * 7 / 10, fh = 2 + (y - 86) / 5, j;
    for (j = -1; j <= 1; j += 2) {
      i16 fx = 80 + (y - 86) / 8 + j * (hw + 2);
      for (k = 0; k < fh; k++) setH(fx + j * (k & 1), y - k, (k + y) % 3 ? 1 : 2);
      if (y % 3 == 0) setH(fx + j, y - fh, 0);
    }
  }
  for (d = 0; d < 4; d++) {   // far to near: thin and lit, then thicker and darker, the path opening wider between them
    static const i16 SP[4] = { 5, 7, 11, 19 }, AP[4] = { 7, 18, 30, 46 }, W[4] = { 1, 2, 3, 6 }, GY[4] = { 90, 98, 114, 150 }, GP[4] = { 9, 13, 19, 27 };
    for (x = -144 - d * 7; x < 300; x += SP[d]) {
      u16 h = hsh(x, d * 31 + 5);
      i16 cx = x + (i16)(h % (u16)(SP[d] / 2 + 1)), gy = GY[d] + (i16)((h >> 4) % 6);
      if (iabs(cx - 80) < AP[d] + (i16)((h >> 7) % 5) || cx < GX0 - 8 || cx > GX1 + 4) continue;
      culm(cx, gy, W[d] + (i16)((h >> 9) & 1), d == 0 ? 1 : d == 3 ? 3 : 2 + (d == 2 && (h & 64) ? 1 : 0), GP[d], h);
    }
  }
  for (k = 0; k < 220; k++) {   // fireflies: a bright point, a soft cross of glow, thickest low over the path
    u16 h = hsh(k, 211);
    i16 fx = -136 + (i16)(h % 432), fy = 40 + (i16)(hsh(k, 212) % 100);
    if (!inb(fx, fy) || (hsh(k, 213) & 3) == 0) continue;
    if (fy < 70 && (hsh(k, 214) & 1)) continue;
    setH(fx, fy, 0);
    if ((hsh(k, 216) & 3) == 0) { setH(fx + 1, fy, 0); setH(fx, fy + 1, 0); setH(fx + 1, fy + 1, 0); }
    if (1) { if (getT(fx - 1, fy) > 100) setH(fx - 1, fy, 1); if (getT(fx + 1, fy) > 100) setH(fx + 1, fy, 1); if (getT(fx, fy - 1) > 100) setH(fx, fy - 1, 1); if (getT(fx, fy + 1) > 100) setH(fx, fy + 1, 1); }
  }
}
#endif

// a street of old wooden houses at night: dark tone walls (so the rain and the stall's glow show on them), lattice
// windows, a few lit upstairs, hanging signboards, power lines sagging across the strip of sky
#if SPP(3)
static void street(void) {
  i16 x, y, k;
  for (x = GX0; x < GX1; x++) {
    i16 b = (x + 400) / 46, bx = (x + 400) % 46, top = 18 + (i16)(hsh(b, 3) % 18), eave = top + 22 + (i16)(hsh(b, 4) % 6);
    for (y = top; y < horizon; y++) setT(x, y, y < top + 2 ? 199 : 168);
    if (bx < 2) for (y = top; y < horizon; y++) setT(x, y, 199);   // party walls
    for (k = -2; k <= 0; k++) setH(x, eave + k, 3);   // the eave of the ground floor
    if (bx > 6 && bx < 40 && (bx - 7) % 11 < 7) {   // upstairs lattice windows, some lit
      u8 lit = (hsh(b, (x + 400 - 7) / 11 + 9) & 3) != 0;
      for (y = top + 6; y < top + 15; y++) { if ((bx - 7) % 11 == 0 || (bx - 7) % 11 == 6 || y == top + 6 || y == top + 14) setH(x, y, 3); else if (lit) setH(x, y, (bx + y) % 3 == 0 ? 2 : 1); else setT(x, y, bx % 2 ? 196 : 140); }
    }
    if (bx > 4 && bx < 42) for (y = eave + 2; y < horizon - 1; y++) setT(x, y, bx % 3 == 0 ? 192 : 150);   // shut wooden shutters below
  }
  for (x = -140; x < 300; x += 23) {   // vertical signboards hanging off the walls
    u16 h = hsh(x, 17);
    i16 sx = x + (i16)(h % 7), sy = 24 + (i16)((h >> 3) % 20), sh = 18 + (i16)((h >> 6) % 12);
    if ((h >> 10) % 3 == 0 || (sx > 40 && sx < 124)) continue;
    rect(sx, sy, sx + 5, sy + sh, (h >> 12) & 1 ? 1 : 2);
    rect(sx, sy, sx + 5, sy, 3); vline(sx + 6, sy, sy + sh, 3);
    for (y = sy + 3; y < sy + sh - 2; y += 4) { hline(sx + 1, sx + 4, y, 0); setH(sx + 2, y + 1, 0); setH(sx + 3, y + 2, 0); }   // glyph strokes (no real text)
  }
  for (k = 0; k < 3; k++) for (x = GX0; x < GX1; x++) {   // power lines
    i16 seg = (x + 400 + k * 30) % 90, sag = (i16)((i32)seg * (90 - seg) / (300 + k * 60));
    setH(x, 8 + k * 5 + sag, 3);
  }
}
#endif
// the yatai: a wooden cart under a little roof, short red noren hung across the front, warm light inside, a pot
// steaming, a red paper lantern at the corner, two customers on stools with their backs to us
#if SPP(3)
static void yatai(i16 x, i16 gy) {
  i16 k, y;
  halo(x, gy - 26, 62, 150);
  for (y = gy - 46; y <= gy - 13; y++) hline(x - 34, x + 34, y, (y + x) % 3 == 0 && y < gy - 38 ? 1 : 0);   // the lit inside
  for (k = -31; k <= 31; k += 7) if (iabs(k) > 20) { rect(x + k, gy - 46, x + k + 1, gy - 41, 2); setH(x + k, gy - 47, 2); }   // bottles on a shelf
  rect(x - 36, gy - 11, x + 36, gy, 2);   // the counter front: planks
  for (k = -36; k <= 36; k += 6) vline(x + k, gy - 11, gy, 3);
  hline(x - 38, x + 38, gy - 12, 3); hline(x - 38, x + 38, gy - 11, 1);
  for (k = -1; k <= 1; k += 2) { vline(x + k * 37, gy - 58, gy, 3); vline(x + k * 37 + k, gy - 58, gy, 3); }   // posts
  for (k = -44; k <= 44; k++) {   // the roof: dark boards, lit edges, eaves flaring out
    i16 a = iabs(k), e = a > 36 ? (a - 36) / 2 : 0;
    vline(x + k, gy - 64 - e + (k + 44) / 14, gy - 58 - e, 3); setH(x + k, gy - 65 - e + (k + 44) / 14, 1); setH(x + k, gy - 57 - e, 2);
  }
  for (k = 0; k < 6; k++) {   // noren: six short split panels with a white mark each
    i16 nx = x - 35 + k * 12;
    rect(nx, gy - 56, nx + 10, gy - 47, 1); vline(nx + 11, gy - 56, gy - 48, 3);
    rect(nx + 4, gy - 53, nx + 6, gy - 50, 0);
  }
  hline(x - 36, x + 36, gy - 56, 3);
  rect(x - 27, gy - 19, x - 19, gy - 13, 3); hline(x - 28, x - 18, gy - 20, 2); hline(x - 26, x - 20, gy - 17, 2);   // the stock pot
  for (k = 0; k < 9; k++) { i16 sx = x - 23 + SINA(k * 40) / 50, sy = gy - 22 - k * 3, r = 1 + k / 3, dx, dy; for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && ((sx + dx + sy + dy) & 1 || k < 3) && sy + dy > gy - 47) setH(sx + dx, sy + dy, k < 4 ? 0 : 1); }   // steam, under the noren
  for (k = -1; k <= 1; k += 2) {   // two customers on stools, backs to us: heads just below the noren, round shoulders
    i16 cx = x + 6 + k * 13, dx, dy;
    for (dy = -3; dy <= 3; dy++) for (dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) setH(cx + dx, gy - 41 + dy, 3);   // head
    rect(cx - 1, gy - 37, cx + 1, gy - 36, 3);
    for (y = gy - 36; y <= gy - 12; y++) { i16 w = y < gy - 33 ? 4 + (y - gy + 36) : 7; hline(cx - w, cx + w, y, 3); }   // back
    hline(cx - 5, cx + 5, gy - 8, 3); hline(cx - 5, cx + 5, gy - 7, 2); vline(cx - 4, gy - 6, gy, 3); vline(cx + 4, gy - 6, gy, 3);   // the stool
  }
  {   // the red lantern, hanging from the right corner of the roof
    i16 lx0 = x + 46, ly0 = gy - 42, dy, dx;
    halo(lx0, ly0, 18, 90);
    vline(lx0, gy - 56, ly0 - 10, 3);
    for (dy = -9; dy <= 9; dy++) { i16 w = isq(49 - dy * dy * 49 / 100) + 1; for (dx = -w; dx <= w; dx++) setH(lx0 + dx, ly0 + dy, iabs(dx) <= w / 3 ? 0 : (dy % 4 == 0 ? 2 : 1)); }
    hline(lx0 - 3, lx0 + 3, ly0 - 10, 3); hline(lx0 - 3, lx0 + 3, ly0 + 10, 3); vline(lx0, ly0 + 11, ly0 + 13, 3);
    for (dy = -5; dy <= 5; dy += 3) { setH(lx0, ly0 + dy, 1); setH(lx0 + 1, ly0 + dy + 1, 1); }   // a painted mark
  }
}
#endif
// someone hurrying past under an umbrella
#if SPP(3)
static void umbrella(i16 x, i16 gy) {
  i16 k;
  rect(x - 2, gy - 14, x + 2, gy - 5, 3); vline(x - 1, gy - 4, gy, 3); vline(x + 2, gy - 4, gy - 1, 3); setH(x + 3, gy, 3);
  vline(x + 1, gy - 22, gy - 10, 3);
  for (k = -9; k <= 9; k++) { i16 h = 4 - k * k / 22; vline(x + 1 + k, gy - 20 - h, gy - 19, 3); if (k > 0) setH(x + 1 + k, gy - 21 - h, 1); }
  for (k = -9; k <= 9; k += 3) setH(x + 1 + k, gy - 18, 3);
}
#endif

// the lighthouse on its crag in the storm: a tapering white tower with one dark band, the gallery, the lantern
// blazing, two beams cut through the rain; a sea of breaking crests; a wave exploding against the rock; lightning
#if SPP(4)
static i16 crag(i16 x) { return horizon - 2 - bump(x - 126, 44) / 14 - bump(x - 126, 16) / 40 - bump(x - 150, 20) / 30 + rough(x, 2, 45); }
#endif
#if SPP(4)
static void storm(void) {
  i16 x, y, k, tx = 126, ty = crag(126) + 1, top = ty - 50;
  {   // lightning far out to the left, its branches, a glow in the cloud
    i16 bx = 30, by = 6, j;
    halo(30, 10, 30, 40);
    for (j = 0; by < horizon - 2; j++) {
      u16 h = hsh(j, 401);
      setH(bx, by, 0); if (j % 3 == 0) setH(bx + 1, by, 1);
      by++; bx += (i16)(h % 3) - 1; if ((h >> 5) % 9 == 0) bx += (h >> 9) & 1 ? 2 : -2;
      if (j == 20 || j == 44) { i16 cx = bx, cy = by, m; for (m = 0; m < 16; m++) { cx += (hsh(m, j) & 1) ? 1 : 0; cy++; setH(cx, cy, 1); } }
    }
  }
  for (y = 0; y < horizon; y++) for (x = GX0; x < GX1; x++) if (px_get(x, y) >= STAR) setT(x, y, 176);   // no stars through storm cloud
  for (y = horizon; y < H; y++) for (x = GX0; x < GX1; x++) {   // the sea: dark swells, whitecaps breaking in clumps, larger toward us
    i16 d = y - horizon, n = vnoise(x * 2, y * 4 + x / 3, 7 + d / 3, 33), sw = SINA(x * (6 - d / 12) + y * 29);
    u8 sh = bayer(x, y) < 2 + d / 12 + (sw > 60 ? 3 : 0) ? 2 : 3;
    if (n > 200 - d / 2 && sw > 30) sh = n > 222 - d / 3 ? 0 : 1;
    if (iabs(x - (tx - d * 3)) < 3 + d / 4 && bayer(x, y) < 6) sh = sh == 3 ? 2 : 1;   // the beam's glitter on the water
    setH(x, y, sh);
  }
  for (k = -1; k <= 1; k += 2) for (x = GX0; x < tx; x++) {   // the beams: two wedges of light fanning out to the left
    i16 dist = tx - x, cy = top + 6 + k * dist / 14, hw = 1 + dist / 9, a = 120 - dist / 3;
    if (k > 0 || a < 10) continue;
    for (y = cy - hw; y <= cy + hw; y++) if (inb(x, y) && !isHard(x, y)) addT(x, y, -(a - iabs(y - cy) * a / (hw + 1)));
  }
  for (x = 70; x < 170; x++) { i16 cy = crag(x); if (cy >= horizon + 6) continue; for (y = cy; y < horizon + 4; y++) setH(x, y, (y - cy) < 2 && (x & 1) ? 2 : 3); }   // the crag
  for (y = top + 8; y < ty; y++) {   // the tower
    i16 w = 3 + (y - top) / 12, k2;
    for (k2 = -w; k2 <= w; k2++) setH(tx + k2, y, (y > ty - 24 && y < ty - 16) ? 3 : (k2 > w / 3 ? 1 : 0));
    setH(tx + w + 1, y, 3); setH(tx - w - 1, y, 3);
  }
  rect(tx - 2, ty - 12, tx, ty - 9, 2);   // a window
  hline(tx - 7, tx + 7, top + 8, 3); hline(tx - 7, tx + 7, top + 7, 3); for (k = -6; k <= 6; k += 2) setH(tx + k, top + 6, 3);   // gallery and rail
  rect(tx - 4, top, tx + 4, top + 5, 0); vline(tx - 4, top, top + 5, 3); vline(tx + 4, top, top + 5, 3); vline(tx, top, top + 5, 1);   // the lantern room, blazing
  halo(tx, top + 3, 16, 120);
  for (k = -5; k <= 5; k++) setH(tx + k, top - 1 - (5 - iabs(k)) / 2, 3); setH(tx, top - 5, 3); setH(tx, top - 6, 3);   // the dome and vane
  rect(tx + 8, ty - 7, tx + 18, ty, 3); for (k = 0; k < 7; k++) hline(tx + 7 + k, tx + 19 - k, ty - 8 - k, 3); rect(tx + 11, ty - 5, tx + 12, ty - 3, 1);   // the keeper's house, a light on
  {   // the wave exploding against the crag: billowing puffs of spray climbing and streaming right, droplets flying
    static const i8 PX[11] = { 0, -6, 5, -2, 8, -8, 3, 12, -4, 9, 16 }, PY[11] = { -4, -10, -12, -20, -22, -26, -30, -32, -36, -40, -44 }, PR[11] = { 9, 7, 8, 9, 7, 6, 8, 6, 5, 5, 4 };
    for (k = 0; k < 11; k++) {
      i16 cx = 100 + PX[k] + (-PY[k]) / 4, cy = horizon + PY[k], r = PR[k], dx, dy;
      for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) {
        i16 d2 = dx * dx + dy * dy, e = r * r - d2 + (vnoise(cx + dx, cy + dy, 3, 47 + k) - 128) / 4;
        if (e < 0) continue;
        setH(cx + dx, cy + dy, e > r * r / 2 || (i16)bayer(cx + dx, cy + dy) * 8 < e * 6 / (r + 1) ? (dx > r / 2 && dy > 0 ? 1 : 0) : 1);
      }
    }
    for (k = 0; k < 90; k++) { u16 h = hsh(k, 411); i16 fx = 92 + (i16)(h % 50), fy = horizon - 56 + (i16)((h >> 6) % 50); if (getT(fx, fy) > 100) setH(fx, fy, (h >> 12) & 1 ? 0 : 1); }   // flying droplets
  }
  for (x = GX0; x < GX1; x++) {   // a big swell rising in the foreground, foam breaking along parts of its lip
    i16 lip = H - 13 + SINA(x * 3 + 40) / 20 + SINA(x * 7 + 9) / 50, foam = vnoise(x, 0, 9, 51) > 140;
    for (y = lip; y < H; y++) {
      u8 sh = 3;
      if (foam && y < lip + 2 + (i16)(hsh(x, 3) % 3)) sh = (hsh(x, y) & 3) ? 0 : 1;
      else if (y > lip + 2 && (vnoise(x * 2, y * 3, 5, 53) > 200)) sh = 2;   // streaks of foam on its face
      setH(x, y, sh);
    }
    if (foam && (hsh(x, 11) & 3) == 0) { setH(x + 1, lip - 1, 0); if (hsh(x, 12) & 1) setH(x + 2, lip - 2, 1); }   // spindrift off the lip
  }
  for (k = 0; k < 800; k++) {   // driving rain, slanting with the wind
    u16 h = hsh(k, 421);
    i16 rx = -150 + (i16)(h % 460), ry = (i16)(hsh(k, 422) % 150) - 6, len = 3 + (i16)((h >> 9) % 4), j;
    for (j = 0; j < len; j++) { i16 px = rx + j / 2, py = ry + j; if (inb(px, py)) setH(px, py, getT(px, py) > 110 ? 2 : 1); }
  }
}
#endif

// before the water: things on the ground or the shore (they reflect)
#if SPP(1)
void spf_fuji(void) GEN_BANKED {   // a lakeside house with its light on; in the banner the Chureito pagoda on the left hill
  house(32, ground_y(3, 32), 5, 5, 1);
#ifndef __SDCC
  if (WIDE) { pagoda(-84, ground_y(2, -84) + 1, 5); house(-30, ground_y(3, -30), 4, 4, 1); house(230, ground_y(3, 230), 4, 4, 0); }
#endif
}
#endif
#if SPP(2)
void spf_village(void) GEN_BANKED {   // the farmhouses in two rows, cedars between, warm light on the snow
  i16 k, gy;
  static const i16 HX[9] = { 6, 50, 96, 138, 26, 118, -6, 74, 152 }, HS[9] = { 6, 5, 7, 5, 11, 12, 0, 0, 0 };
  static const i16 PX[8] = { -4, 34, 82, 126, 158, 12, 68, 102 }, PH[8] = { 16, 14, 18, 15, 20, 26, 22, 24 };
  for (k = 0; k < 5; k++) snowpine(PX[k], ground_y(2, PX[k]) + 2, PH[k]);
  for (k = 0; k < 4; k++) { gy = ground_y(2, HX[k]) + 4; halo(HX[k], gy - 2, HS[k] * 2, 40); gassho(HX[k], gy, HS[k]); }
  for (k = 5; k < 8; k++) snowpine(PX[k], 132, PH[k]);
  for (k = 4; k < 6; k++) { gy = 134; halo(HX[k], gy - 4, HS[k] * 2 + 4, 50); gassho(HX[k], gy, HS[k]); }
#ifndef __SDCC
  if (WIDE) {
    for (k = 0; k < 3; k++) { i16 hx = -120 + k * 38, hs = 6 + (k * 5) % 5; gy = ground_y(2, hx) + 4; halo(hx, gy - 2, hs * 2, 40); gassho(hx, gy, hs); snowpine(hx - 16, ground_y(2, hx - 16) + 2, 15 + k * 2); }
    for (k = 0; k < 3; k++) { i16 hx = 186 + k * 40, hs = 6 + (k * 3) % 5; gy = ground_y(2, hx) + 4; halo(hx, gy - 2, hs * 2, 40); gassho(hx, gy, hs); snowpine(hx + 22, ground_y(2, hx + 22) + 2, 16 + k * 2); }
    gassho(-70, 134, 11); gassho(232, 134, 12); snowpine(-100, 132, 24); snowpine(200, 132, 26);
  }
#endif
}
#endif
#if SPP(2)
void spf_kinkaku(void) GEN_BANKED {   // a snowy wooded hill, the dark pines along the far shore, the pavilion, garden pines
  i16 x, y;
  for (x = GX0; x < GX1; x++) {
    i16 yh = horizon - 46 - bump(x - 30, 70) / 14 - bump(x - 170, 60) / 16 - bump(x + 90, 70) / 16 + rough(x, 2, 33);
    for (y = yh; y < horizon; y++) setH(x, y, y == yh ? 2 : 0);   // the snowy hill, outlined
  }
  for (y = horizon - 60; y < horizon; y += 5) for (x = GX0 - ((y / 5) & 1) * 3; x < GX1; x += 6) {   // little snowy conifers on its slopes, thicker downhill
    i16 yh = horizon - 46 - bump(x - 30, 70) / 14 - bump(x - 170, 60) / 16 - bump(x + 90, 70) / 16 + rough(x, 2, 33), j, tx = x + (i16)(hsh(x, y) % 3), ty = y + (i16)((hsh(x, y) >> 4) % 3);
    if (ty < yh + 4 || (i16)(hsh(x, y) >> 8 & 255) > 60 + (ty - yh) * 5) continue;
    for (j = 0; j < 5; j++) { hline(tx - j / 2, tx + j / 2, ty + j, 2); if (j > 1) setH(tx - j / 2, ty + j, 0); }
    setH(tx, ty + 5, 3);
  }
  for (x = GX0; x < GX1; x++) {
    { i16 ph = (x + 400) % 7, cone = ph < 4 ? ph : 7 - ph, yt;   // the shore pines: a row of little cones, snow on their tips
      yt = horizon - 8 + cone * 2 - (vnoise(x, 0, 6, 77) - 128) / 40;
      for (y = yt; y < horizon; y++) setH(x, y, y < yt + 2 && ph != 3 ? 0 : 3); }
  }
  kinkaku(84, horizon - 1);
  snowpine(16, horizon - 1, 34); snowpine(34, horizon - 1, 24); snowpine(150, horizon - 1, 28);
#ifndef __SDCC
  if (WIDE) { snowpine(-30, horizon - 1, 26); snowpine(-90, horizon - 1, 32); snowpine(-112, horizon - 1, 22); snowpine(196, horizon - 1, 30); snowpine(214, horizon - 1, 22); snowpine(270, horizon - 1, 28); }
#endif
}
#endif
#if SPP(3)
void spf_ramen(void) GEN_BANKED {   // the street, the stall, a passer-by (all mirrored in the wet road)
  street();
  yatai(80, horizon - 1);
  umbrella(142, horizon - 1);
#ifndef __SDCC
  if (WIDE) umbrella(210, horizon - 1);
#endif
}
#endif
#if SPP(1)
void spf_milky(void) GEN_BANKED {   // a glowing tent on the shore and someone looking up
  tent(108, ground_y(2, 108));
  person(90, ground_y(2, 90));
#ifndef __SDCC
  if (WIDE) pine(-84, ground_y(2, -84) + 1, 20);
#endif
}
#endif
#if SPP(4)
void spf_lanterns(void) GEN_BANKED {   // lanterns rising over the lake (they reflect), a boat releasing one
  i16 k;
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
}
#endif
#if SPP(1)
void spf_whale(void) GEN_BANKED {   // the whale breaching in front of the moon (its reflection follows in the water)
  maria(84, 56, 30);
  whale(62, horizon + 3);
}
#endif
#if SPP(0)
void sp_features(void) GEN_BANKED {
  switch (gen_special) {
    case SP_FUJI: spf_fuji(); break;
    case SP_VILLAGE: spf_village(); break;
    case SP_KINKAKU: spf_kinkaku(); break;
    case SP_RAMEN: spf_ramen(); break;
    case SP_MILKY: spf_milky(); break;
    case SP_LANTERNS: spf_lanterns(); break;
    case SP_WHALE: spf_whale(); break;
  }
}
#endif


// after the water and weather, before dithering: foreground (no reflection)
#if SPP(1)
void spa_fuji(void) GEN_BANKED {   // a cherry branch entering from the top right
  sakura(184, -10, 120, 18, 10, 7);   // hanging in from above the frame at the top right
#ifndef __SDCC
  if (WIDE) sakura(-150, -10, -86, 16, 10, 31);   // and another at the banner's top left
#endif
}
#endif
#if SPP(1)
void spa_gate(void) GEN_BANKED {   // the gate in the sea, the sun behind it
  torii(80, horizon + 20, 46);
#ifndef __SDCC
  if (WIDE) pagoda(-74, ground_y(1, -74) + 2, 5);
#endif
}
#endif
#if SPP(3)
void spa_ramen(void) GEN_BANKED {   // rain you can see: slanted streaks, lit where they cross the glow; splashes on the road
  i16 k;
  for (k = 0; k < 700; k++) {
    u16 h = hsh(k, 301);
    i16 rx = -140 + (i16)(h % 440), ry = (i16)(hsh(k, 302) % 150) - 6, len = 3 + (i16)((h >> 9) % 5), j;
    if (ry > horizon) { if ((h & 7) == 0 && inb(rx, ry)) { setH(rx, ry, 1); setH(rx - 1, ry - 1, 2); setH(rx + 1, ry - 1, 2); } continue; }
    for (j = 0; j < len; j++) { i16 px = rx + j / 3, py = ry + j; if (inb(px, py)) { i16 v = getT(px, py); setH(px, py, v > 150 ? 2 : v > 60 ? 1 : 1); } }
  }
}
#endif
#if SPP(4)
void spa_storm(void) GEN_BANKED {   // the sea, the light, the crag, the wave, the rain
  storm();
}
#endif
#if SPP(3)
void spa_bamboo(void) GEN_BANKED {   // painted whole, over everything
  grove();
}
#endif
#if SPP(2)
void spa_kinkaku(void) GEN_BANKED {   // the pond mirrors it all, a little darker, with ripple lines; snow falling over everything
  i16 x, y, k;
  for (y = horizon; y < H; y++) {
    i16 my = 2 * horizon - 1 - y, ox = (y - horizon) > 2 && y % 3 == 0 ? (SINA(y * 53) > 0 ? 1 : -1) : 0;
    for (x = GX0; x < GX1; x++) {
      i16 sx = clampi(x + ox, GX0, GX1 - 1), v = my >= 0 ? getT(sx, my) : 0, sh = clampi((v + 32) / 64, 0, 3);
      if (sh == 0) sh = bayer(x, y) < 2 + (y - horizon) / 12 || (y % 6 == 2 && (x + y * 3) % 11 < 4) ? 2 : 0;
      else if (sh == 1 && (y % 4 == 1) && (x & 1)) sh = 2;
      setH(x, y, (u8)sh);
    }
  }
  hline(GX0, GX1 - 1, horizon, 3);
  for (k = 0; k < 600; k++) {
    u16 h = hsh(k, 101);
    i16 fx = -136 + (i16)(h % 432), fy = (i16)(hsh(k, 102) % 144);
    if (!inb(fx, fy)) continue;
    { u8 sh = getT(fx, fy) < 96 ? 2 : 0; setH(fx, fy, sh); if ((h >> 13) == 0) { setH(fx + 1, fy, sh); setH(fx, fy + 1, sh); setH(fx + 1, fy + 1, sh); } }
  }
}
#endif
#if SPP(1)
void spa_whale(void) GEN_BANKED {   // spray and the splash where it leaves the water
  i16 x, y, k;
  for (k = 0; k < 90; k++) {
    u16 h = hsh(k, 31);
    i16 sx = 48 + (i16)(h % 36), sy = horizon - (i16)((h >> 6) % ((h & 3) ? 10 : 22));
    setH(sx, sy, (h >> 12) > 9 ? 0 : 1);
  }
  for (x = 40; x < 100; x++) { i16 a = SINA((x - 40) * 4 + 10); if (a > 0) for (y = 0; y < a / 50 + 1; y++) setH(x, horizon + 1 - y + ((x * 3) % 2), (x + y) % 3 ? 0 : 1); }
#ifndef __SDCC
  if (WIDE) for (k = 0; k < 3; k++) { i16 bx = -60 + k * 9; setH(bx, horizon - 2, 3); setH(bx + 1, horizon - 3, 3); setH(bx + 2, horizon - 2, 3); vline(bx + 1, horizon - 8, horizon - 4, 1); }   // far off, another whale's back and spout
#endif
}
#endif
#if SPP(0)
void sp_after(void) GEN_BANKED {
  switch (gen_special) {
    case SP_FUJI: spa_fuji(); break;
    case SP_GATE: spa_gate(); break;
    case SP_RAMEN: spa_ramen(); break;
    case SP_STORM: spa_storm(); break;
    case SP_BAMBOO: spa_bamboo(); break;
    case SP_KINKAKU: spa_kinkaku(); break;
    case SP_WHALE: spa_whale(); break;
  }
}
#endif

