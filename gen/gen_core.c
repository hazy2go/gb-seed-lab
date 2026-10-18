// gb-seed-lab generator core: tables, random numbers, pixel helpers, traits, and the phase order.
// Fixed ROM bank on the Game Boy. See gen.h for the portability rules.
#include "gen_int.h"

// ---------------------------------------------------------------- tables

const i8 SIN[256] = {
  0,3,6,9,12,16,19,22,25,28,31,34,37,40,43,46,
  49,51,54,57,60,63,65,68,71,73,76,78,81,83,85,88,
  90,92,94,96,98,100,102,104,106,107,109,111,112,113,115,116,
  117,118,120,121,122,122,123,124,125,125,126,126,126,127,127,127,
  127,127,127,127,126,126,126,125,125,124,123,122,122,121,120,118,
  117,116,115,113,112,111,109,107,106,104,102,100,98,96,94,92,
  90,88,85,83,81,78,76,73,71,68,65,63,60,57,54,51,
  49,46,43,40,37,34,31,28,25,22,19,16,12,9,6,3,
  0,-3,-6,-9,-12,-16,-19,-22,-25,-28,-31,-34,-37,-40,-43,-46,
  -49,-51,-54,-57,-60,-63,-65,-68,-71,-73,-76,-78,-81,-83,-85,-88,
  -90,-92,-94,-96,-98,-100,-102,-104,-106,-107,-109,-111,-112,-113,-115,-116,
  -117,-118,-120,-121,-122,-122,-123,-124,-125,-125,-126,-126,-126,-127,-127,-127,
  -127,-127,-127,-127,-126,-126,-126,-125,-125,-124,-123,-122,-122,-121,-120,-118,
  -117,-116,-115,-113,-112,-111,-109,-107,-106,-104,-102,-100,-98,-96,-94,-92,
  -90,-88,-85,-83,-81,-78,-76,-73,-71,-68,-65,-63,-60,-57,-54,-51,
  -49,-46,-43,-40,-37,-34,-31,-28,-25,-22,-19,-16,-12,-9,-6,-3
};

const u8 gen_bayer[64] = {
  0,32,8,40,2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44,4,36,14,46,6,38,
  60,28,52,20,62,30,54,22,
  3,35,11,43,1,33,9,41,
  51,19,59,27,49,17,57,25,
  15,47,7,39,13,45,5,37,
  63,31,55,23,61,29,53,21
};


// ---------------------------------------------------------------- random

static u32 rs;
#ifndef __SDCC
u32 rs_get(void) { return rs; }
void rs_set(u32 v) { rs = v; }
#endif
u32 rnext(void) { rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5; return rs; }
void rseed(u32 s) {   // murmur3 finalizer first, so every seed bit reaches every state bit
  u8 i;
  s ^= s >> 16; s *= 0x85ebca6bUL; s ^= s >> 13; s *= 0xc2b2ae35UL; s ^= s >> 16;
  rs = s * 2654435761UL; if (!rs) rs = 1;
  for (i = 0; i < 8; i++) rnext();
}
i16 rnd(i16 a, i16 b) {   // uniform a..b inclusive
  u32 span;
  if (b <= a) { rnext(); return a; }
  span = (u32)(i32)(b - a + 1);
  return a + (i16)(((rnext() >> 16) * span) >> 16);
}
u8 chance(u8 p) { return (u8)(rnext() >> 24) < p; }   // p/256
u8 pickw(const u8 *w, u8 n) {
  u16 total = 0, x; u8 i;
  for (i = 0; i < n; i++) total += w[i];
  x = (u16)rnd(0, (i16)total - 1);
  for (i = 0; i < n; i++) { if (x < w[i]) return i; x -= w[i]; }
  return n - 1;
}

// ---------------------------------------------------------------- small maths

