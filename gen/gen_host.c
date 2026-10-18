// Native build of the generator for tests and tools.
// gen_host traits <seed>            traits as JSON
// gen_host ppm <seed> > x.ppm         picture with its palette
// gen_host hash <from> <to>         one line per seed: seed, FNV-1a of the shades
// gen_host raw <seed>               shades 0..3, one byte per pixel, row major
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "gen_int.h"
void gen_banner(u32 seed, u8 *out, traits_t *tr);

static u8 buf[432 * GEN_HEIGHT];   // wide enough for the banner pass
// rows are GX1 - GX0 wide (160 normally, 432 in the banner pass); column x is at index x - GX0
u8 px_get(i16 x, i16 y) { return buf[y * (GX1 - GX0) + x - GX0]; }
void px_set(i16 x, i16 y, u8 v) { buf[y * (GX1 - GX0) + x - GX0] = v; }
u8 *px_row(i16 y) { return buf + y * (GX1 - GX0); }
u8 *gen_platform_buffer(void) { return buf; }
// link estimate: which tile rows the ROM would send after each phase (same display rules as gb/main.c)
static int link_on, link_first, link_rows, link_phases;
static u8 shown[GEN_HEIGHT][GEN_W];
void gen_phase(u8 phase) {
  int ty, r, x;
  (void)phase;
  if (!link_on) return;
  link_phases++;
  for (ty = 0; ty < 18; ty++) {
    int diff = link_first;
    for (r = 0; r < 8; r++) for (x = 0; x < GEN_W; x++) {
      int y = ty * 8 + r; u8 v = buf[y * GEN_W + x], s;
      if (v >= HARD) s = v & 3; else { int t = v + gen_bayer[r * 8 + (x & 7)]; s = t >= 192 ? 3 : (u8)(t >> 6); }
      if (shown[y][x] != s) { shown[y][x] = s; diff = 1; }
    }
    link_rows += diff;
  }
  link_first = 0;
}

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
  if (!strcmp(argv[1], "special")) {   // gen_host special <id> ppm|banner|traits: a 1/1 scene (admin path)
    if (argc < 4) return 2;
    gen_special = (u8)strtoul(argv[2], 0, 0); argv[1] = argv[3]; argv[2] = "0";
  }
  if (!strcmp(argv[1], "traits")) { u32 s = (u32)strtoul(argv[2], 0, 0); gen_traits(s, &t); if (gen_special) sp_traits(&t); traits_json(&t, s); return 0; }
  if (!strcmp(argv[1], "ppm")) {
    u32 s = (u32)strtoul(argv[2], 0, 0); int h = GEN_HEIGHT, i;
    gen_draw(s, &t);
    printf("P6\n160 %d\n255\n", h);
    for (i = 0; i < 160 * h; i++) { u32 c = gen_palettes[t.palette][buf[i] & 3]; putchar(c >> 16); putchar((c >> 8) & 255); putchar(c & 255); }
    return 0;
  }
  if (!strcmp(argv[1], "link")) {   // gen_host link <from> <to>: tile rows sent per piece and the link time at 8192 Hz
    u32 a = (u32)strtoul(argv[2], 0, 0), b = (u32)strtoul(argv[3], 0, 0), s; long tot = 0;
    link_on = 1;
    for (s = a; s <= b; s++) {
      long bytes;
      link_first = 1; link_rows = 0; link_phases = 0;
      gen_draw(s, &t);
      bytes = link_rows * 321L + link_phases * 8L + 30;
      tot += bytes;
      printf("%u rows %d of %d, %ld bytes, %.1f s\n", s, link_rows, link_phases * 18, bytes, bytes / 1024.0);
    }
    printf("mean %.1f s per piece\n", tot / 1024.0 / (b - a + 1));
    return 0;
  }
  if (!strcmp(argv[1], "banner")) {   // gen_host banner <seed> > b.ppm   (432x144, piece in the middle)
    static u8 out[432 * GEN_HEIGHT];
    u32 s = (u32)strtoul(argv[2], 0, 0); int i;
    gen_banner(s, out, &t);
    printf("P6\n432 %d\n255\n", GEN_HEIGHT);
    for (i = 0; i < 432 * GEN_HEIGHT; i++) { u32 c = gen_palettes[t.palette][out[i] & 3]; putchar(c >> 16); putchar((c >> 8) & 255); putchar(c & 255); }
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
