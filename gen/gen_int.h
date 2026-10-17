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

extern const i8 SIN[256];
u32 rnext(void);
void rseed(u32 s);
i16 rnd(i16 a, i16 b);
u8 chance(u8 p);
i16 imin(i16 a, i16 b);
i16 imax(i16 a, i16 b);
i16 iabs(i16 a);
i16 clampi(i16 v, i16 a, i16 b);
i16 smooth256(i16 a, i16 b, i16 v);
i16 expneg(i32 u);
extern i16 H;
u8 inb(i16 x, i16 y);
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

extern i16 md[257], prof[GEN_W], hgt[GEN_W], hs[GEN_W], grnd[GEN_W], tmp[GEN_W];
extern i16 pathx[320], pathy[320];
extern i16 lx, ly, lrad, skyBottom, horizon, skyTop, skyBot;
extern traits_t *t;
extern u8 night, wet, tall, lowsun, hi_obj;
extern i16 L, top, bottom, far, rimA, glowR, glowA, side, volx, voly;

void draw_sky(void) GEN_BANKED;
void draw_light(void) GEN_BANKED;
void draw_clouds(void) GEN_BANKED;
void ridge_setup(void) GEN_BANKED;
void draw_layer(i16 l) GEN_BANKED;
void draw_surface(void) GEN_BANKED;
void draw_features(void) GEN_BANKED;
void draw_water(void) GEN_BANKED;
void draw_weather(void) GEN_BANKED;
void draw_finish(void) GEN_BANKED;
#endif