// floor(n * 256 / d) for 0 <= n < d < 32768, by shift-and-subtract in 16 bits (no 32-bit division)
u8 frac256(u16 n, u16 d) {
  u8 q = 0, i;
  for (i = 0; i < 8; i++) { n <<= 1; q <<= 1; if (n >= d) { n -= d; q |= 1; } }
  return q;
}
// t*t/256*(768-2t)/256 for t = 0..255 (smoothstep), precomputed with the same integer maths
static const u8 SMOOTH[256] = {
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  2,2,2,2,2,2,2,5,5,5,5,5,8,8,8,8,
  11,10,10,10,13,13,13,13,16,16,16,18,18,18,21,21,
  23,23,23,26,25,25,28,28,30,30,33,33,35,35,37,37,
  40,39,42,42,44,44,46,46,48,48,50,50,52,55,54,57,
  59,59,61,61,63,65,65,67,69,69,71,73,75,75,77,79,
  81,80,82,84,86,86,88,90,91,93,93,95,97,98,100,102,
  104,103,105,107,108,110,112,113,115,117,118,120,121,123,124,126,
  128,129,130,132,133,135,136,138,139,140,142,143,144,146,147,148,
  151,153,154,155,156,157,159,162,163,164,165,166,169,170,171,172,
  175,175,176,177,180,181,182,183,185,186,187,189,190,191,193,194,
  196,197,197,200,200,201,203,204,206,206,208,209,211,211,213,214,
  216,216,218,218,220,220,222,222,224,224,226,226,227,229,229,230,
  232,232,233,233,235,236,236,237,238,238,239,241,242,241,243,244,
  245,244,245,246,247,247,247,248,249,250,249,250,250,251,252,252,
  253,252,252,253,253,254,254,254,255,255,255,255,255,255,255,255
};
// 0..256 smoothstep of v between a and b
i16 smooth256(i16 a, i16 b, i16 v) {
  if (v <= a) return 0;
  if (v >= b) return 256;
  return SMOOTH[frac256((u16)(v - a), (u16)(b - a))];
}
// x * a / 256 truncated toward zero like C division, in 16 bits; caller keeps |x| * a < 65536
i16 mul256s(i16 x, u16 a) {
  if (x < 0) return -(i16)(((u16)(-x) * a) >> 8);
  return (i16)(((u16)x * a) >> 8);
}
// fill one row with a tone (clamped like setT)
void fill_row(i16 y, i16 t) {
  i16 x;
  u8 v = (u8)clampi(t, 0, TONE_MAX), *r = px_row(y);
  for (x = GX0; x < GX1; x++) r[IX(x)] = v;
}
// exp(-u/256) * 256 for u >= 0
i16 expneg(i32 u) {
  static const u8 E[8] = { 255, 94, 35, 13, 5, 2, 1, 0 };
  i16 k = (i16)(u / 256), f = (i16)(u % 256);
  if (k >= 7) return 0;
  return (i16)(E[k] - (i32)(E[k] - E[k + 1]) * f / 256);
}

// ---------------------------------------------------------------- pixels

i16 H;
void setH(i16 x, i16 y, u8 s) { if (inb(x, y)) px_set(x, y, HARD + s); }
void setStar(i16 x, i16 y, u8 s) { if (inb(x, y)) px_set(x, y, STAR + s); }
void setT(i16 x, i16 y, i16 t) { if (inb(x, y)) px_set(x, y, (u8)clampi(t, 0, TONE_MAX)); }
i16 getT(i16 x, i16 y) { u8 v = px_get(x, y); return v >= HARD ? (i16)((v & 3) * 64) : v; }
u8 isHard(i16 x, i16 y) { return px_get(x, y) >= HARD; }
void addT(i16 x, i16 y, i16 d) { u8 v; if (!inb(x, y)) return; v = px_get(x, y); if (v < HARD) setT(x, y, v + d); }
void setTsoft(i16 x, i16 y, i16 t) { if (inb(x, y) && px_get(x, y) < HARD) setT(x, y, t); }

// ---------------------------------------------------------------- traits

