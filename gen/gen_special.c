// gb-seed-lab generator: the ten 1/1 scenes ("Ten Horizons"). Each is a hand-made landmark drawn with the same
// machinery as the main collection (sky, light, layered ridges with rim light, snow, mist, water mirror), plus its own
// props. Everything here is a function of x (no random numbers), so the banner pass continues each scene sideways
// with care instead of extending ridges at random. Never reachable from a public mint: gen_special is set only by
// gen_draw_special() (admin-only on the server, a separate frame on the Game Boy).
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

// palette, time, sky, terrain, ground, weather, layers, snowcaps, extras
static const u8 SPT[SP_N][9] = {
  { PAL_SP + 0, T_DAWN,   S_SUN,      R_PEAKS,   G_LAKE,     W_CLEAR, 4, 1, X_BIRDS },       // 1 Fuji at First Light
  { PAL_SP + 1, T_DUSK,   S_LOWSUN,   R_HILLS,   G_SEA,      W_CLEAR, 3, 0, 0 },             // 2 The Floating Gate
  { PAL_SP + 2, T_AURORA, S_CRESCENT, R_FJORD,   G_LAKE,     W_CLEAR, 4, 1, X_SHOOTING },    // 3 Lofoten Lights
  { PAL_SP + 3, T_DUSK,   S_LOWSUN,   R_MESAS,   G_DESERT,   W_CLEAR, 4, 0, X_COMET },       // 4 Monument Valley
  { PAL_SP + 4, T_NIGHT,  S_CRESCENT, R_PEAKS,   G_LAKE,     W_CLEAR, 4, 1, X_MILKYWAY },    // 5 Matterhorn Night
  { PAL_SP + 5, T_DAWN,   S_SUN,      R_ISLANDS, G_SEA,      W_FOG,   4, 0, X_BIRDS },       // 6 Ha Long Morning
  { PAL_SP + 6, T_DUSK,   S_LOWSUN,   R_MESAS,   G_DESERT,   W_CLEAR, 3, 0, 0 },             // 7 Uluru Dusk
  { PAL_SP + 7, T_NIGHT,  S_FULL,     R_DUNES,   G_DESERT,   W_CLEAR, 4, 0, X_SHOOTING },    // 8 Sahara Caravan
  { PAL_SP + 8, T_DAWN,   S_LOWSUN,   R_PEAKS,   G_MEADOW,   W_CLEAR, 4, 1, X_BIRDS },       // 9 Kilimanjaro Sunrise
  { PAL_SP + 9, T_DAWN,   S_LOWSUN,   R_ISLANDS, G_SEA,      W_CLEAR, 3, 0, 0 },             // 10 Horizon Zero
};

void sp_traits(traits_t *tt) GEN_BANKED {
  const u8 *s = SPT[gen_special - 1];
  tt->palette = s[0]; tt->time = s[1]; tt->sky = s[2]; tt->terrain = s[3]; tt->ground = s[4];
  tt->weather = s[5]; tt->layers = s[6]; tt->snowcaps = s[7]; tt->extras = s[8];
}

// horizon (wet scenes) and where the sun or moon sits
void sp_horizon(void) GEN_BANKED {
  static const u8 HZ[SP_N] = { 98, 92, 100, 144, 100, 96, 144, 144, 144, 92 };
  horizon = HZ[gen_special - 1];
  skyBottom = wet ? horizon : GEN_HEIGHT * 80 / 100;
}
void sp_light(void) GEN_BANKED {
  // x, y, radius
  static const i16 LP[SP_N][3] = {
    { 128, 22, 8 },    // Fuji: a small morning sun beside the summit
    { 80, 62, 17 },    // the gate: the sun sets behind it
    { 126, 18, 9 },    // Lofoten: crescent over the peaks
    { 22, 74, 15 },    // Monument Valley: low sun far left
    { 34, 22, 8 },     // Matterhorn: crescent left of the peak
    { 112, 30, 9 },    // Ha Long: hazy morning sun
    { 28, 92, 14 },    // Uluru: the sun on the horizon at the left edge
    { 118, 30, 14 },   // Sahara: a big full moon
    { 146, 58, 13 },   // Kilimanjaro: sunrise right of the mountain
    { 80, 111, 16 },   // Horizon Zero: the sun still below the horizon (the water covers it), only its glow shows
  };
  const i16 *p = LP[gen_special - 1];
  lx = p[0]; ly = p[1]; lrad = p[2];
  side = 1;
}

