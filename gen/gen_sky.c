// gb-seed-lab generator: sky, sun or moon, clouds. Switchable ROM bank on the Game Boy.
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

void draw_sky(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 1. sky
  {
    static const u8 ST[T_N][2] = { { 154, 45 }, { 96, 6 }, { 122, 38 }, { 186, 58 }, { 202, 122 }, { 205, 134 }, { 192, 122 } };
    skyTop = ST[t->time][0]; skyBot = ST[t->time][1];
  }
  for (y = 0; y < h; y++) { i16 v = skyAt(y); for (x = 0; x < GEN_W; x++) setT(x, y, v); }

  // 2. light source
  lx = rnd(26, 134);
  lowsun = t->sky == S_LOWSUN || t->sky == S_STRIPED || t->sky == S_DOUBLE;
  top = tall ? h / 5 : skyBottom * 28 / 100;
  if (t->sky == S_SUN || t->sky == S_HALOED || t->sky == S_DAYMOON) { i16 r = rnd(0, 18); ly = skyBottom * (16 + r) / 100; lrad = rnd(8, 11); }
  else if (lowsun) { ly = top + rnd(2, 14); lrad = rnd(13, 21); }
  else if (t->sky == S_ECLIPSE) { i16 r = rnd(0, 15); ly = skyBottom * (25 + r) / 100; lrad = rnd(13, 16); }
  else { i16 r = rnd(0, 26); ly = skyBottom * (14 + r) / 100; lrad = rnd(7, 13); }
  if (tall && ly > h * 30 / 100) ly = h * 30 / 100;
  hi_obj = !lowsun;
  if (hi_obj) ly = imax(lrad + 3, imin(ly, top - lrad * 3 / 10));
  glowR = lrad * (night ? 32 : t->sky == S_ECLIPSE ? 35 : 42) / 10;
  glowA = (t->sky == S_NEW || t->sky == S_OVERCAST) ? 0 : night ? 61 : t->time == T_DAY ? 45 : t->sky == S_ECLIPSE ? 83 : 51;
  if (glowA) {
    i32 R2 = (i32)glowR * glowR;
    for (y = imax(0, ly - glowR); y < imin(skyBottom, ly + glowR + 1); y++)
      for (x = imax(0, lx - glowR); x < imin(GEN_W, lx + glowR + 1); x++) {
        i32 d2 = (i32)(x - lx) * (x - lx) + (i32)(y - ly) * (y - ly);
        if (d2 < R2) { i32 f = 256 - d2 * 256 / R2; addT(x, y, -(i16)(glowA * (f * f / 256) * f / 65536)); }
      }
  }

  // 3. milky way, aurora
  if (t->extras & X_MILKYWAY) {
    i16 ang = rnd(-32, 32), ox = rnd(30, 130), oy = skyBottom * 3 / 10, ca = COSA(ang), sa = SINA(ang);
    for (y = 0; y < skyBottom; y++) for (x = 0; x < GEN_W; x++) {
      i16 d = iabs((i16)(((i32)(x - ox) * sa - (i32)(y - oy) * ca) / 127));
      i16 along = (i16)(((i32)x * ca + (i32)y * sa) / 127);
      i16 wob = 14 + 6 * SINA(along * 13 / 4) / 127;
      if (d < wob) {
        addT(x, y, -29 * (wob - d) / wob);
        if ((i32)(rnext() >> 16) < (i32)3277 * (wob - d) / wob) { u8 s = chance(77) ? 0 : 1; setStar(x, y, s); }
      }
    }
  }
  if (t->time == T_AURORA) {
    i16 p0 = rnd(0, 255), p1 = rnd(0, 255), p2 = rnd(0, 255), p3 = rnd(0, 255);
    for (x = 0; x < GEN_W; x++) {
      i16 yb = skyBottom * 12 / 100 + 9 * SINA(x * 15 / 8 + p0) / 127 + 4 * SINA(x * 16 / 3 + p1) / 127;
      i16 len = 26 + 14 * SINA(x * 5 / 2 + p2) / 127, s = SINA(x * 31 / 4 + p3);
      i16 I = 128 + (i16)((i32)230 * s * s / 16129);
      for (y = imax(0, yb); y < yb + len && y < skyBottom; y++) {
        i16 f = (i16)((i32)(y - yb) * 256 / len), pr = f < 38 ? f * 256 / 38 : (i16)((i32)(256 - f) * 256 / 218);
        addT(x, y, -(i16)((i32)I * pr / 256 * 96 / 256));
      }
    }
  }

  // 4. stars
  if (night || t->sky == S_ECLIPSE) {
    i16 n = t->sky == S_ECLIPSE ? 25 : rnd(50, 110);
    for (i = 0; i < n; i++) {
      i16 sx = rnd(0, GEN_W - 1), sy = rnd(0, skyBottom - 8);
      u8 s;
      if (isHard(sx, sy) || px_get(sx, sy) < 96) continue;
      s = chance(77) ? 1 : 0;
      setStar(sx, sy, s);
      if (chance(15)) { setStar(sx + 1, sy, 1); setStar(sx - 1, sy, 1); setStar(sx, sy + 1, 1); setStar(sx, sy - 1, 1); }
    }
  }
  gen_phase(P_SKY);
}

