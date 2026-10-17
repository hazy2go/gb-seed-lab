// gb-seed-lab generator: ground, buildings, water, weather, final dither. Switchable ROM bank on the Game Boy.
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

void draw_surface(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 9. near ground surface
  {
    i16 flr = wet ? horizon : h;
    for (x = 0; x < GEN_W; x++) {
      i16 g = grnd[x];
      if (g >= flr) continue;
      for (y = g; y < flr; y++) {
        i16 d = (i16)((i32)(y - g) * 256 / imax(8, flr - g));
        if (px_get(x, y) == HARD + 3) continue;
        if (t->ground == G_MEADOW) setT(x, y, 128 + d * 51 / 256);
        else if (t->ground == G_DESERT || t->ground == G_OASIS) setT(x, y, 64 + d * 58 / 256 + (SINA(x * 10 + y * 45 + SINA(x * 2)) > 117 ? 51 : 0));
        else if (t->ground == G_SNOWFIELD) setT(x, y, 19 + d * 58 / 256);
      }
      if (t->ground == G_MEADOW) for (k = 0; k < 2; k++) {
        i16 ty = rnd(g + 2, flr - 1);
        if (chance(128)) { setH(x, ty, 3); setH(x, ty - 1, 3); }
        else if (chance(20)) setH(x, ty, 0);
      }
    }
  }
}

void draw_features(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 10. things on the ground or the water line (before the mirror, so they reflect)
  if (volx >= 0) {
    u8 glow = night || t->time == T_DUSK;
    i16 px = volx, py = voly - 2;
    for (k = 0; k < 9; k++) {
      g_puff = (glow ? 141 : 90) + k * 4;
      disc(px, py, 3 + k * 13 / 10, fn_puff);
      px += rnd(2, 4); py -= rnd(4, 5);
    }
    if (glow) {
      for (y = voly - 2; y < voly + 3; y++) for (x = volx - 3; x <= volx + 3; x++) setH(x, y, 0);
      for (y = voly - 14; y < voly + 10; y++) for (x = volx - 16; x < volx + 16; x++) {
        i32 d2 = (i32)(x - volx) * (x - volx) + (i32)(y - voly) * (y - voly);
        if (d2 < 256) addT(x, y, -(i16)(58 * (256 - d2) / 256));
      }
    }
  }
  if (t->extras & X_LIGHTHOUSE) {
    i16 x0 = chance(128) ? rnd(12, 40) : rnd(120, 148), yb = horizon - 1, ht = rnd(18, 26), lyy, dx;
    u8 lit = night || t->time == T_DUSK;
    for (x = x0 - 8; x <= x0 + 8; x++) for (y = yb - 3 + iabs(x - x0) / 3; y <= yb; y++) setH(x, y, 3);
    for (y = 0; y < ht; y++) { i16 hw = 2 + (ht - y) * 3 / (2 * ht); for (dx = -hw; dx <= hw; dx++) setH(x0 + dx, yb - 3 - y, (y / 3) % 2 ? 0 : 3); }
    lyy = yb - 3 - ht - 2;
    for (dx = -2; dx <= 2; dx++) { setH(x0 + dx, lyy, lit ? 0 : 2); setH(x0 + dx, lyy + 1, lit ? 0 : 2); setH(x0 + dx, lyy - 1, 3); }
    setH(x0, lyy - 2, 3);
    if (lit) {
      i16 dir = x0 < 80 ? 1 : -1, j;
      for (k = 3; k < 70; k++) for (j = -k * 18 / 100; j <= k * 18 / 100; j++) addT(x0 + dir * k, lyy + j, -70 * (70 - k) / 70);
    }
  }
  if (t->extras & X_SAILBOAT) {
    i16 x0 = rnd(30, 130), yb = horizon - 1, s = rnd(0, 1), dx;
    for (dx = -6 - s; dx <= 6 + s; dx++) { setH(x0 + dx, yb, 3); if (iabs(dx) < 5 + s) setH(x0 + dx, yb - 1, 3); }
    for (y = 2; y < 14 + s * 2; y++) setH(x0, yb - y, 3);
    for (y = 3; y < 13 + s * 2; y++) for (dx = 1; dx <= (y - 2) * 55 / 100; dx++) setH(x0 + dx, yb - 15 - s * 2 + y, night ? 2 : 0);
    for (y = 5; y < 12; y++) for (dx = 1; dx <= (y - 4) * 4 / 10; dx++) setH(x0 - dx, yb - 13 + y, night ? 2 : 1);
  }
  if (t->extras & X_CABIN) {
    i16 best = 20, bs = 32767, gy, dx, sx, sy;
    u8 lit = night || t->time == T_DUSK || t->time == T_ECLIPSE;
    for (x = 20; x < 140; x++) { i16 s = iabs(grnd[x + 5] - grnd[x - 5]); if (s < bs && grnd[x] < h - 12) { bs = s; best = x; } }
    gy = imax(grnd[best - 5], grnd[best + 5]);
    for (y = 0; y < 6; y++) for (dx = -5; dx <= 5; dx++) setH(best + dx, gy - y, 3);
    for (y = 0; y < 6; y++) for (dx = -7 + y; dx <= 7 - y; dx++) setH(best + dx, gy - 6 - y, 3);
    for (y = 9; y < 14; y++) setH(best + 4, gy - y, 3);
    setH(best - 2, gy - 3, lit ? 0 : 2); setH(best - 1, gy - 3, lit ? 0 : 2); setH(best - 2, gy - 2, lit ? 0 : 2); setH(best - 1, gy - 2, lit ? 0 : 2);
    sx = best + 4; sy = gy - 15;
    for (k = 0; k < 6; k++) { g_puff = night ? 128 : 51; disc(sx, sy, 1 + k / 2, fn_puff); sx += 2; sy -= 3; }
  }
  if (t->ground == G_OASIS) {
    static const i8 FA[6] = { -118, -98, -75, -53, -31, -10 };
    i16 n = rnd(2, 4), left = chance(128);
    for (k = 0; k < n; k++) {
      i16 st = rnd(7, 12), x0 = (left ? 14 : 120) + k * st, yb = horizon - 1, ht = rnd(14, 24), lean = rnd(-19, 19), tx = x0, ty = yb, a, j;
      for (y = 0; y < ht; y++) {
        tx = x0 + lean * y / 64 + 2 * SINA(y * 102 / ht) / 127; ty = yb - y;
        setH(tx, ty, 3); setH(tx + 1, ty, 3);
      }
      for (a = 0; a < 6; a++) {
        i16 len = rnd(9, 13), ca = COSA(FA[a]), sa = SINA(FA[a]);
        for (j = 0; j <= len; j++) {
          i16 fx = tx + (i16)(((i32)ca * j + 64) / 127), fy = ty + (i16)((i32)sa * j * 3 / 5 / 127) + j * j * 11 / 100;
          setH(fx, fy, 3);
          if (j > 2 && j < len - 3) setH(fx, fy + 1, 3);
        }
      }
      setH(tx - 1, ty + 1, 3); setH(tx + 2, ty + 1, 3);
    }
  }
  gen_phase(P_GROUND);
}