// ---------------------------------------------------------------- shapes (heights in px, as functions of x)

// gentle natural roughness: a few sines, amplitude a px
static i16 rough(i16 x, i16 a, u8 ph) {
  return (i16)(((i32)a * (SINA(x * 9 / 2 + ph) * 3 + SINA(x * 23 / 2 + ph * 3) * 2 + SINA(x * 41 / 2 + ph * 7))) / (127 * 6));
}
// smooth bump 0..256 at distance d of half-width w (1 - u^2)^2
static i16 bump(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 0;
  u = (i32)d * 256 / w; u = 256 - u * u / 256;
  return (i16)(u * u / 256);
}
// concave volcano flank: 0 at the summit, 256 at the foot (steep high, gentle low)
static i16 flank(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 256;
  u = (i32)d * 256 / w;
  return (i16)(u * (512 - u) / 256);
}
// a flat-topped butte: 256 on top, steep walls with a talus foot
static i16 butte(i16 d, i16 w, i16 wall) {
  if (d < 0) d = -d;
  if (d <= w) return 256;
  if (d <= w + wall) return 256 - (i16)((i32)(d - w) * 170 / wall);
  if (d <= w + wall * 4) return 86 - (i16)((i32)(d - w - wall) * 86 / (wall * 3));
  return 0;
}
// a karst tower: near-vertical sides, a rounded top
static i16 tower(i16 d, i16 w) {
  i32 u;
  if (d < 0) d = -d;
  if (d >= w) return 0;
  u = (i32)d * 256 / w;
  if (u < 150) return 256 - (i16)(u * u / 600);
  return (i16)((256 - u) * 220 / 106);
}

