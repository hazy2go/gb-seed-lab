// Native build of the generator for tests and tools.
// gen_host traits <seed>            traits as JSON
// gen_host ppm <seed> > x.ppm         picture with its palette
// gen_host hash <from> <to>         one line per seed: seed, FNV-1a of the shades
// gen_host raw <seed>               shades 0..3, one byte per pixel, row major
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "gen.h"

static u8 buf[GEN_W * GEN_HEIGHT];
u8 px_get(i16 x, i16 y) { return buf[y * GEN_W + x]; }
void px_set(i16 x, i16 y, u8 v) { buf[y * GEN_W + x] = v; }
void gen_phase(u8 phase) { (void)phase; }

static void traits_json(const traits_t *t, u32 seed) {
  int i, first = 1;
  printf("{\"seed\":%u,\"palette\":\"%s\",\"time\":\"%s\",\"sky\":\"%s\",\"terrain\":\"%s\",\"ground\":\"%s\",\"weather\":\"%s\",\"ridges\":%d,\"snowcaps\":%s,\"extras\":[",
    seed, gen_palette_names[t->palette], gen_time_names[t->time], gen_sky_names[t->sky], gen_terrain_names[t->terrain],
    gen_ground_names[t->ground], gen_weather_names[t->weather], t->layers, t->snowcaps ? "true" : "false");
  for (i = 0; i < X_N; i++) if (t->extras & (1 << i)) { printf("%s\"%s\"", first ? "" : ",", gen_extra_names[i]); first = 0; }
  printf("]}\n");
}

int main(int argc, char **argv) {
  traits_t t;
  if (argc < 3) { fprintf(stderr, "usage: gen_host traits|ppm|hash seed ...\n"); return 2; }
  if (!strcmp(argv[1], "traits")) { u32 s = (u32)strtoul(argv[2], 0, 0); gen_traits(s, &t); traits_json(&t, s); return 0; }
  if (!strcmp(argv[1], "ppm")) {
    u32 s = (u32)strtoul(argv[2], 0, 0); int h = GEN_HEIGHT, i;
    gen_draw(s, &t);
    printf("P6\n160 %d\n255\n", h);
    for (i = 0; i < 160 * h; i++) { u32 c = gen_palettes[t.palette][buf[i] & 3]; putchar(c >> 16); putchar((c >> 8) & 255); putchar(c & 255); }
    return 0;
  }
  if (!strcmp(argv[1], "raw")) {
    u32 s = (u32)strtoul(argv[2], 0, 0); int h = GEN_HEIGHT, i;
    gen_draw(s, &t);
    for (i = 0; i < 160 * h; i++) putchar(buf[i] & 3);
    return 0;
  }
  if (!strcmp(argv[1], "hash")) {
    u32 a = (u32)strtoul(argv[2], 0, 0), b = argc > 3 ? (u32)strtoul(argv[3], 0, 0) : a, s; int h = GEN_HEIGHT, i;
    for (s = a; s <= b; s++) {
      u32 f = 2166136261u;
      gen_draw(s, &t);
      for (i = 0; i < 160 * h; i++) { f ^= buf[i] & 3; f *= 16777619u; }
      printf("%u %08x\n", s, f);
    }
    return 0;
  }
  return 2;
}
