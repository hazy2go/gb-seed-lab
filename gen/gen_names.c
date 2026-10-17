// Trait and palette names (not needed on the Game Boy).
#include "gen.h"

const char *const gen_time_names[T_N] = { "dawn", "day", "golden hour", "dusk", "night", "aurora", "eclipse" };
const char *const gen_terrain_names[R_N] = { "peaks", "hills", "mesas", "dunes", "volcano", "islands", "fjord" };
const char *const gen_ground_names[G_N] = { "lake", "forest", "meadow", "snowfield", "sea", "desert", "oasis" };
const char *const gen_weather_names[W_N] = { "clear", "clouds", "fog", "rain", "snowfall", "storm" };
const char *const gen_sky_names[S_N] = { "sun", "haloed sun", "day moon", "low sun", "striped sun", "double sun", "full moon", "gibbous moon", "half moon", "crescent moon", "new moon", "twin moons", "ringed planet", "eclipse", "overcast" };
const char *const gen_extra_names[X_N] = { "milky way", "shooting star", "comet", "birds", "lighthouse", "sailboat", "cabin", "glitch" };
const char *const gen_palette_names[PAL_N] = { "Original", "Pocket", "Thermal", "Glacier", "Ember", "Lavender", "Sea Glass", "Dune", "Moss", "Sepia", "Cobalt", "Rosewood", "Arctic Dawn", "Teal Night", "Gold Leaf", "Blood Moon", "Neon", "Red Visor", "Toxic", "Negative" };
const u32 gen_palettes[PAL_N][4] = {
  { 0xe0f8d0, 0x88c070, 0x346856, 0x081820 }, { 0xc4cfa1, 0x8b956d, 0x4d533c, 0x1f1f1f },
  { 0xf6f5ef, 0xa9a9a2, 0x585852, 0x161614 }, { 0xe6f6f4, 0x8cc2cf, 0x3e6a90, 0x121f38 },
  { 0xffd98a, 0xe2793c, 0x8e2d2b, 0x2a0e15 }, { 0xf3dcec, 0xb38fcb, 0x5b4a8e, 0x1b1738 },
  { 0xdcf1d4, 0x79c1a8, 0x2e7381, 0x0f2737 }, { 0xf7e2b4, 0xd9a263, 0x8b5232, 0x2f1810 },
  { 0xe7efc2, 0x93b263, 0x3d6b3b, 0x142518 }, { 0xefe0c9, 0xb89272, 0x6a4b39, 0x21160f },
  { 0xd4e2ff, 0x7393d4, 0x2f3f84, 0x0c1031 }, { 0xffe5df, 0xef8b9b, 0x893b6b, 0x2a1030 },
  { 0xfff3df, 0xefb7a1, 0x6979a8, 0x1a2240 }, { 0xc9f7da, 0x4fb092, 0x1f4f6b, 0x0a1a28 },
  { 0xfff1b3, 0xe1b343, 0x7f6022, 0x1f1708 }, { 0xf1d3c3, 0xc2413f, 0x511a31, 0x100810 },
  { 0xf6f7a3, 0xef52c0, 0x4231a2, 0x110821 }, { 0xff5a4a, 0xb3120c, 0x520303, 0x000000 },
  { 0xe3ff47, 0x5fc221, 0x1f4f30, 0x081810 }, { 0x081820, 0x346856, 0x88c070, 0xe0f8d0 }
};