static i16 sp_y(i16 l, i16 x) {   // ridge line of layer l at column x, in px from the top
  i16 hz = horizon - 1, y = hz, b, k;
  switch (gen_special) {
    case 1:   // Fuji
      if (l == 0) return 64 + rough(x + 300, 4, 11) - bump(x - 10, 60) / 32 - bump(x - 170, 70) / 28;
      if (l == 1) { i16 d = x - 80, tp = 24; if (iabs(d) <= 5) return tp + iabs(d) / 4 + (d == 0 ? 1 : 0); return tp + 1 + (i16)((i32)(hz - tp - 1) * flank(iabs(d) - 5, 96) / 256) + rough(x, 1, 3); }
      if (l == 2) return hz - 9 - bump(x + 10, 50) / 22 - bump(x - 150, 46) / 20 + rough(x, 2, 40);
      return hz - 3 - bump(x - 4, 26) / 16 - bump(x + 120, 60) / 22 - bump(x - 220, 70) / 24 + rough(x, 1, 90);
    case 2:   // the floating gate: Misen's soft ridge across the bay
      if (l == 0) return hz - 10 - bump(x - 20, 60) / 14 - bump(x - 150, 50) / 18 - bump(x + 90, 80) / 13 - bump(x - 250, 70) / 14 + rough(x, 2, 5);
      return SENT;
    case 3:   // Lofoten: steep, jagged fjord walls (Reine)
      {
        static const i16 PX[3][8] = { { -120, -70, -24, 20, 66, 112, 170, 240 }, { -90, -30, 40, 92, 132, 196, 256, 300 }, { -110, -10, 60, 150, 230, 290, 330, 340 } };
        static const u8 PW[3] = { 20, 26, 34 }, PH[3] = { 26, 44, 20 };
        i16 v = 0;
        if (l == 3) return hz - 2 - bump(x - 52, 34) / 40 - bump(x + 60, 60) / 30 - bump(x - 240, 60) / 30;
        for (k = 0; k < 8; k++) {
          i16 d = x - PX[l][k], w = PW[l] + (k * 7) % 9, sk = (k % 2) ? w / 3 : -w / 4, u, hh = PH[l] + (k * 13) % 15;
          d = d < sk ? (i16)((i32)d * w / imax(4, w + sk)) : (i16)((i32)d * w / imax(4, w - sk));   // lean: one side steeper
          if (iabs(d) >= w) continue;
          u = 256 - (i16)((i32)iabs(d) * 256 / w);
          u = (i16)((i32)u * u / 256 * (256 + u) / 512);   // concave flanks, a sharp summit
          v = imax(v, (i16)((i32)u * hh / 256));
        }
        return hz - 6 - v + rough(x, l == 1 ? 3 : 2, (u8)(21 + l * 30));
      }
    case 4:   // Monument Valley: the Mittens and Merrick Butte
      if (l == 0) return 96 + rough(x + 50, 2, 9) - butte(x + 60, 60, 3) / 40 - butte(x - 200, 40, 3) / 36;
      if (l == 1) return 104 - butte(x - 150, 26, 3) / 9 - butte(x + 100, 30, 3) / 9 + rough(x, 1, 19);
      if (l == 2) {
        i16 v = imax(butte(x - 34, 9, 2), butte(x - 100, 10, 2));
        v = imax(v, butte(x - 140, 8, 2) * 8 / 10);
        v = imax(v, imax(bump(x - 50, 3) * 14 / 16, bump(x - 117, 3) * 13 / 16));   // the mittens' thumbs
        return 116 - (i16)((i32)v * 62 / 256) + (v > 230 ? 0 : rough(x, 1, 29));
      }
      return 124 + rough(x, 1, 3);
    case 5:   // Matterhorn: the hooked pyramid over the Riffelsee
      if (l == 0) return hz - 22 - bump(x - 10, 40) / 10 - bump(x - 160, 46) / 9 - bump(x + 100, 50) / 10 - bump(x - 260, 50) / 9 + rough(x, 3, 13);
      if (l == 1) {   // the summit leans right: a steep east face on the left, the Zmutt shoulder on the right
        i16 d = x - 84, top = 16;
        if (d <= 0) { i16 u = -d; return top + u * 6 / 5 + (i16)((i32)u * u / 90) + rough(x, 1, 2); }
        if (d < 12) return top + d * 7 / 4;
        if (d < 34) return top + 21 + (d - 12) / 3 + rough(x, 1, 6);
        return top + 28 + (d - 34) * 9 / 10 + rough(x, 1, 8);
      }
      if (l == 2) return hz - 8 - bump(x - 20, 44) / 16 - bump(x - 150, 40) / 14 - bump(x + 80, 50) / 14 + rough(x, 2, 44);
      return hz - 2 - bump(x - 120, 30) / 40 - bump(x + 20, 50) / 30 - bump(x - 230, 50) / 32 + rough(x, 1, 66);
    case 6:   // Ha Long: karst towers in rows, far to near
      {
        static const i16 TX[4][7] = { { -120, -60, 4, 52, 104, 168, 232 }, { -100, -30, 30, 84, 150, 210, 270 }, { -80, 14, 66, 128, 190, 250, 290 }, { -126, -40, 40, 140, 220, 264, 300 } };
        static const u8 TW[4] = { 10, 12, 14, 16 }, TH[4] = { 30, 40, 54, 66 };
        i16 v = 0;
        for (k = 0; k < 7; k++) { i16 w = TW[l] + (k * 5) % 7, hh = TH[l] - (k * 11) % 17; v = imax(v, (i16)((i32)tower(x - TX[l][k], w) * hh / 256)); }
        return v ? hz - v + rough(x, 1, (u8)(l * 40)) : SENT;
      }
    case 7:   // Uluru (and Kata Tjuta's domes, seen in the banner)
      if (l == 0) return 108 + rough(x + 20, 1, 9) - bump(x - 220, 80) / 60;
      if (l == 1) {
        i16 d = x - 84, v = butte(d, 50, 9), kt = 0;
        if (iabs(d) <= 50) v = 224 + bump(d, 62) / 8;   // a softly domed top
        for (k = 0; k < 5; k++) { i16 c = -126 + k * 18, w = 17 + (k * 5) % 7; kt = imax(kt, (i16)((i32)bump(x - c, w) * (120 + (k * 37) % 60) / 256)); }
        return 110 - (i16)((i32)imax(v, kt) * 30 / 256);
      }
      return 126 + rough(x, 1, 31) - bump(x + 30, 60) / 64;
    case 8:   // Sahara: dune crests
      {
        static const u8 LAM[4] = { 70, 90, 120, 160 }, BY[4] = { 82, 92, 104, 120 }, AM[4] = { 8, 12, 16, 18 }, PH[4] = { 7, 41, 90, 13 };
        i16 lam = LAM[l], s = (i16)(((i32)(x + 1000 + PH[l] * 3) % lam) * 256 / lam), wv = s < 180 ? (i16)((i32)s * 256 / 180) : (i16)((i32)(256 - s) * 256 / 76);
        wv = (i16)((i32)wv * wv / 256);
        return BY[l] - (i16)((i32)AM[l] * wv / 256) + rough(x, 1, PH[l]);
      }
    case 9:   // Kilimanjaro: Kibo's long flat summit and Mawenzi's spikes over the savanna
      if (l == 0) return 106 + rough(x, 1, 3);
      if (l == 1) {
        i16 d = x - 62, kibo, maw = bump(x - 124, 18) * 9 / 16 + bump(x - 121, 5) / 7;
        kibo = iabs(d) < 20 ? 236 - (i16)((i32)d * d / 70) : (i16)((i32)(256 - flank(iabs(d) - 20, 90)) * 230 / 256);
        return 116 - (i16)((i32)imax(kibo, maw) * 86 / 256) + (iabs(d) < 24 ? (d + 24) / 12 : 0) + rough(x, 1, 5);   // the top tilts toward the rising sun, so it reads lit
      }
      if (l == 2) return 122 + rough(x, 2, 17) - bump(x - 20, 50) / 40;
      return 132 + rough(x, 1, 23);
    case 10:  // Horizon Zero: nothing but the line
      return SENT;
  }
  (void)b;
  return y;
}

