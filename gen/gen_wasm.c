// WebAssembly build of the generator (no libc). Used by the web page and the mint server's check.
#include "gen_int.h"
void gen_banner(u32 seed, u8 *out, traits_t *tr);

static u8 buf[432 * GEN_HEIGHT];   // wide enough for the banner pass
static traits_t T;
__attribute__((import_module("env"), import_name("phase"))) void js_phase(u8 phase);

// rows are GX1 - GX0 wide (160 normally, 432 in the banner pass); column x is at index x - GX0
u8 px_get(i16 x, i16 y) { return buf[y * (GX1 - GX0) + x - GX0]; }
void px_set(i16 x, i16 y, u8 v) { buf[y * (GX1 - GX0) + x - GX0] = v; }
u8 *px_row(i16 y) { return buf + y * (GX1 - GX0); }
u8 *gen_platform_buffer(void) { return buf; }
void gen_phase(u8 phase) { js_phase(phase); }

__attribute__((export_name("buffer"))) u8 *wasm_buffer(void) { return buf; }
__attribute__((export_name("draw"))) void wasm_draw(u32 seed) { gen_draw(seed, &T); }
// 1/1 scenes: special(id) selects one (0 = normal pieces); draw/banner/traits then use it. Admin path only.
__attribute__((export_name("special"))) void wasm_special(u32 id) { gen_special = id <= SP_N ? (u8)id : 0; }
static u8 bout[432 * GEN_HEIGHT];
// banner: 432x144 shades (HARD+shade) in bannerBuffer(), the exact piece at columns 136..295
__attribute__((export_name("banner"))) void wasm_banner(u32 seed) { gen_banner(seed, bout, &T); }
__attribute__((export_name("bannerBuffer"))) u8 *wasm_banner_buffer(void) { return bout; }
__attribute__((export_name("traits"))) void wasm_traits(u32 seed) { gen_traits(seed, &T); if (gen_special) sp_traits(&T); }
// 0 palette, 1 time, 2 sky, 3 terrain, 4 ground, 5 weather, 6 layers, 7 snowcaps, 8 extras
__attribute__((export_name("trait"))) i32 wasm_trait(i32 i) { const u8 *p = &T.palette; return i >= 0 && i < 9 ? p[i] : -1; }
// kind: 0 palette, 1 time, 2 sky, 3 terrain, 4 ground, 5 weather, 6 extra
__attribute__((export_name("name"))) const char *wasm_name(i32 kind, i32 i) {
  switch (kind) {
    case 0: return i < PAL_ALL ? gen_palette_names[i] : 0;
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
