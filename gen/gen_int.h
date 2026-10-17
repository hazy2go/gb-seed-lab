// Internal interface between the generator files. On the Game Boy the drawing phases live in
// switchable ROM banks (the code is ~40 KB); everything in gen_core.c stays in the fixed bank.
#ifndef GEN_INT_H
#define GEN_INT_H
#include "gen.h"
#ifdef __SDCC
#include <gb/gb.h>
#define GEN_BANKED BANKED
#else
#define GEN_BANKED
#endif

#define SINA(a) ((i16)SIN[(u8)(a)])          // angle in 1/256 turn, result -127..127
#define COSA(a) ((i16)SIN[(u8)((a) + 64)])
#define SENT 32767

// Drawing range in picture x. Always 0..160 on the Game Boy. On the PC the banner pass widens it to -136..296
// (432 columns) and replays the normal pass's ridges and sky parameters, so the scene continues sideways.
#ifdef __SDCC
#define GX0 0
#define GX1 GEN_W
#define GEN_WMAX GEN_W
#define WIDE 0
#define KEEP(slot, v) (v)
#define SYNC(slot)
#define SIDE_BEGIN(tag)
#define SIDE_END()
#else
#define GEN_WMAX 432
extern i16 GX0, GX1;
extern u8 WIDE;
i16 gen_keep(u8 slot, i16 v);   // normal pass: remember v; banner pass: give back the remembered value
u32 rs_get(void);
void rs_set(u32 v);
extern u32 gen_seed_now;
#define KEEP(slot, v) gen_keep(slot, v)
// banner pass: SYNC puts the main random stream back where the normal pass had it at the same step, so each step
// starts identical to the piece; SIDE_BEGIN/END run side-only randomness on a separate stream
void gen_sync(u8 slot); void gen_side_begin(u32 tag); void gen_side_end(void);
#define SYNC(slot) gen_sync(slot)
#define SIDE_BEGIN(tag) gen_side_begin(tag)
#define SIDE_END() gen_side_end()
#endif
#define IX(x) ((x) - GX0)       // array index of picture column x

extern const i8 SIN[256];
u32 rnext(void);
void rseed(u32 s);
i16 rnd(i16 a, i16 b);
u8 chance(u8 p);
static inline i16 imin(i16 a, i16 b) { return a < b ? a : b; }
static inline i16 imax(i16 a, i16 b) { return a > b ? a : b; }
static inline i16 iabs(i16 a) { return a < 0 ? -a : a; }
static inline i16 clampi(i16 v, i16 a, i16 b) { return v < a ? a : v > b ? b : v; }
i16 smooth256(i16 a, i16 b, i16 v);
u8 frac256(u16 n, u16 d);
i16 mul256s(i16 x, u16 a);
void fill_row(i16 y, i16 t);
i16 expneg(i32 u);
extern i16 H;
static inline u8 inb(i16 x, i16 y) { return x >= GX0 && x < GX1 && y >= 0 && y < H; }
void setH(i16 x, i16 y, u8 s);
void setStar(i16 x, i16 y, u8 s);
void setT(i16 x, i16 y, i16 t);
i16 getT(i16 x, i16 y);
u8 isHard(i16 x, i16 y);
void addT(i16 x, i16 y, i16 d);
void setTsoft(i16 x, i16 y, i16 t);
i16 skyAt(i16 y);
typedef void (*discfn)(i16 X, i16 Y, i16 x, i16 y);
void disc(i16 cx, i16 cy, i16 rad, discfn fn);
void moon(i16 cx, i16 cy, i16 rad, u8 phase, i16 side);
void fn_hard(i16 X, i16 Y, i16 x, i16 y);
void fn_striped(i16 X, i16 Y, i16 x, i16 y);
void fn_daymoon(i16 X, i16 Y, i16 x, i16 y);
void fn_planet(i16 X, i16 Y, i16 x, i16 y);
void fn_eclipse(i16 X, i16 Y, i16 x, i16 y);
void fn_puff(i16 X, i16 Y, i16 x, i16 y);
extern i16 g_rad, g_side, g_off, g_puff;
extern u8 g_phase, g_shade;

extern i16 md[257], prof[GEN_WMAX], hgt[GEN_WMAX], hs[GEN_WMAX], grnd[GEN_WMAX], tmp[GEN_WMAX];
extern i16 pathx[320], pathy[320];
extern i16 lx, ly, lrad, skyBottom, horizon, skyTop, skyBot;
extern traits_t *t;
extern u8 night, wet, lowsun, hi_obj;
extern i16 L, top, bottom, far, rimA, glowR, glowA, side, volx, voly, cabx;
extern u8 skyl[GEN_WMAX];   // per column: the highest ridge line of all layers (sky above it is open)
extern u8 smoke_sun;
void smoke(i16 cx, i16 cy, i16 r, i16 tone, i16 a);

void draw_sky(void) GEN_BANKED;
void draw_light(void) GEN_BANKED;
void draw_clouds(void) GEN_BANKED;
void ridge_setup(void) GEN_BANKED;
void draw_layer(i16 l) GEN_BANKED;
void draw_volcano(void) GEN_BANKED;
void draw_surface(void) GEN_BANKED;
void draw_features(void) GEN_BANKED;
void draw_water(void) GEN_BANKED;
void draw_weather(void) GEN_BANKED;
void draw_finish(void) GEN_BANKED;
#endif