// layer profile for the current special scene into hgt[] (1/8 px); 1 if handled
u8 sp_profile(i16 l) GEN_BANKED {
  i16 x;
  for (x = GX0; x < GX1; x++) {
    i16 y = sp_y(l, x);
    if (y == SENT) { hgt[IX(x)] = SENT; continue; }
    y = clampi(y, 6, wet ? horizon - 1 : GEN_HEIGHT - 1);
    hgt[IX(x)] = y * 8;
  }
  return 1;
}

// ---------------------------------------------------------------- props

static void hline(i16 x0, i16 x1, i16 y, u8 s) { i16 x; for (x = x0; x <= x1; x++) setH(x, y, s); }
static void vline(i16 x, i16 y0, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) setH(x, y, s); }
static void rect(i16 x0, i16 y0, i16 x1, i16 y1, u8 s) { i16 y; for (y = y0; y <= y1; y++) hline(x0, x1, y, s); }
static i16 ground_y(i16 l, i16 x) { i16 y = sp_y(l, x); return y == SENT ? horizon : y; }

// a little house: w wide, walls hw high, a steep roof, an optional lit window
static void house(i16 x, i16 gy, i16 w, i16 hw, u8 lit) {
  i16 y, k;
  rect(x - w, gy - hw, x + w, gy, 3);
  for (y = 0; y <= w + 1; y++) hline(x - w - 1 + y, x + w + 1 - y, gy - hw - y, 3);
  for (k = -w - 1; k <= 0; k++) setH(x + k, gy - hw - (k + w + 1), 2);   // a lighter roof edge
  if (lit) { setH(x - 1, gy - hw / 2, 0); setH(x, gy - hw / 2, 0); setH(x - 1, gy - hw / 2 + 1, 1); setH(x, gy - hw / 2 + 1, 1); }
}
// Lofoten rorbu: a house on stilts over the water
static void rorbu(i16 x, i16 w, i16 hw, u8 lit) {
  i16 gy = horizon - 4, k;
  for (k = -w; k <= w; k += 3) vline(x + k, gy + 1, horizon + 1, 3);
  house(x, gy, w, hw, lit);
}
// a camel: body, hump, neck, head, four legs (dir 1 walks right)
static void camel(i16 x, i16 gy, i16 dir, u8 rider) {
  static const i8 BODY[] = { -5, -4, -3, -2, -1, 0, 1, 2, 3, 4 };
  i16 k, y;
  for (k = 0; k < 10; k++) { i16 bx = x + dir * BODY[k], top = gy - 9 - (k >= 2 && k <= 6 ? (k == 4 ? 3 : 2) : 0); vline(bx, top, gy - 6, 3); }
  for (k = 0; k < 4; k++) { i16 lx0 = x + dir * (k < 2 ? -4 + k * 2 : 2 + (k - 2) * 2); vline(lx0, gy - 5, gy, 3); }
  for (y = 0; y < 6; y++) setH(x + dir * (5 + y / 2), gy - 8 - y, 3);   // neck
  hline(imin(x + dir * 8, x + dir * 10), imax(x + dir * 8, x + dir * 10), gy - 14, 3);   // head
  setH(x + dir * 10, gy - 13, 3);
  if (rider) { vline(x, gy - 16, gy - 12, 3); setH(x - 1, gy - 15, 3); setH(x + 1, gy - 15, 3); setH(x, gy - 17, 3); }
}
// a flat-crowned acacia
static void acacia(i16 x, i16 gy, i16 s) {
  i16 y, k;
  for (y = 0; y < 3 * s; y++) setH(x + y / 6, gy - y, 3);
  for (k = 0; k < s; k++) { setH(x + k / 2 + 1, gy - 2 * s - k, 3); setH(x - k / 2, gy - 2 * s - k, 3); }
  for (k = -1; k <= 1; k++) hline(x - 4 * s + iabs(k) * s, x + 5 * s - iabs(k) * s, gy - 3 * s - 1 + k, 3);
  hline(x - 3 * s, x + 4 * s, gy - 3 * s - 2, 3);
  for (k = -4 * s; k <= 5 * s; k += 3) setH(x + k, gy - 3 * s - 3, 2);
}
// a giraffe (dir 1 faces right)
static void giraffe(i16 x, i16 gy, i16 dir) {
  i16 k;
  for (k = 0; k < 4; k++) vline(x + dir * (k < 2 ? -3 + k : 2 + k - 2), gy - 7, gy, 3);
  rect(imin(x - dir * 3, x + dir * 3), gy - 10, imax(x - dir * 3, x + dir * 3), gy - 7, 3);
  for (k = 0; k < 10; k++) { setH(x + dir * (3 + k / 4), gy - 10 - k, 3); setH(x + dir * (4 + k / 4), gy - 10 - k, 3); }
  hline(imin(x + dir * 5, x + dir * 8), imax(x + dir * 5, x + dir * 8), gy - 20, 3);
  setH(x + dir * 5, gy - 22, 3);
}
// a junk boat with battened sails
static void junk(i16 x, i16 sz) {
  i16 yb = horizon - 1, k, y, m;
  for (k = -5 * sz; k <= 5 * sz; k++) { setH(x + k, yb, 3); if (iabs(k) < 4 * sz) setH(x + k, yb - 1, 3); }
  setH(x - 5 * sz - 1, yb - 1, 3); setH(x + 5 * sz + 1, yb - 2, 3);
  for (m = 0; m < 2; m++) {
    i16 mx = x - 2 * sz + m * 4 * sz, ht = (m ? 14 : 18) * sz / 2 + 4;
    vline(mx, yb - ht - 1, yb - 2, 3);
    for (y = 3; y < ht; y++) {   // a filled fan-shaped sail, its battens every third row
      i16 w = 2 + (i16)((i32)(ht - y) * 5 * sz / ht) + sz;
      hline(mx + 1, mx + w, yb - y, y % 3 == 0 ? 3 : 1);
      setH(mx + w + 1, yb - y, 3);
    }
  }
}
// cherry blossom branch from (x0,y0), going dir, n segments
static void blossom(i16 x0, i16 y0, i16 dir, u8 n, u8 ph) {
  i16 k, x = x0, y = y0;
  for (k = 0; k < n; k++) {
    i16 nx = x + dir * 3, ny = y + (SINA(k * 40 + ph) > 30 ? 1 : 0), j;
    for (j = 0; j < 3; j++) { setH(x + dir * j, y + (j == 2 ? ny - y : 0), 3); if (k < n / 2) setH(x + dir * j, y + 1, 3); }
    if (k % 3 == 1) {   // a twig going down with a cluster
      i16 tx = x + dir, ty = y;
      for (j = 0; j < 4; j++) { tx += (j % 2) * dir; ty++; setH(tx, ty, 3); }
      for (j = -3; j <= 3; j++) { i16 c; for (c = -3 + iabs(j) / 2; c <= 3 - iabs(j) / 2; c++) if ((c * 7 + j * 3 + k + 40) % 5) setH(tx + c, ty + 2 + j, (c + j + k) % 4 ? 1 : 0); }
    }
    if (k % 2 == 0) { for (j = -2; j <= 2; j++) { i16 c; for (c = -2 + iabs(j) / 2; c <= 2 - iabs(j) / 2; c++) if ((c * 5 + j + k + 20) % 4) setH(x + c, y - 2 + j, (c + k) % 3 ? 1 : 0); } }
    x = nx; y = ny;
  }
}
// a torii gate standing in the sea (drawn after the water, with its own reflection)
static void torii(i16 x, i16 base, i16 ht) {
  i16 w = ht * 6 / 10, k, y;
  for (k = -1; k <= 1; k += 2) { i16 px = x + k * w / 2; rect(px - 2, base - ht, px + 2, base, 3); rect(px - 3, base - 2, px + 3, base, 3); }
  rect(x - w / 2 - 4, base - ht + 6, x + w / 2 + 4, base - ht + 8, 3);   // nuki
  for (k = -w / 2 - 9; k <= w / 2 + 9; k++) {   // kasagi, rising at both ends
    i16 e = iabs(k) > w / 2 ? (iabs(k) - w / 2) / 3 : 0;
    vline(x + k, base - ht - 4 - e, base - ht - 1 - e / 2, 3);
  }
  vline(x, base - ht + 1, base - ht + 6, 3); setH(x - 1, base - ht + 3, 3); setH(x + 1, base - ht + 3, 3);   // gakuzuka
  for (y = 1; y < 14; y++) for (k = -1; k <= 1; k += 2) {   // a broken reflection of the pillars
    i16 px = x + k * w / 2 + SINA(y * 50) / 64;
    if (y % 3) hline(px - 2, px + 2, base + y, y > 8 ? 2 : 3);
  }
}
// a pagoda silhouette (banner sides)
static void pagoda(i16 x, i16 gy, u8 tiers) {
  i16 k, w;
  for (k = 0; k < tiers; k++) {
    i16 y = gy - k * 6;
    w = 6 - k;
    rect(x - w + 2, y - 4, x + w - 2, y, 3);
    hline(x - w - 1, x + w + 1, y - 5, 3); setH(x - w - 2, y - 6, 3); setH(x + w + 2, y - 6, 3);
  }
  vline(x, gy - tiers * 6 - 6, gy - tiers * 6, 3);
}

