// WebAssembly build of the generator (no libc). Used by the web page and the mint server's check.
#include "gen.h"

static u8 buf[GEN_W * 432];
static traits_t T;
__attribute__((import_module("env"), import_name("phase"))) void js_phase(u8 phase);

u8 px_get(i16 x, i16 y) { return buf[y * GEN_W + x]; }
void px_set(i16 x, i16 y, u8 v) { buf[y * GEN_W + x] = v; }
void gen_phase(u8 phase) { js_phase(phase); }

__attribute__((export_name("buffer"))) u8 *wasm_buffer(void) { return buf; }
__attribute__((export_name("draw"))) void wasm_draw(u32 seed, i32 h) { gen_draw(seed, (i16)h, &T); }
__attribute__((export_name("traits"))) void wasm_traits(u32 seed) { gen_traits(seed, &T); }
// 0 palette, 1 time, 2 sky, 3 terrain, 4 ground, 5 weather, 6 layers, 7 snowcaps, 8 extras
__attribute__((export_name("trait"))) i32 wasm_trait(i32 i) { const u8 *p = &T.palette; return i >= 0 && i < 9 ? p[i] : -1; }
// kind: 0 palette, 1 time, 2 sky, 3 terrain, 4 ground, 5 weather, 6 extra
__attribute__((export_name("name"))) const char *wasm_name(i32 kind, i32 i) {
  switch (kind) {
    case 0: return i < PAL_N ? gen_palette_names[i] : 0;
    case 1: return i < T_N ? gen_time_names[i] : 0;
    case 2: return i < S_N ? gen_sky_names[i] : 0;
    case 3: return i < R_N ? gen_terrain_names[i] : 0;
    case 4: return i < G_N ? gen_ground_names[i] : 0;
    case 5: return i < W_N ? gen_weather_names[i] : 0;
    case 6: return i < X_N ? gen_extra_names[i] : 0;
  }
  return 0;
}
__attribute__((export_name("color"))) u32 wasm_color(i32 p, i32 i) { return gen_palettes[p][i & 3]; }