static const u8 W_TIME[T_N] = { 12, 20, 14, 18, 28, 5, 3 };
static const u8 W_TERRAIN[R_N] = { 28, 20, 11, 10, 6, 12, 13 };
static const u8 W_GROUND4[4] = { 32, 28, 22, 18 };          // lake forest meadow snowfield
static const u8 W_DESERT[2] = { 72, 28 };                   // desert oasis
static const u8 W_WEATHER[W_N] = { 40, 24, 14, 8, 8, 6 };
static const u8 W_NIGHTSKY[7] = { 14, 18, 18, 30, 8, 4, 3 }; // full gibbous half crescent new twin ringed
static const u8 W_DAYSKY[3] = { 75, 20, 5 };                // sun haloed daymoon
static const u8 W_LOWSKY[3] = { 63, 32, 5 };                // low striped double
static const u8 W_PAL[PAL_N] = { 28, 20, 16, 14, 12, 12, 12, 12, 12, 10, 10, 8, 8, 8, 4, 4, 3, 2, 2, 1 };

void gen_traits(u32 seed, traits_t *t) {
  u8 night, wet, x = 0;
  rseed(seed ^ 0x5bd1e995UL);
  t->time = pickw(W_TIME, T_N);
  t->terrain = pickw(W_TERRAIN, R_N);
  if (t->terrain == R_ISLANDS) t->ground = G_SEA;
  else if (t->terrain == R_FJORD) t->ground = G_LAKE;
  else if (t->terrain == R_DUNES || t->terrain == R_MESAS) t->ground = pickw(W_DESERT, 2) ? G_OASIS : G_DESERT;
  else t->ground = pickw(W_GROUND4, 4);
  t->weather = pickw(W_WEATHER, W_N);
  if ((t->ground == G_DESERT || t->ground == G_OASIS) && t->weather == W_SNOWFALL) t->weather = W_CLEAR;
  if (t->time == T_ECLIPSE && t->weather != W_CLEAR && t->weather != W_FOG) t->weather = W_CLEAR;
  // an aurora under a rain or snow deck would be invisible
  if (t->time == T_AURORA && (t->weather == W_RAIN || t->weather == W_STORM || t->weather == W_SNOWFALL)) t->weather = W_CLEAR;
  night = t->time == T_NIGHT || t->time == T_AURORA;
  if (night) t->sky = S_FULL + pickw(W_NIGHTSKY, 7);
  else if (t->time == T_ECLIPSE) t->sky = S_ECLIPSE;
  else if (t->time == T_DAY) t->sky = S_SUN + pickw(W_DAYSKY, 3);
  else t->sky = S_LOWSUN + pickw(W_LOWSKY, 3);
  if (t->weather == W_RAIN || t->weather == W_STORM || t->weather == W_SNOWFALL) t->sky = S_OVERCAST;
  t->layers = (u8)rnd(3, 6);
  t->snowcaps = 0;
  if (t->terrain == R_PEAKS || t->terrain == R_FJORD || t->terrain == R_VOLCANO) {
    if (t->weather == W_SNOWFALL || t->ground == G_SNOWFIELD) t->snowcaps = 1;
    else t->snowcaps = chance(115);
  }
  wet = t->ground == G_LAKE || t->ground == G_SEA || t->ground == G_OASIS;
  if (night && t->sky != S_OVERCAST && chance(115)) x |= X_MILKYWAY;
  if (night && t->weather == W_CLEAR && chance(36)) x |= X_SHOOTING;
  if ((night || t->time == T_DUSK) && t->sky != S_OVERCAST && chance(13)) x |= X_COMET;
  if (!night && t->time != T_ECLIPSE && t->weather != W_STORM && t->weather != W_RAIN && chance(51)) x |= X_BIRDS;
  if (wet && t->ground != G_OASIS && chance(28)) x |= X_LIGHTHOUSE;
  if (wet && chance(28)) x |= X_SAILBOAT;
  if ((t->ground == G_FOREST || t->ground == G_MEADOW || t->ground == G_SNOWFIELD) && chance(31)) x |= X_CABIN;
  if (chance(8)) x |= X_GLITCH;
  t->extras = x;
  t->palette = pickw(W_PAL, PAL_N);
}