// before the water: things on the ground or the shore (they reflect)
void sp_features(void) GEN_BANKED {
  i16 k;
  switch (gen_special) {
    case 1:   // a lakeside house with its light on, and in the banner a pagoda on the left hill (Chureito)
      house(32, ground_y(3, 32), 5, 5, 1);
#ifndef __SDCC
      if (WIDE) { pagoda(-84, ground_y(2, -84) + 1, 5); house(-30, ground_y(3, -30), 4, 4, 1); house(230, ground_y(3, 230), 4, 4, 0); }
#endif
      break;
    case 3:   // rorbuer along the shore, a few windows lit
      for (k = 0; k < 5; k++) rorbu(20 + k * 13, 5, 5, (u8)(k % 2 == 0));
#ifndef __SDCC
      if (WIDE) { for (k = 0; k < 4; k++) rorbu(-110 + k * 13, 5, 5, (u8)(k == 1)); for (k = 0; k < 3; k++) rorbu(200 + k * 14, 5, 6, (u8)(k != 1)); }
#endif
      break;
    case 5:   // the hut below the peak, its window lit
      house(126, ground_y(3, 126), 4, 4, 1);
      break;
    case 6:   // a junk under sail
      junk(46, 2);
#ifndef __SDCC
      if (WIDE) { junk(-80, 1); junk(250, 2); }
#endif
      break;
    case 8:   // a caravan along the near-middle crest
      for (k = 0; k < 5; k++) { i16 cx = 34 + k * 22; camel(cx, ground_y(2, cx), 1, (u8)(k == 0)); }
#ifndef __SDCC
      if (WIDE) { for (k = 1; k <= 5; k++) { i16 cx = 34 - k * 22; camel(cx, ground_y(2, cx), 1, 0); } for (k = 0; k < 4; k++) { i16 cx = 200 + k * 22; camel(cx, ground_y(2, cx), 1, (u8)(k == 2)); } }
#endif
      break;
    case 9:   // an acacia and two giraffes
      acacia(118, ground_y(2, 118), 4);
      giraffe(40, ground_y(2, 40), 1); giraffe(56, ground_y(2, 56) + 1, 1);
#ifndef __SDCC
      if (WIDE) { acacia(-70, ground_y(2, -70), 3); acacia(230, ground_y(2, 230), 5); for (k = 0; k < 3; k++) giraffe(-20 - k * 15, ground_y(2, -20 - k * 15), -1); }
#endif
      break;
  }
}

