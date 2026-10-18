// gb-seed-lab generator: the traits of a piece from its seed. Switchable ROM bank on the Game Boy (called once per
// piece; moved out of gen_core.c's fixed bank, 2026-10-18, to make room there).
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

static u8 pickw(const u8 *w, u8 n) {
  u16 total = 0, x; u8 i;
  for (i = 0; i < n; i++) total += w[i];
  x = (u16)rnd(0, (i16)total - 1);
  for (i = 0; i < n; i++) { if (x < w[i]) return i; x -= w[i]; }
  return n - 1;
}

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

void gen_traits(u32 seed, traits_t *t) GEN_TRAITS_BANKED {
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
