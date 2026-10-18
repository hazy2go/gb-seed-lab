// gb-seed-lab generator: one source for the Game Boy ROM (GBDK/SDCC), the web page (WASM) and tests (native).
// Integer maths only. Rules that keep all three builds identical:
//  - fixed-width types everywhere; SDCC's int is 16 bit, so any product that can pass 32767 is cast to i32
//  - never two rnd() calls in one expression (operand order is unspecified in C)
//  - no >> on negative numbers (implementation-defined); signed scaling uses / instead
#ifndef GEN_H
#define GEN_H
#include <stdint.h>

typedef uint8_t u8;
typedef int8_t i8;
typedef uint16_t u16;
typedef int16_t i16;
typedef uint32_t u32;
typedef int32_t i32;

#define GEN_W 160
#define GEN_HEIGHT 144

// Pixel buffer: one byte per pixel.
//   0..199   tone (shade = tone/64 after dithering; 64 steps per shade)
//   200..203 hard pixel, shade 0..3
//   204..207 hard star pixel, shade 0..3 (water does not reflect stars)
#define HARD 200
#define STAR 204
#define TONE_MAX 199

// Provided by the platform (gen_host.c, gen_wasm.c, gb/main.c).
#ifdef __SDCC
// Game Boy: rows live in cartridge RAM, 51 rows per 8 KB bank; inline to save a call per pixel.
extern u8 gb_rowbank[144];
extern u8 *gb_rowptr[144];
extern volatile u8 gb_curbank;
extern u8 gb_dirty[144];   // rows written since the last screen update (gb/main.c converts only their tile rows)
#define GB_RAMB (*(volatile u8 *)0x4000)
static inline u8 px_get(i16 x, i16 y) {
  u8 b = gb_rowbank[(u8)y];
  if (b != gb_curbank) { gb_curbank = b; GB_RAMB = b; }
  return gb_rowptr[(u8)y][(u8)x];
}
static inline void px_set(i16 x, i16 y, u8 v) {
  u8 b = gb_rowbank[(u8)y];
  if (b != gb_curbank) { gb_curbank = b; GB_RAMB = b; }
  gb_dirty[(u8)y] = 1;
  gb_rowptr[(u8)y][(u8)x] = v;
}
// pointer to a whole row; valid until the next px_get/px_set/px_row of another row (counts as a write)
static inline u8 *px_row(i16 y) {
  u8 b = gb_rowbank[(u8)y];
  if (b != gb_curbank) { gb_curbank = b; GB_RAMB = b; }
  gb_dirty[(u8)y] = 1;
  return gb_rowptr[(u8)y];
}
#else
u8 px_get(i16 x, i16 y);
void px_set(i16 x, i16 y, u8 v);
u8 *px_row(i16 y);
#endif
void gen_phase(u8 phase);   // called after each drawing phase

enum { T_DAWN, T_DAY, T_GOLDEN, T_DUSK, T_NIGHT, T_AURORA, T_ECLIPSE, T_N };
enum { R_PEAKS, R_HILLS, R_MESAS, R_DUNES, R_VOLCANO, R_ISLANDS, R_FJORD, R_N };
enum { G_LAKE, G_FOREST, G_MEADOW, G_SNOWFIELD, G_SEA, G_DESERT, G_OASIS, G_N };
enum { W_CLEAR, W_CLOUDS, W_FOG, W_RAIN, W_SNOWFALL, W_STORM, W_N };
enum { S_SUN, S_HALOED, S_DAYMOON, S_LOWSUN, S_STRIPED, S_DOUBLE, S_FULL, S_GIBBOUS, S_HALF, S_CRESCENT, S_NEW, S_TWIN, S_RINGED, S_ECLIPSE, S_OVERCAST, S_N };
enum { X_MILKYWAY = 1, X_SHOOTING = 2, X_COMET = 4, X_BIRDS = 8, X_LIGHTHOUSE = 16, X_SAILBOAT = 32, X_CABIN = 64, X_GLITCH = 128 };
#define X_N 8
#define PAL_N 20      // palettes a public seed can get
#define PAL_SP 20     // the ten 1/1 palettes follow
#define PAL_ALL 29
#define SP_N 9        // 1/1 scenes (gen_special.c)
extern u8 gen_special;   // 0 = a normal piece; 1..SP_N = draw that 1/1 scene (set only by the admin path)

typedef struct {
  u8 palette, time, sky, terrain, ground, weather, layers, snowcaps, extras;
} traits_t;

// phases reported through gen_phase()
enum { P_SKY = 1, P_LIGHT, P_CLOUDS, P_RIDGE, P_GROUND, P_WATER, P_WEATHER, P_DONE };

void gen_traits(u32 seed, traits_t *t);
void gen_draw(u32 seed, traits_t *t);   // fills the 160x144 buffer with HARD+shade

extern const char *const gen_time_names[T_N];
extern const char *const gen_terrain_names[R_N];
extern const char *const gen_ground_names[G_N];
extern const char *const gen_weather_names[W_N];
extern const char *const gen_sky_names[S_N];
extern const char *const gen_extra_names[X_N];
extern const char *const gen_palette_names[PAL_ALL];
extern const u32 gen_palettes[PAL_ALL][4];   // 0xRRGGBB, lightest first
extern const u8 gen_bayer[64];             // 8x8 ordered dither thresholds 0..63
#endif
