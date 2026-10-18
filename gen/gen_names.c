// Trait and palette names (not needed on the Game Boy).
#include "gen.h"

const char *const gen_time_names[T_N] = { "dawn", "day", "golden hour", "dusk", "night", "aurora", "eclipse" };
const char *const gen_terrain_names[R_N] = { "peaks", "hills", "mesas", "dunes", "volcano", "islands", "fjord" };
const char *const gen_ground_names[G_N] = { "lake", "forest", "meadow", "snowfield", "sea", "desert", "oasis" };
const char *const gen_weather_names[W_N] = { "clear", "clouds", "fog", "rain", "snowfall", "storm" };
const char *const gen_sky_names[S_N] = { "sun", "haloed sun", "day moon", "low sun", "striped sun", "double sun", "full moon", "gibbous moon", "half moon", "crescent moon", "new moon", "twin moons", "ringed planet", "eclipse", "overcast" };
const char *const gen_extra_names[X_N] = { "milky way", "shooting star", "comet", "birds", "lighthouse", "sailboat", "cabin", "glitch" };
const char *const gen_palette_names[PAL_ALL] = { "Original", "Pocket", "Thermal", "Glacier", "Ember", "Lavender", "Sea Glass", "Dune", "Moss", "Sepia", "Cobalt", "Rosewood", "Arctic Dawn", "Teal Night", "Gold Leaf", "Blood Moon", "Neon", "Red Visor", "Toxic", "Negative",
  "Sakura", "Vermilion", "Polar Night", "Canyon", "Alpine", "Jade", "Outback", "Silver Sand", "Savanna", "Mono Dawn" };
const u32 gen_palettes[PAL_ALL][4] = {
  { 0xe0f8d0, 0x88c070, 0x346856, 0x081820 }, { 0xc4cfa1, 0x8b956d, 0x4d533c, 0x1f1f1f },
  { 0xf6f5ef, 0xa9a9a2, 0x585852, 0x161614 }, { 0xe6f6f4, 0x8cc2cf, 0x3e6a90, 0x121f38 },
  { 0xffd98a, 0xe2793c, 0x8e2d2b, 0x2a0e15 }, { 0xf3dcec, 0xb38fcb, 0x5b4a8e, 0x1b1738 },
  { 0xdcf1d4, 0x79c1a8, 0x2e7381, 0x0f2737 }, { 0xf7e2b4, 0xd9a263, 0x8b5232, 0x2f1810 },
  { 0xe7efc2, 0x93b263, 0x3d6b3b, 0x142518 }, { 0xefe0c9, 0xb89272, 0x6a4b39, 0x21160f },
  { 0xd4e2ff, 0x7393d4, 0x2f3f84, 0x0c1031 }, { 0xffe5df, 0xef8b9b, 0x893b6b, 0x2a1030 },
  { 0xfff3df, 0xefb7a1, 0x6979a8, 0x1a2240 }, { 0xc9f7da, 0x4fb092, 0x1f4f6b, 0x0a1a28 },
  { 0xfff1b3, 0xe1b343, 0x7f6022, 0x1f1708 }, { 0xf1d3c3, 0xc2413f, 0x511a31, 0x100810 },
  { 0xf6f7a3, 0xef52c0, 0x4231a2, 0x110821 }, { 0xff5a4a, 0xb3120c, 0x520303, 0x000000 },
  { 0xe3ff47, 0x5fc221, 0x1f4f30, 0x081810 }, { 0x081820, 0x346856, 0x88c070, 0xe0f8d0 },
  // 1/1 palettes (gen_special.c), never given to a public seed
  { 0xfdeef2, 0xf2a7bd, 0x5e6f99, 0x1c2340 }, { 0xffe9c7, 0xf08a4b, 0xb3261e, 0x2b0b0b },
  { 0xe8fbff, 0x6fe0b0, 0x2a4f7a, 0x0a1426 }, { 0xffe3b8, 0xe07a3f, 0x8f2f1d, 0x2a0f0c },
  { 0xeef4ff, 0x9fb4d9, 0x3b4f7c, 0x0d1428 }, { 0xe9f5e4, 0x9ccfae, 0x3f7d6b, 0x11261f },
  { 0xffd9a6, 0xe86f3a, 0x8a2c3f, 0x24101f }, { 0xf4f1ea, 0xb9b3a8, 0x5d5a62, 0x15151c },
  { 0xfff0c2, 0xf2a65a, 0x7d4b2a, 0x241509 }, { 0xf7f3ec, 0xd8cfc2, 0x8e8a86, 0x2b2b30 }
};