void draw_water(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 11. water: mirror with ripples, glitter path
  if (wet) {
    i16 ph = rnd(0, 255);
    for (y = horizon; y < h; y++) {
      i16 d = y - horizon, sy = horizon - 1 - d;
      i16 wob = (i16)((i32)SINA(d * 35 + ph) * (26 + d * 9 / 2) / (127 * 64));
      i16 band = (d + ph) % 5 == 0 ? 22 : 0;
      for (x = 0; x < GEN_W; x++) {
        i16 sx = clampi(x + wob, 0, GEN_W - 1);
        u8 v;
        if (sy < 0) { setT(x, y, 192); continue; }
        v = px_get(sx, sy);
        if (v >= STAR) {   // no star reflections: take a neighbour's tone
          u8 n = px_get(sx > 0 ? sx - 1 : sx + 1, sy);
          setT(x, y, (n < HARD ? n : 160) + 22 + band);
        } else if (v >= HARD) {
          u8 s = (u8)(v - HARD) + (d % 3 == 1 ? 1 : 0);
          setH(x, y, s > 3 ? 3 : s);
        } else setT(x, y, v + 22 + band);
      }
      if (rimA > 0 && t->sky != S_ECLIPSE && t->sky != S_OVERCAST) {
        i16 spread = 3 + d * 32 / 100, j;
        for (k = 0; k < 2; k++) {
          i16 gx = lx + rnd(-spread, spread), len = rnd(2, 6);
          if (chance(192)) for (j = gx; j < gx + len; j++) { u8 s = chance(179) ? 0 : 1; setH(j, y, s); }
        }
      }
    }
    for (x = 0; x < GEN_W; x++) if (!isHard(x, horizon)) setT(x, horizon, imax(px_get(x, horizon), 166));
    gen_phase(P_WATER);
  }
}

