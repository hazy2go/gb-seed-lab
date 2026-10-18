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
    static const u8 ST[T_N][2] = { { 154, 45 }, { 96, 6 }, { 122, 38 }, { 186, 58 }, { 202, 92 }, { 205, 104 }, { 192, 110 } };   // night: a lighter horizon keeps the ridges apart
    skyTop = ST[t->time][0]; skyBot = ST[t->time][1];
    // overcast: a flatter, darker grey sky under the deck (the deck stays the darkest part)
    if (t->sky == S_OVERCAST && !night) { skyTop = t->weather == W_STORM ? 150 : 128; skyBot = imax(skyBot, t->weather == W_STORM ? 84 : 64); }
  }
  for (y = 0; y < h; y++) fill_row(y, skyAt(y));
  if (t->sky == S_ECLIPSE) {   // a total eclipse leaves a light ring on the horizon, so the ridges separate from it
    i16 y1 = skyBottom * 45 / 100;
    for (y = y1; y < h; y++) fill_row(y, skyAt(y) - (i16)((i32)60 * smooth256(y1, skyBottom, y) / 256));
  }

  // 2. light source
  lx = rnd(26, 134);
  lowsun = t->sky == S_LOWSUN || t->sky == S_STRIPED || t->sky == S_DOUBLE;
  top = skyBottom * 28 / 100;
  if (t->sky == S_SUN || t->sky == S_HALOED || t->sky == S_DAYMOON) { i16 r = rnd(0, 18); ly = skyBottom * (16 + r) / 100; lrad = rnd(8, 11); }
  else if (lowsun) { ly = top + rnd(2, 14); lrad = rnd(13, 21); }
  else if (t->sky == S_ECLIPSE) { i16 r = rnd(0, 15); ly = skyBottom * (25 + r) / 100; lrad = rnd(13, 16); }
  else { i16 r = rnd(0, 26); ly = skyBottom * (14 + r) / 100; lrad = rnd(7, 13); }
  hi_obj = !lowsun;
  {
    // the farthest ridge's base (with 5-6 ridges it sits high)
    i16 q0 = 256 / t->layers, bot = wet ? horizon - 3 : (i16)((i32)h * 78 / 100), base0;
    q0 = q0 - (i16)((i32)q0 * (256 - q0) / 1900);
    base0 = top + (i16)((i32)(bot - top) * q0 / 256);
    if (hi_obj) {   // keep a high sun or moon clear of it
      if (lrad > (base0 - 9) / 2) lrad = imax(5, (base0 - 9) / 2);
      ly = imax(lrad + 3, imin(ly, imin(top - lrad * 3 / 10, base0 - lrad - 6)));
    } else ly = imin(ly, base0 - 6);   // a low sun's centre above every ridge base, so the clearance keeps at least half of it
  }
  if (gen_special) sp_light();   // a 1/1 scene places its own sun or moon
  glowR = lrad * (night ? 32 : t->sky == S_ECLIPSE ? 35 : 42) / 10;
  glowA = (t->sky == S_NEW || t->sky == S_OVERCAST) ? 0 : night ? 61 : t->time == T_DAY ? 45 : t->sky == S_ECLIPSE ? 83 : 51;
  if (glowA) {
    // glowR <= 88, so squared distances fit 16 bits; the falloff glowA*(f*f/256)*f/65536 is a table over f
    i16 R2 = glowR * glowR, f;
    for (f = 0; f <= 256; f++) md[f] = (i16)(glowA * ((i32)f * f / 256) * f / 65536);
    for (y = imax(0, ly - glowR); y < imin(skyBottom, ly + glowR + 1); y++) {
      i16 dy2 = (y - ly) * (y - ly);
      for (x = imax(GX0, lx - glowR); x < imin(GX1, lx + glowR + 1); x++) {
        i16 d2 = (x - lx) * (x - lx) + dy2;
        if (d2 < R2) addT(x, y, -md[256 - frac256((u16)d2, (u16)R2)]);
      }
    }
  }

  // 3. milky way, aurora
  if (t->extras & X_MILKYWAY) {
    // Same maths as d = |((x-ox)*sa - (y-oy)*ca) / 127|, along = (x*ca + y*sa) / 127 (C truncation), stepped
    // along each row with a floor quotient and remainder so no pixel needs a division.
    static i8 mwA[13][21];     // -29 * (wob - d) / wob      for wob 8..20
    static i16 mwC[13][21];    // 3277 * (wob - d) / wob     (star chance)
    i16 ang = KEEP(0, rnd(-32, 32)), ox = KEEP(1, rnd(30, 130)), oy = skyBottom * 3 / 10, ca = COSA(ang), sa = SINA(ang), w, df;
    for (w = 8; w <= 20; w++) for (df = 0; df <= w; df++) { mwA[w - 8][df] = (i8)(-29 * df / w); mwC[w - 8][df] = (i16)((i32)3277 * df / w); }
    for (i = 0; i < 256; i++) md[i] = 14 + 6 * SINA(i) / 127;   // wob by angle
    for (y = 0; y < skyBottom; y++) {
      i32 m = (i32)GX0 * ca + (i32)y * sa, n = (i32)(GX0 - ox) * sa - (i32)(y - oy) * ca;   // values at the first column
      i16 qa = (i16)(m / 127), ra = (i16)(m % 127), qd = (i16)(n / 127), rd = (i16)(n % 127);
      if (ra < 0) { ra += 127; qa--; }
      if (rd < 0) { rd += 127; qd--; }
      for (x = GX0; x < GX1; x++) {
        i16 along = qa >= 0 || ra == 0 ? qa : qa + 1;
        i16 d = qd >= 0 ? qd : rd == 0 ? -qd : -(qd + 1);
        i16 a13 = along * 13, wob = md[(u8)(a13 >= 0 ? a13 >> 2 : -((-a13) >> 2))];
        if (d < wob) {
          addT(x, y, mwA[wob - 8][wob - d]);
          if ((i32)(rnext() >> 16) < mwC[wob - 8][wob - d]) { u8 s = chance(77) ? 0 : 1; setStar(x, y, s); }
        }
        ra += ca; if (ra >= 127) { ra -= 127; qa++; } else if (ra < 0) { ra += 127; qa--; }
        rd += sa; if (rd >= 127) { rd -= 127; qd++; } else if (rd < 0) { rd += 127; qd--; }
      }
    }
  }
  if (t->time == T_AURORA) {
    i16 p0 = KEEP(2, rnd(0, 255)), p1 = KEEP(3, rnd(0, 255)), p2 = KEEP(4, rnd(0, 255)), p3 = KEEP(5, rnd(0, 255));
    for (x = GX0; x < GX1; x++) {
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
    if (WIDE) n = (i16)((i32)n * (GX1 - GX0) / GEN_W);
    for (i = 0; i < n; i++) {
      i16 sx = rnd(GX0, GX1 - 1), sy = rnd(0, skyBottom - 8);
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
        i16 d2 = x * x + y * y;   // R <= 26
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
      i16 d2 = x * x + y * y;   // lrad + 2 <= 23
      if (d2 > lo && d2 < hi && inb(lx + x, ly + y) && !isHard(lx + x, ly + y)) setT(lx + x, ly + y, imax(px_get(lx + x, ly + y), 77));
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
    i16 base = t->sky == S_OVERCAST && !night ? 104 : CB[t->time], nc;   // grey clouds under a grey sky
    if (t->weather == W_CLEAR) nc = rnd(0, 1);
    else if (t->weather == W_CLOUDS) nc = rnd(3, 6);
    else if (t->weather == W_FOG) nc = rnd(0, 2);
    else if (t->weather == W_SNOWFALL) nc = 2;
    else nc = 3;
#ifdef __SDCC
    for (i = 0; i < nc; i++) {
      i16 cx = rnd(GX0, GX1), cy = rnd(6, skyBottom * 55 / 100), w = rnd(16, 46), b, nb = w / 5;
      u8 litBelow = ly > cy && !night;
#else
    {
    i16 total = nc, side = 0;
#ifndef __SDCC
    if (WIDE) total = nc + (side = nc * (GX1 - GX0 - GEN_W) / GEN_W);   // banner: the piece's clouds first, then side clouds
#endif
    for (i = 0; i < total; i++) {
      i16 cx, cy, w, b, nb; u8 litBelow;
#ifndef __SDCC
      if (WIDE && i == nc) SIDE_BEGIN(0xC10D5UL);
      if (WIDE && i >= nc) {   // side clouds stay clear of the piece so nothing is cut at the seams
        cx = (i - nc) % 2 ? rnd(GX0, -40) : rnd(GEN_W + 40, GX1);
      } else
#endif
      cx = rnd(0, GEN_W);
      cy = rnd(6, skyBottom * 55 / 100); w = rnd(16, 46); nb = w / 5;
      litBelow = ly > cy && !night;
#endif
      for (b = 0; b < nb; b++) {
        i16 bx = cx + rnd(-w / 2, w / 2), by = cy + rnd(-2, 1), br = rnd(3, 7);
        u8 inlight = (i32)(bx - lx) * (bx - lx) + (i32)(by - ly) * (by - ly) < (i32)(lrad + 4) * (lrad + 4);
        i16 xr = br * 8 / 5;
        for (y = -br; y <= br; y++) for (x = -xr; x <= xr; x++) {
          i16 X = bx + x, Y = by + y, fy, v;
          if (25 * x * x + 64 * y * y > 64 * br * br || by + y > cy + 3 || !inb(X, Y)) continue;   // br <= 7: 16 bits
          v = px_get(X, Y);
          if (v >= HARD && v < STAR && inlight) continue;   // clouds may cross the sun or moon, not bury it
          fy = y + br >= 2 * br ? 256 : frac256((u16)(y + br), (u16)(2 * br));
          setT(X, Y, base + (litBelow ? mul256s(128 - fy, 58) : mul256s(fy - 77, 58)));
        }
      }
    }
#ifndef __SDCC
    if (WIDE && side > 0) SIDE_END();
    }
#endif
    if (t->weather == W_RAIN || t->weather == W_STORM || t->weather == W_SNOWFALL) {
      i16 deck = skyBottom * (t->weather == W_STORM ? 34 : 26) / 100, ph = KEEP(6, rnd(0, 255));
      i16 dt = night ? 173 : t->weather == W_STORM ? 166 : 146;
      for (x = GX0; x < GX1; x++) {
        i16 yb = deck + 4 * SINA(x * 9 / 2 + ph) / 127 + 2 * SINA(x * 12 + ph * 2) / 127;
        for (y = 0; y < yb && y < h; y++) setT(x, y, dt + y * 32 / yb);
      }
    }
  }
  gen_phase(P_CLOUDS);
}