// ---------------------------------------------------------------- terrain profiles (heights in 1/8 px)
i16 md[257];
i16 prof[GEN_WMAX], hgt[GEN_WMAX], hs[GEN_WMAX], grnd[GEN_WMAX], tmp[GEN_WMAX];
#ifndef __SDCC
i16 GX0 = 0, GX1 = GEN_W;
u8 WIDE = 0;
static i16 keep[16];
i16 gen_keep(u8 slot, i16 v) { if (WIDE) return keep[slot]; keep[slot] = v; return v; }
static u32 syncs[40], side_saved;
void gen_sync(u8 slot) { if (WIDE) rs_set(syncs[slot]); else syncs[slot] = rs_get(); }   // recording never consumes randomness
void gen_side_begin(u32 tag) { side_saved = rs_get(); rseed(gen_seed_now ^ tag); }
void gen_side_end(void) { rs_set(side_saved); }
#endif

// ---------------------------------------------------------------- drawing helpers

i16 lx, ly, lrad, skyBottom, horizon;
i16 skyTop, skyBot;

i16 skyAt(i16 y) {
  i16 t = y >= skyBottom ? 256 : (i16)((i32)y * 256 / skyBottom), s;
  if (t < 0) t = 0;
  s = t + (i16)((i32)t * (256 - t) / 1024);
  return skyTop + (i16)((i32)(skyBot - skyTop) * s / 256);
}

void disc(i16 cx, i16 cy, i16 rad, discfn fn) {
  i16 x, y, lim = rad * rad + rad * 3 / 5;   // rad <= 127, so 16 bits are enough
  for (y = -rad; y <= rad; y++) for (x = -rad; x <= rad; x++) if (x * x + y * y <= lim) fn(cx + x, cy + y, x, y);
}

i16 g_rad, g_side, g_off; u8 g_phase, g_shade;
void fn_hard(i16 X, i16 Y, i16 x, i16 y) { (void)x; (void)y; setH(X, Y, g_shade); }
static const i8 CR[4][3] = { { 6, -4, 5 }, { -7, 6, 4 }, { 2, 9, 3 }, { -4, -8, 2 } };
static i16 crx[4], cry[4], crr[4];   // crater centres and squared radii for the current moon
void fn_moon(i16 X, i16 Y, i16 x, i16 y) {
  u8 lit = 1, k, v = 0;
  if (g_phase == 2) lit = (i16)(x * g_side) >= 0;
  else if (g_phase == 4) lit = 0;
  else if (g_phase == 1) lit = (i16)(x * g_side) >= 0 || 4 * x * x + y * y <= g_rad * g_rad;   // lit half + half an ellipse (convex terminator)
  else if (g_phase != 0) { i16 a = x + g_off * g_side; lit = a * a + y * y > g_rad * g_rad; }   // all <= 52^2: 16 bits
  if (!lit) { addT(X, Y, g_phase == 4 ? -30 : 22); return; }   // a new moon is a faint earthlit disc
  for (k = 0; k < 4; k++) {
    i16 ax = x - crx[k], ay = y - cry[k];
    if (ax * ax + ay * ay < crr[k]) v = 1;
  }
  setH(X, Y, v);
}
void fn_newrim(i16 X, i16 Y, i16 x, i16 y) { if ((i32)x * x + (i32)y * y > (i32)(g_rad - 1) * (g_rad - 1) && x * g_side > 0) setH(X, Y, 1); }
// phase: 0 full, 1 gibbous, 2 half, 3 crescent, 4 new
void moon(i16 cx, i16 cy, i16 rad, u8 phase, i16 side) {
  u8 k;
  g_rad = rad; g_side = side; g_phase = phase;
  for (k = 0; k < 4; k++) { crx[k] = (i16)(CR[k][0] * rad / 20); cry[k] = (i16)(CR[k][1] * rad / 20); crr[k] = (i16)(CR[k][2] * rad / 20); crr[k] *= crr[k]; }
  g_off = phase == 3 ? rad * 11 / 20 : 0;
  disc(cx, cy, rad, fn_moon);
  if (phase == 4) disc(cx, cy, rad, fn_newrim);
}
void fn_striped(i16 X, i16 Y, i16 x, i16 y) {
  i16 o2 = 2 * y + g_rad * 3 / 2;   // twice the distance below the stripe start
  (void)x;
  if (o2 > 0) { i16 k = o2 / 7; if (o2 % 7 < imin(5, 1 + k)) return; }
  setH(X, Y, 0);
}
void fn_daymoon(i16 X, i16 Y, i16 x, i16 y) { (void)y; setH(X, Y, x * g_side > g_rad * 3 / 10 ? 1 : 0); }
void fn_planet(i16 X, i16 Y, i16 x, i16 y) {
  i16 s = x * g_side > g_rad * 35 / 100 ? 2 : 1;
  if (((y + g_rad) / 3) % 3 == 0) s--;
  setH(X, Y, (u8)s);
}
void fn_eclipse(i16 X, i16 Y, i16 x, i16 y) { setH(X, Y, (i32)x * x + (i32)y * y > (i32)(g_rad - 1) * (g_rad - 1) ? 0 : 3); }
i16 g_puff;
void fn_puff(i16 X, i16 Y, i16 x, i16 y) { (void)x; (void)y; setTsoft(X, Y, g_puff); }