void draw_light(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 5. sun, moon, planet, eclipse
  side = chance(128) ? 1 : -1;
  g_shade = 0;
  switch (t->sky) {
    case S_SUN: case S_LOWSUN: disc(lx, ly, lrad, fn_hard); break;
    case S_HALOED: {
      i16 R = lrad * 23 / 10; i32 lo = (i32)R * R - R, hi = (i32)R * R + R;
      disc(lx, ly, lrad, fn_hard);
      for (y = -R - 1; y <= R + 1; y++) for (x = -R - 1; x <= R + 1; x++) {
        i32 d2 = (i32)x * x + (i32)y * y;
        if (d2 >= lo && d2 <= hi && (x * 7 + y * 13 + 1000) % 3 && inb(lx + x, ly + y)) setH(lx + x, ly + y, getT(lx + x, ly + y) > 45 ? 0 : 1);
      }
      break;
    }
    case S_STRIPED: g_rad = lrad; disc(lx, ly, lrad, fn_striped); break;
    case S_DOUBLE: disc(lx, ly, lrad, fn_hard); disc(lx + side * (lrad + 9), ly - lrad * 9 / 10, imax(4, lrad / 4), fn_hard); break;
    case S_DAYMOON: g_rad = lrad; g_side = side; disc(lx, ly, lrad, fn_daymoon); break;
    case S_FULL: moon(lx, ly, lrad, 0, side); break;
    case S_GIBBOUS: moon(lx, ly, lrad, 1, side); break;
    case S_HALF: moon(lx, ly, lrad, 2, side); break;
    case S_CRESCENT: moon(lx, ly, lrad, 3, side); break;
    case S_NEW: moon(lx, ly, lrad, 4, side); break;
    case S_TWIN: moon(lx, ly, lrad, 3, side); moon(lx - side * (lrad + 14), ly + lrad, imax(4, lrad / 2), 0, side); break;
    case S_RINGED: {
      i16 tilt = rnd(-16, 16), ct = COSA(tilt), st = SINA(tilt), A = lrad * 21 / 10, B = lrad / 2, pass;
      i32 AA = (i32)A * A * 16129, BB = (i32)B * B * 16129;
      for (pass = 0; pass < 2; pass++) {
        if (pass == 1) { g_rad = lrad; g_side = side; disc(lx, ly, lrad, fn_planet); }
        for (y = -A; y <= A; y++) for (x = -A; x <= A; x++) {
          i32 U = (i32)x * ct + (i32)y * st, V = -(i32)x * st + (i32)y * ct;
          i32 e = U * U / (AA / 256) + V * V / (BB / 256);   // 256 * ellipse value
          u8 front = V > 0, outside = (i32)x * x + (i32)y * y > (i32)lrad * lrad;
          if (e > 184 && e < 256 && (front == (u8)pass || (pass == 0 && outside))) setH(lx + x, ly + y, e > 220 ? 0 : 1);
        }
      }
      break;
    }
    case S_ECLIPSE: g_rad = lrad; disc(lx, ly, lrad, fn_eclipse); disc(lx + side * lrad * 7 / 10, ly - lrad * 7 / 10, 1, fn_hard); break;
    default: break;
  }
  if (t->sky == S_SUN || t->sky == S_HALOED || t->sky == S_LOWSUN || t->sky == S_STRIPED || t->sky == S_DOUBLE) {
    i32 lo = (i32)lrad * lrad + lrad * 3 / 5, hi = (i32)(lrad * 10 + 16) * (lrad * 10 + 16) / 100;
    for (y = -lrad - 2; y <= lrad + 2; y++) for (x = -lrad - 2; x <= lrad + 2; x++) {
      i32 d2 = (i32)x * x + (i32)y * y;
      if (d2 > lo && d2 < hi && inb(lx + x, ly + y) && !isHard(lx + x, ly + y)) setT(lx + x, ly + y, imax(px_get(lx + x, ly + y), 77));
    }
  }

  // 6. comet, shooting star
  if (t->extras & X_COMET) {
    i16 cx = rnd(20, 140), cy = rnd(10, skyBottom * 35 / 100), ang = rnd(0, 127), len = rnd(30, 55), ca = COSA(ang), sa = SINA(ang), j;
    for (k = 0; k < len; k++) {
      i16 w = 1 + k * 7 / len;
      for (j = -w; j <= w; j++) {
        i16 X = cx + (i16)(((i32)ca * k - (i32)sa * j) / 127), Y = cy + (i16)(((i32)ca * j - (i32)sa * k) * 3 / 5 / 127);
        addT(X, Y, -(i16)((i32)90 * (len - k) / len * (w + 1 - iabs(j)) / (w + 1)));
      }
    }
    g_shade = 0; disc(cx, cy, 1, fn_hard);
  }
  if (t->extras & X_SHOOTING) {
    i16 sx = rnd(30, 130), sy = rnd(5, skyBottom * 35 / 100), dx = chance(128) ? 1 : -1, len = rnd(14, 26);
    for (k = 0; k < len; k++) {
      sx += dx; sy += k % 2;
      if (k < len * 85 / 100 || k % 2) setH(sx, sy, k < len * 45 / 100 ? 0 : 1);
    }
  }
  gen_phase(P_LIGHT);
}