void draw_weather(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 12. weather
  if (t->weather == W_FOG) {
    i16 yf = wet ? horizon - 4 : bottom - 8, fh = 16, fogT = night ? 122 : 32, ph = rnd(0, 255);
    i32 fh2 = (i32)fh * fh;
    for (y = 0; y < h; y++) {
      i16 g = expneg((i32)(y - yf) * (y - yf) * 256 / fh2);
      if (g == 0) continue;
      for (x = 0; x < GEN_W; x++) {
        i16 w = 179 + 77 * SINA(x * 2 + y * 5 + ph) / 127, a = (i16)((i32)205 * g / 256 * w / 256), v;
        u8 p = px_get(x, y);
        if (p >= HARD) { if (a > 115 && (p & 3) != 3) v = (p & 3) * 64; else continue; }
        else v = p;
        setT(x, y, v + (i16)((i32)(fogT - v) * a / 256));
      }
    }
  }
  if (t->weather == W_RAIN || t->weather == W_STORM) {
    i16 n = t->weather == W_STORM ? 230 : 160, j;
    for (k = 0; k < n; k++) {
      i16 rx = rnd(-20, GEN_W - 1), ry = rnd(0, h - 1), len = rnd(3, 7);
      for (j = 0; j < len; j++, ry++) {
        if (j % 3 == 2) rx++;
        if (inb(rx, ry) && !isHard(rx, ry)) { i16 v = px_get(rx, ry); setT(rx, ry, v > 96 ? v - 70 : v + 70); }
      }
    }
  }
  if (t->weather == W_STORM) {
    i16 bx = rnd(30, 130), by = skyBottom * 30 / 100, end = wet ? horizon : bottom, np = 0, dy, dx;
    while (by < end - 10 && np < 300) {
      pathx[np] = bx; pathy[np] = by; np++;
      by++;
      { i16 a = rnd(-1, 1); bx += a; }
      if (chance(20)) { i16 a = rnd(-3, 3); bx += a; }
      if (chance(10)) {
        i16 cx = bx, cy = by, d = chance(128) ? 1 : -1, cnt = rnd(6, 14), j;
        for (j = 0; j < cnt && np < 320; j++) { i16 a = rnd(0, 1); cx += d * a; cy++; pathx[np] = cx; pathy[np] = cy; np++; }
      }
    }
    for (i = 0; i < np; i++) for (dy = -8; dy <= 8; dy += 2) for (dx = -8; dx <= 8; dx += 2) {
      i16 d2 = dx * dx + dy * dy;
      if (d2 < 64) addT(pathx[i] + dx, pathy[i] + dy, -3 * (64 - d2) / 64);
    }
    for (i = 0; i < np; i++) setH(pathx[i], pathy[i], 0);
  }
  if (t->weather == W_SNOWFALL) {
    for (k = 0; k < 220; k++) {
      i16 sx = rnd(0, GEN_W - 1), sy = rnd(0, h - 1);
      setH(sx, sy, 0);
      if (chance(31)) { setH(sx + 1, sy, 0); setH(sx, sy + 1, 0); setH(sx + 1, sy + 1, 0); }
    }
  }
  if (t->extras & X_BIRDS) {
    static const i8 BP[5][2] = { { -2, -1 }, { -1, 0 }, { 0, 1 }, { 1, 0 }, { 2, -1 } };
    i16 fx = rnd(20, 130), fy = rnd(10, skyBottom * 45 / 100), n = rnd(3, 7), j;
    for (k = 0; k < n; k++) {
      i16 bx = fx + rnd(-22, 22), by = fy + rnd(-10, 10), s = chance(77) ? 1 : 0;
      for (j = 0; j < 5; j++) {
        i16 dx = BP[j][0], dy = BP[j][1];
        if (j == 0) { dx -= s; dy -= s; }
        if (j == 4) { dx += s; dy -= s; }
        setH(bx + dx, by + dy - 1, 3);
      }
    }
  }
  gen_phase(P_WEATHER);
}

void draw_finish(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 13. dither everything to shades
  for (y = 0; y < h; y++) for (x = 0; x < GEN_W; x++) {
    u8 v = px_get(x, y);
    if (v >= HARD) px_set(x, y, HARD + (v & 3));
    else { u8 s = (u8)((v + gen_bayer[(y & 7) * 8 + (x & 7)]) >> 6); px_set(x, y, HARD + (s > 3 ? 3 : s)); }
  }
  if (t->extras & X_GLITCH) {
    i16 n = rnd(3, 6), bx, by, bh, bw;
    for (k = 0; k < n; k++) {
      i16 y0 = rnd(0, h - 12), hh = rnd(2, 9), sh = rnd(6, 50);
      for (y = y0; y < y0 + hh; y++) {
        for (x = 0; x < GEN_W; x++) tmp[x] = px_get(x, y);
        for (x = 0; x < GEN_W; x++) px_set(x, y, (u8)tmp[(x + sh) % GEN_W]);
      }
    }
    bx = rnd(0, 140); by = rnd(0, h - 24); bh = rnd(8, 24); bw = rnd(10, 40);
    for (y = by; y < by + bh; y++) for (x = bx; x < bx + bw && x < GEN_W; x++) px_set(x, y, HARD + 3 - (px_get(x, y) & 3));
  }
  gen_phase(P_DONE);
}
