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
    for (x = GX0; x < GX1; x++) {
      i16 g = grnd[IX(x)];
      if (g >= flr) continue;
      for (y = g; y < flr; y++) {
        u16 d = frac256((u16)(y - g), (u16)imax(8, flr - g));   // (y - g) * 256 / den, y - g < den
        if (px_get(x, y) == HARD + 3) continue;
        if (t->ground == G_MEADOW) setT(x, y, 128 + (i16)((d * 51) >> 8));
        else if (t->ground == G_DESERT || t->ground == G_OASIS) setT(x, y, 64 + (i16)((d * 58) >> 8) + (SINA(x * 10 + y * 45 + SINA(x * 2)) > 117 ? 51 : 0));
        else if (t->ground == G_SNOWFIELD) setT(x, y, 19 + (i16)((d * 58) >> 8));
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
  // (the volcano plume and lava are drawn with their own layer, in gen_ridges.c)
  if (t->extras & X_LIGHTHOUSE) {
    i16 x0 = chance(128) ? rnd(12, 40) : rnd(120, 148), yb = horizon - 1, ht = rnd(18, 26), lyy, dx, bg = 0, ls = lx > x0 ? 1 : -1, dk;
    u8 lit = night || t->time == T_DUSK, dark;
    // stripes and outline chosen against what stands behind the tower: dark shore or light sky
    for (y = 0; y < ht; y++) bg += (getT(x0 - 4, yb - 3 - y) + getT(x0 + 4, yb - 3 - y)) / 2;
    dark = bg / ht >= 120;
    dk = dark ? 2 : 3;
    for (x = x0 - 8; x <= x0 + 8; x++) for (y = yb - 3 + iabs(x - x0) / 3; y <= yb; y++) setH(x, y, lit || dark ? 2 : 3);   // rock
    for (y = 0; y < ht; y++) {
      i16 hw = 2 + (ht - y) * 3 / (2 * ht), Y = yb - 3 - y;
      u8 band = (y / 3) % 2 ? 0 : (u8)dk;
      for (dx = -hw; dx <= hw; dx++) setH(x0 + dx, Y, band);
      if (dark) setH(x0 + ls * hw, Y, band ? 1 : 0);   // lit edge, so the tower stands off a dark shore
      else { setH(x0 - hw - 1, Y, 3); setH(x0 + hw + 1, Y, 3); }   // dark outline holds the white bands on a light sky
    }
    lyy = yb - 3 - ht - 2;
    for (dx = -2; dx <= 2; dx++) { setH(x0 + dx, lyy, lit ? 0 : 2); setH(x0 + dx, lyy + 1, lit ? 0 : 2); setH(x0 + dx, lyy - 1, dark ? 1 : 3); }
    setH(x0, lyy - 2, dark ? 1 : 3);
    if (lit) {
      i16 dir = x0 < 80 ? 1 : -1, j;
      for (k = 3; k < 70; k++) for (j = -k * 18 / 100; j <= k * 18 / 100; j++) addT(x0 + dir * k, lyy + j, -70 * (70 - k) / 70);
    }
  }
  if (t->extras & X_SAILBOAT) {
    i16 x0 = rnd(30, 130), yb = horizon - 1, s = rnd(0, 1), dx;
    for (dx = -6 - s; dx <= 6 + s; dx++) { setH(x0 + dx, yb, night ? 2 : 3); if (iabs(dx) < 5 + s) setH(x0 + dx, yb - 1, night ? 2 : 3); }
    for (y = 2; y < 14 + s * 2; y++) setH(x0, yb - y, 3);
    for (y = 3; y < 13 + s * 2; y++) for (dx = 1; dx <= (y - 2) * 55 / 100; dx++) setH(x0 + dx, yb - 15 - s * 2 + y, night ? 1 : 0);
    for (y = 5; y < 12; y++) for (dx = 1; dx <= (y - 4) * 4 / 10; dx++) setH(x0 - dx, yb - 13 + y, night ? 2 : 1);
  }
  if (t->extras & X_CABIN) {
    i16 best = cabx, gy, dx, ls = lx > best ? 1 : -1, sk;
    u8 lit = night || t->time == T_DUSK || t->time == T_ECLIPSE;
    gy = imax(grnd[IX(best - 5)], grnd[IX(best + 5)]);
    for (y = 0; y < 6; y++) for (dx = -5; dx <= 5; dx++) setH(best + dx, gy - y, 3);
    for (y = 0; y < 6; y++) for (dx = -7 + y; dx <= 7 - y; dx++) setH(best + dx, gy - 6 - y, 3);
    for (y = 9; y < 14; y++) setH(best + 4, gy - y, 3);
    // a 1 px light edge on the side facing the light: the roof line and the wall, so the cabin reads on dark ground
    for (y = 0; y < 6; y++) { setH(best + ls * (7 - y), gy - 6 - y, 1); setH(best - ls * (7 - y), gy - 6 - y, night ? 1 : 2); }   // roof outline (both slopes light at night, when the woods behind are dark too)
    for (y = 1; y < 6; y++) { setH(best + ls * 5, gy - y, 1); setH(best - ls * 5, gy - y, 2); }   // walls, the lit one light
    setH(best + 4 + ls, gy - 13, 2); setH(best + 4 + ls, gy - 12, 2);   // chimney edge
    setH(best - 2, gy - 3, lit ? 0 : 2); setH(best - 1, gy - 3, lit ? 0 : 2); setH(best - 2, gy - 2, lit ? 0 : 2); setH(best - 1, gy - 2, lit ? 0 : 2);
    sk = skyAt(gy - 20);
    for (k = 0; k < 6; k++) smoke(best + 4 + side * (k * 2 + k * k / 4), gy - 16 - k * 3, 1 + k / 2, night ? sk - 36 : imax(0, sk - 48), 236 - k * 26);
  }
  if (t->ground == G_OASIS) {
    // a few palms on a low sand bank (so their reflection stays apart from them), with gently arched fronds
    static const i16 FA[6] = { 134, 112, 84, 40, 14, -8 };   // frond angles in 1/256 turn (64 = up), mirrored per palm
    static const u8 FL[6] = { 7, 9, 8, 9, 10, 7 };
    i16 n = rnd(2, 4), left = chance(128), st = rnd(14, 18), x0, xa, xb, yb = horizon - 4, j, a;
    xa = left ? 6 : 154 - (n - 1) * st - 10; xb = xa + (n - 1) * st + 20;
    for (x = xa; x <= xb; x++) {   // the bank: up to 3 px above the waterline
      i16 u = (i16)((i32)(x - xa) * 256 / (xb - xa)) - 128, hb = 3 - (i16)((i32)u * u * 3 / 16384);
      for (y = horizon - 1 - hb; y < horizon; y++) setT(x, y, y == horizon - 1 - hb ? 40 : 84);   // sand, lit on top
    }
    for (k = 0; k < n; k++) {
      i16 ht = rnd(12, 20), lean = rnd(-26, 26), fl = rnd(0, 1) ? 1 : -1, ln = rnd(0, 2), tx = 0, ty = 0;
      x0 = xa + 10 + k * st;
      for (y = 0; y < ht; y++) {   // trunk: 2 px wide in its lower half, a slight bow
        tx = x0 + (lean * y / 16) * y / (4 * ht) + 2 * SINA(y * 102 / ht) / 127; ty = yb - y;   // curving more toward the top
        setH(tx, ty, 3); if (y < ht / 2) setH(tx + 1, ty, 3);
      }
      for (a = 0; a < 6; a++) {
        i16 len = FL[a] + ln, ca = COSA(FA[a]) * fl, sa = SINA(FA[a]), px = tx, py = ty;
        for (j = 1; j <= len; j++) {
          i16 fx = tx + (i16)((i32)ca * j / 127), fy = ty - (i16)((i32)sa * j / 127) + j * j * 4 / 100;
          setH(fx, fy, 3);
          if (j <= len / 2) { if (iabs(ca) >= iabs(sa)) setH(fx, fy + 1, 3); else setH(fx + 1, fy, 3); }   // 2 px thick near the crown
          if (iabs(fx - px) > 1 || iabs(fy - py) > 1) setH((fx + px) / 2, (fy + py) / 2, 3);   // keep the frond connected
          px = fx; py = fy;
        }
      }
      setH(tx, ty + 1, 3); setH(tx + 1, ty + 1, 3);   // coconuts under the crown
    }
  }
  if (gen_special) sp_features();
  // comet and shooting star: drawn after the ridges and clouds, in open sky above every ridge, clear of the sun or moon
  if (t->extras & X_COMET) {
    i16 cx = 80, cy = 20, len = rnd(30, 55), ang = rnd(0, 127), ca = COSA(ang), sa = SINA(ang), j, tr;
    for (tr = 0; tr < 10; tr++) {
      i16 m = 255, dx, dy;
      cx = rnd(20, 140); cy = rnd(8, skyBottom * 40 / 100);
      for (j = cx - 12; j <= cx + 12; j++) m = imin(m, skyl[IX(j)]);
      dx = cx - lx; dy = cy - ly;
      if (cy + 6 < m && (i32)dx * dx + (i32)dy * dy > (i32)(lrad + 12) * (lrad + 12) && iabs(getT(cx, cy) - skyAt(cy)) < 40) break;
    }
    for (k = 0; k < len; k++) {
      i16 w = 1 + k * 7 / len;
      for (j = -w; j <= w; j++) {
        i16 X = cx + (i16)(((i32)ca * k - (i32)sa * j) / 127), Y = cy + (i16)(((i32)ca * j - (i32)sa * k) * 3 / 5 / 127);
        if (inb(X, Y) && Y < skyl[IX(X)] - 1) addT(X, Y, -(i16)((i32)90 * (len - k) / len * (w + 1 - iabs(j)) / (w + 1)));
      }
    }
    g_shade = 0; disc(cx, cy, 1, fn_hard);
  }
  if (t->extras & X_SHOOTING) {
    i16 sx = 80, sy = 10, dx = chance(128) ? 1 : -1, len = rnd(14, 26), tr, ok = 0;
    for (tr = 0; tr < 12 && !ok; tr++) {
      sx = rnd(20, 140); sy = rnd(5, skyBottom * 35 / 100); ok = 1;
      for (k = 0; k < len && ok; k++) {
        i16 X = sx + dx * (k + 1), Y = sy + (k + 1) / 2, ex = X - lx, ey = Y - ly;
        if (!inb(X, Y) || Y >= skyl[IX(X)] - 2 || (px_get(X, Y) >= HARD && px_get(X, Y) < STAR) || (i32)ex * ex + (i32)ey * ey < (i32)(lrad + 4) * (lrad + 4)) ok = 0;
      }
    }
    for (k = 0; k < len; k++) {
      sx += dx; sy += k % 2;
      if (!inb(sx, sy) || sy >= skyl[IX(sx)] - 1) continue;
      if (k < len * 85 / 100 || k % 2) setStar(sx, sy, k < len * 45 / 100 ? 0 : 1);
    }
  }
  gen_phase(P_GROUND);
}

void draw_water(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 11. water: mirror with ripples, glitter path
  if (wet) {
    i16 ph = KEEP(7, rnd(0, 255));
    for (y = horizon; y < h; y++) {
      i16 d = y - horizon, sy = horizon - 1 - d;
      i16 wob = (i16)((i32)SINA(d * 35 + ph) * (26 + d * 9 / 2) / (127 * 64));
      i16 band = (d + ph) % 5 == 0 ? 22 : 0;
      for (x = GX0; x < GX1; x++) {
        i16 sx = clampi(x + wob, GX0, GX1 - 1);
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
    for (x = GX0; x < GX1; x++) if (!isHard(x, horizon)) setT(x, horizon, imax(px_get(x, horizon), 166));
    gen_phase(P_WATER);
  }
}

void draw_weather(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 12. weather
  if (t->weather == W_FOG) {
    i16 yf = wet ? horizon - 4 : bottom - 8, fh = 16, fogT = night ? 122 : 32, ph = KEEP(8, rnd(0, 255));
    i32 fh2 = (i32)fh * fh;
    for (x = 0; x < 256; x++) md[x] = 179 + 77 * SINA(x) / 127;   // ripple of the fog density, as a table
    for (y = 0; y < h; y++) {
      i16 g = expneg((i32)(y - yf) * (y - yf) * 256 / fh2);
      if (g == 0) continue;
      for (x = GX0; x < GX1; x++) {
        i16 w = md[(u8)(x * 2 + y * 5 + ph)], a = (i16)((u16)((u16)205 * (u16)g / 256) * (u16)w / 256), v;
        u8 p = px_get(x, y);
        if (p >= HARD) { if (a > 115 && (p & 3) != 3) v = (p & 3) * 64; else continue; }
        else v = p;
        setT(x, y, v + mul256s(fogT - v, (u16)a));   // |fogT - v| * a <= 199 * 204
      }
    }
  }
  if (t->weather == W_RAIN || t->weather == W_STORM) {
    i16 n = t->weather == W_STORM ? 230 : 160, j;
    if (WIDE) n = (i16)((i32)n * (GX1 - GX0) / GEN_W);
    for (k = 0; k < n; k++) {
      i16 rx = rnd(GX0 - 20, GX1 - 1), ry = rnd(0, h - 1), len = rnd(3, 7);
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
    for (k = 0; k < (WIDE ? (i16)((i32)220 * (GX1 - GX0) / GEN_W) : 220); k++) {
      i16 sx = rnd(GX0, GX1 - 1), sy = rnd(0, h - 1);
      setH(sx, sy, 0);
      if (chance(31)) { setH(sx + 1, sy, 0); setH(sx, sy + 1, 0); setH(sx + 1, sy + 1, 0); }
    }
  }
  if (t->extras & X_BIRDS) {
    static const i8 BP[5][2] = { { -2, -1 }, { -1, 0 }, { 0, 1 }, { 1, 0 }, { 2, -1 } };
    i16 fx = rnd(20, 130), fy = rnd(10, skyBottom * 45 / 100), n = rnd(3, 7), j, m = 255;
    // the flock flies in open sky above the ridges and away from the sun or moon
    for (j = fx - 24; j <= fx + 24; j++) if (j >= GX0 && j < GX1) m = imin(m, skyl[IX(j)]);
    fy = imax(14, imin(fy, m - 10));
    if (iabs(fx - lx) < lrad + 26 && iabs(fy - ly) < lrad + 14) {
      i16 d = fx < lx ? -1 : 1;
      fx = lx + d * (lrad + 26);
      if (fx < 16 || fx > 144) fx = lx - d * (lrad + 26);
      fx = clampi(fx, 16, 144);
    }
    for (k = 0; k < n; k++) {
      i16 bx = fx + rnd(-22, 22), by = imax(6, fy + rnd(-8, 8)), s = chance(77) ? 1 : 0, ex = bx - lx, ey = by - ly;
      u8 sh;
      if ((i32)ex * ex + (i32)ey * ey < (i32)(lrad + 5) * (lrad + 5) || !inb(bx, by - 1)) continue;   // never on the disc
      sh = getT(bx, by - 1) < 150 ? 3 : 1;   // a dark bird on a light sky, a light one on a dark sky
      for (j = 0; j < 5; j++) {
        i16 dx = BP[j][0], dy = BP[j][1];
        if (j == 0) { dx -= s; dy -= s; }
        if (j == 4) { dx += s; dy -= s; }
        setH(bx + dx, by + dy - 1, sh);
      }
    }
  }
  gen_phase(P_WEATHER);
}

void draw_finish(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 13. dither everything to shades
  for (y = 0; y < h; y++) {
    u8 *r = px_row(y);
    const u8 *by = gen_bayer + (y & 7) * 8;
#ifdef __SDCC
    // Game Boy: the same loop in assembly (gb/conv.s); tests compare it with this C version pixel for pixel
    extern u8 *conv_src; extern u8 conv_bay[8]; void dith_row(void);
    for (x = 0; x < 8; x++) conv_bay[x] = by[x];
    conv_src = r; dith_row();
    continue;
#endif
    for (x = GX0; x < GX1; x++) {
      u8 v = r[IX(x)];
      if (v >= HARD) r[IX(x)] = HARD + (v & 3);
      else { u8 s = (u8)((v + by[x & 7]) >> 6); r[IX(x)] = HARD + (s > 3 ? 3 : s); }
    }
  }
  if ((t->extras & X_GLITCH) && !WIDE) {
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