// ---------------------------------------------------------------- the picture

i16 pathx[320], pathy[320];

// shared state of the current drawing
traits_t *t;
u8 night, wet, lowsun, hi_obj;
i16 L, top, bottom, far, rimA, glowR, glowA, side, volx, voly, cabx;
u8 skyl[GEN_WMAX];

// a soft puff of smoke: blends toward `tone` by a/256 (half that on the rim), never over hard pixels, never over
// the sun or moon and its ring (unless smoke_sun), never in the top 4 rows
u8 smoke_sun;   // set: the puff may cover the sun or moon (a volcano in front of it)
void smoke(i16 cx, i16 cy, i16 r, i16 tone, i16 a) {
  i16 x, y, lim = r * r + r * 3 / 5, in2 = (r - 1) * (r - 1), lr = lrad + 3;   // r <= 8
  for (y = -r; y <= r; y++) for (x = -r; x <= r; x++) {
    i16 X = cx + x, Y = cy + y, d2 = x * x + y * y, dx, dy;
    u8 v;
    if (d2 > lim || Y < 4 || !inb(X, Y)) continue;
    dx = X - lx; dy = Y - ly;
    v = px_get(X, Y);
    if ((i32)dx * dx + (i32)dy * dy < (i32)lr * lr) {
      if (!smoke_sun) continue;
      if (v >= HARD) v = (u8)((v & 3) * 63);   // the disc's flat shade as a tone, so the plume can pass in front of it
    } else if (v >= HARD) continue;
    px_set(X, Y, (u8)clampi(v + mul256s(tone - v, (u16)(d2 > in2 ? a / 2 : a)), 0, TONE_MAX));   // |tone - v| * a < 65536
  }
}


u8 gen_special;

void gen_draw(u32 seed, traits_t *tt) {
  const i16 h = GEN_HEIGHT;
  i16 l;
  t = tt; volx = -1; voly = 0; cabx = -1000;
  if (gen_special) seed = 0x1F1F0000UL + gen_special;   // a 1/1 scene has its own fixed seed
#ifndef __SDCC
  gen_seed_now = seed;
#endif
  gen_traits(seed, t);
  if (gen_special) sp_traits(t);
  rseed(seed * 31 + 7);
  H = h;
  night = t->time == T_NIGHT || t->time == T_AURORA;
  wet = t->ground == G_LAKE || t->ground == G_SEA || t->ground == G_OASIS;
  if (wet) {
    if (t->ground == G_OASIS) horizon = h * 80 / 100;
    else { i16 r = rnd(0, 8); horizon = (i16)((i32)h * (64 + r) / 100); }
  } else horizon = h;
  skyBottom = wet ? horizon : h * 80 / 100;
  if (gen_special) sp_horizon();
  draw_sky();
  SYNC(0); draw_light();
  SYNC(1); draw_clouds();
  SYNC(2); ridge_setup();
  for (l = 0; l < L; l++) { SYNC(3 + l); draw_layer(l); }
  SYNC(12); draw_surface();
  SYNC(13); draw_features();
  SYNC(14); draw_water();
  SYNC(15); draw_weather();
  if (gen_special) sp_after();
  SYNC(16); draw_finish();
}