// after the water and weather, before dithering: foreground (no reflection)
void sp_after(void) GEN_BANKED {
  i16 x, y;
  switch (gen_special) {
    case 1:   // a cherry branch entering from the top right
      blossom(GEN_W + 40, 10, -1, 20, 9); blossom(GEN_W + 10, 2, -1, 9, 50);
#ifndef __SDCC
      if (WIDE) { blossom(-150, 12, 1, 16, 33); blossom(-140, 3, 1, 7, 71); }
#endif
      break;
    case 2:   // the gate in the sea, the sun behind it
      torii(80, horizon + 20, 46);
#ifndef __SDCC
      if (WIDE) pagoda(-74, ground_y(0, -74) + 2, 5);
#endif
      break;
    case 4:   // the road into the valley
      for (y = 124; y < GEN_HEIGHT; y++) {
        i16 hw = (y - 122) * 7 / 4, d = y - 124;
        for (x = 80 - hw; x <= 80 + hw; x++) setH(x, y, (iabs(x - 80) <= hw / 12 && (d / 3) % 2 == 0 && d > 2) ? 0 : 3);
        setH(80 - hw - 1, y, 1); setH(80 + hw + 1, y, 1);
      }
      break;
    case 10:  // one star
      setStar(124, 16, 0); setStar(123, 16, 1); setStar(125, 16, 1); setStar(124, 15, 1); setStar(124, 17, 1);
#ifndef __SDCC
      if (WIDE) {   // and far out on the right, a tiny sail
        i16 x0 = 262, yb = horizon - 1, dx;
        for (dx = -2; dx <= 2; dx++) setH(x0 + dx, yb, 3);
        for (y = 1; y < 6; y++) for (dx = 0; dx <= (y - 1) / 2; dx++) setH(x0 + dx, yb - 6 + y, 2);
      }
#endif
      break;
  }
}