void draw_clouds(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 7. clouds
  {
    static const u8 CB[T_N] = { 45, 6, 32, 90, 157, 160, 154 };
    i16 base = CB[t->time], nc;
    if (t->weather == W_CLEAR) nc = rnd(0, 1);
    else if (t->weather == W_CLOUDS) nc = rnd(3, 6);
    else if (t->weather == W_FOG) nc = rnd(0, 2);
    else if (t->weather == W_SNOWFALL) nc = 2;
    else nc = 3;
    for (i = 0; i < nc; i++) {
      i16 cx = rnd(0, GEN_W), cy = rnd(6, skyBottom * 55 / 100), w = rnd(16, 46), b, nb = w / 5;
      u8 litBelow = ly > cy && !night;
      for (b = 0; b < nb; b++) {
        i16 bx = cx + rnd(-w / 2, w / 2), by = cy + rnd(-2, 1), br = rnd(3, 7);
        for (y = -br; y <= br; y++) for (x = -br * 8 / 5; x <= br * 8 / 5; x++) {
          i16 X = bx + x, Y = by + y, fy, v;
          if ((i32)25 * x * x + (i32)64 * y * y > (i32)64 * br * br || by + y > cy + 3 || !inb(X, Y)) continue;
          v = px_get(X, Y);
          if (v >= HARD && v < STAR) continue;
          fy = (y + br) * 256 / (2 * br);
          setT(X, Y, base + (litBelow ? (128 - fy) * 58 / 256 : (fy - 77) * 58 / 256));
        }
      }
    }
    if (t->weather == W_RAIN || t->weather == W_STORM || t->weather == W_SNOWFALL) {
      i16 deck = skyBottom * (t->weather == W_STORM ? 34 : 26) / 100, ph = rnd(0, 255);
      i16 dt = night ? 173 : t->weather == W_STORM ? 147 : 96;
      for (x = 0; x < GEN_W; x++) {
        i16 yb = deck + 4 * SINA(x * 9 / 2 + ph) / 127 + 2 * SINA(x * 12 + ph * 2) / 127;
        for (y = 0; y < yb && y < h; y++) setT(x, y, dt + y * 32 / yb);
      }
    }
  }
  gen_phase(P_CLOUDS);
}
