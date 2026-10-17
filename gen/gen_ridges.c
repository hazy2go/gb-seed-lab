// gb-seed-lab generator: terrain profiles and ridges. Switchable ROM bank on the Game Boy.
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

// midpoint displacement -> prof[] 0..256
static void mdisp(u8 rough) {
  i16 step = 256, d = 4096, lo = 32767, hi = -32767, off, x, i, half;
  md[0] = rnd(-4096, 4096);
  md[256] = rnd(-4096, 4096);
  while (step > 1) {
    half = step / 2;
    for (i = half; i < 256; i += step) {
      i16 r = rnd(-d, d);
      md[i] = (i16)(((i32)md[i - half] + md[i + half]) / 2 + r);
    }
    step = half;
    d = (i16)((i32)d * rough / 256);
  }
  off = rnd(0, 256 - GEN_W);
  for (x = 0; x < GEN_W; x++) { i16 v = md[x + off]; if (v < lo) lo = v; if (v > hi) hi = v; }
  for (x = 0; x < GEN_W; x++) prof[x] = hi > lo ? (i16)((i32)(md[x + off] - lo) * 256 / (hi - lo)) : 0;
}
static void smooth(i16 *a, i16 k) {
  i16 i, j;
  for (i = 0; i < GEN_W; i++) {
    i32 s = 0; i16 c = 0;
    for (j = i - k; j <= i + k; j++) if (j >= 0 && j < GEN_W) { s += a[j]; c++; }
    tmp[i] = (i16)(s / c);
  }
  for (i = 0; i < GEN_W; i++) a[i] = tmp[i];
}
static void winmax(i16 *a, i16 k, u8 mx) {
  i16 i, j;
  for (i = 0; i < GEN_W; i++) {
    i16 m = a[i];
    for (j = i - k; j <= i + k; j++) if (j >= 0 && j < GEN_W) { if (mx ? a[j] > m : a[j] < m) m = a[j]; }
    tmp[i] = m;
  }
  for (i = 0; i < GEN_W; i++) a[i] = tmp[i];
}

void ridge_setup(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 8. ridges, far to near
  L = tall ? t->layers + 1 : t->layers;
  bottom = wet ? horizon - 3 : (i16)((i32)h * 78 / 100);
  far = clampi(skyAt(skyBottom) + (night ? 26 : 48), 0, 166);
  if (t->sky == S_OVERCAST) rimA = 10;
  else switch (t->time) {
    case T_DAY: rimA = 51; break;
    case T_DAWN: case T_DUSK: rimA = 70; break;
    case T_GOLDEN: rimA = 83; break;
    case T_ECLIPSE: rimA = 16; break;
    default: {
      static const u8 RM[7] = { 45, 38, 29, 19, 0, 32, 26 };   // full gibbous half crescent new twin ringed
      rimA = RM[t->sky - S_FULL];
    }
  }
  for (x = 0; x < GEN_W; x++) grnd[x] = h;
}

void draw_layer(i16 l) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
    i16 f = L == 1 ? 256 : l * 256 / (L - 1), q, base, amp, tl, mist, minH = 32767, maxH = -32767, snowY, mist0, flr;
    u8 near = l == L - 1, terr = t->terrain, snowy;
    q = (l + 1) * 256 / L; q = q - (i16)((i32)q * (256 - q) / 1900);
    base = top + (i16)((i32)(bottom - top) * q / 256);
    amp = (tall ? 120 : 64) * (256 - f * 55 / 100) / 256;
    if (terr == R_FJORD) terr = R_PEAKS;
    if (terr == R_ISLANDS && l == 0) terr = R_PEAKS;
    if (terr == R_VOLCANO && l != imax(0, L - 3)) terr = R_PEAKS;
    // heights in 1/8 px
    if (terr == R_PEAKS) {
      mdisp(154); smooth(prof, 1);
      for (x = 0; x < GEN_W; x++) {
        i16 v = prof[x], p = (i16)(((i32)v * 102 + (i32)v * v * 154 / 256) / 256);
        hgt[x] = base * 8 - (i16)((i32)amp * 8 * p / 256 * (t->terrain == R_FJORD ? 5 : 4) / 4);
      }
    } else if (terr == R_HILLS) {
      mdisp(128); smooth(prof, 7);
      for (x = 0; x < GEN_W; x++) hgt[x] = base * 8 - (i16)((i32)amp * 8 * 55 / 100 * prof[x] / 256);
    } else if (terr == R_MESAS) {
      i16 lv;
      mdisp(141); smooth(prof, 2);
      lv = 102 + rnd(0, 51);
      for (x = 0; x < GEN_W; x++) hs[x] = smooth256(lv - 20, lv + 5, prof[x]);
      winmax(hs, 4, 1); winmax(hs, 4, 0);
      for (x = 0; x < GEN_W; x++) hgt[x] = base * 8 - (i16)((i32)amp * 8 * 75 / 100 * ((i32)hs[x] * 218 + (i32)prof[x] * 38) / 65536);
    } else if (terr == R_DUNES) {
      i16 lam = rnd(28, 60), off = rnd(0, lam - 1);
      mdisp(128);
      for (x = 0; x < GEN_W; x++) {
        i16 s = (x + off) % lam * 256 / lam, wv = s < 184 ? (i16)((i32)s * 256 / 184) : (256 - s) * 256 / 72;
        hgt[x] = base * 8 - (i16)((i32)amp * 8 * 38 / 100 * ((i32)wv * 179 + (i32)prof[x] * 77) / 65536);
      }
      smooth(hgt, 1);
    } else if (terr == R_VOLCANO) {
      i16 cx = rnd(45, 115), w = rnd(38, 60), mn = 32767;
      mdisp(154);
      for (x = 0; x < GEN_W; x++) {
        i16 c = imax(0, 256 - iabs(x - cx) * 256 / w), c125 = (i16)((i32)c * (192 + c / 4) / 256);
        hgt[x] = base * 8 - (i16)((i32)amp * 8 * ((i32)320 * c125 + (i32)31 * prof[x]) / 65536);
        if (iabs(x - cx) < 4) hgt[x] += 24 - iabs(x - cx) * 4;
        if (hgt[x] < mn) mn = hgt[x];
      }
      volx = cx; voly = mn / 8;
    } else {   // islands sitting on the horizon
      i16 n = f < 128 ? rnd(1, 2) : rnd(1, 3), j;
      for (x = 0; x < GEN_W; x++) hgt[x] = SENT;
      for (j = 0; j < n; j++) {
        i16 cx = rnd(0, GEN_W - 1), w0 = rnd(14, 46), w = (i16)((i32)w0 * (154 + f) / 256), a0 = rnd(0, 128), a;
        if (w < 4) w = 4;
        a = (i16)((i32)amp * (90 + a0) / 256 * (128 + (i16)((i32)f * 154 / 256)) / 256);
        mdisp(128); smooth(prof, 2);
        for (x = 0; x < GEN_W; x++) {
          i16 d = (i16)((i32)iabs(x - cx) * 256 / w);
          if (d < 256) {
            i16 qq = 256 - (i16)((i32)d * d / 256), q15 = (i16)(((i32)qq * qq / 256 + qq) / 2);
            i16 hy = (horizon - 1) * 8 - (i16)((i32)a * 8 * q15 / 256 * (192 + prof[x] / 4) / 256);
            if (hy < hgt[x]) hgt[x] = hy;
          }
        }
      }
    }
    // keep below the top edge and below the sun or moon (a high one fully, a low sun at least half)
    {
      i16 clr = lowsun ? ly : ly + lrad + 4, edge = tall ? 14 : 8, kk = 256;
      for (x = 0; x < GEN_W; x++) {
        i16 need = iabs(x - lx) < lrad + 8 ? imax(edge, clr) : edge;
        if (hgt[x] == SENT) continue;
        if (hgt[x] < need * 8 && base > need) kk = imin(kk, (i16)((i32)(base - need) * 256 * 8 / (base * 8 - hgt[x])));
      }
      if (kk < 256) for (x = 0; x < GEN_W; x++) if (hgt[x] != SENT) hgt[x] = base * 8 - (i16)((i32)(base * 8 - hgt[x]) * kk / 256);
    }
    for (x = 0; x < GEN_W; x++) hs[x] = hgt[x] == SENT ? horizon * 8 : hgt[x];
    smooth(hs, 3);
    tl = near ? 192 : far + (i16)((i32)(192 - far) * (f + (i16)((i32)f * (256 - f) / 1100)) / 256);
    mist = near ? 0 : (256 - f) * 54 / 256 + 10 + (t->weather == W_FOG ? 32 : 0);
    for (x = 0; x < GEN_W; x++) if (hgt[x] != SENT) { if (hgt[x] < minH) minH = hgt[x]; if (hgt[x] > maxH) maxH = hgt[x]; }
    minH /= 8; maxH /= 8;
    snowY = minH + (maxH - minH) * 38 / 100;
    mist0 = minH + (base - minH) / 4;
    snowy = t->snowcaps && !near && (terr == R_PEAKS || terr == R_VOLCANO);
    flr = wet ? horizon : h;
    for (x = 0; x < GEN_W; x++) {
      i16 y0, d8, rimD, jit, sgn = lx > x ? 1 : lx < x ? -1 : 0;
      u8 lit;
      if (hgt[x] == SENT) continue;
      y0 = imax(0, hgt[x] / 8);
      d8 = hs[imin(GEN_W - 1, x + 2)] - hs[imax(0, x - 2)];
      lit = sgn * d8 >= 2;
      rimD = 3 + imin(6, iabs(d8) / 8);
      jit = 3 * SINA(x * 19 / 2 + l * 41) / 127 + 4 * SINA(x * 29 / 10 + l * 81) / 127 + ((x * 13 + l) % 5 == 0 ? -2 : 0);
      for (y = y0; y < flr; y++) {
        i16 dy = y - y0, v = tl - (i16)((i32)mist * smooth256(mist0, base + 4, y) / 256);
        if (lit && dy < rimD) v -= (i16)((i32)rimA * (rimD - dy) / rimD * (near ? 154 : 256) / 256);
        if (snowy && y < snowY + jit) v = imax(0, tl - 160) + (lit ? 0 : 35) + (i16)((i32)clampi((y - (snowY + jit - 4)) * 64, 0, 256) * 38 / 256);
        setT(x, y, v);
      }
      if (near) grnd[x] = y0;
    }
    // trees on the two nearest layers
    if (l >= L - 2) {
      u8 trees = t->ground == G_FOREST;
      if (!trees && t->ground == G_SNOWFIELD) trees = chance(128);
      if (trees) {
        i16 sparse = t->ground == G_SNOWFIELD ? 3 : 1;
        for (x = rnd(0, 3); x < GEN_W; ) {
          if (hgt[x] != SENT) {
            i16 th = near ? rnd(5, 13) : rnd(3, 7), y0 = hgt[x] / 8 + 1, dy, dx;
            for (dy = 0; dy <= th; dy++) {
              i16 hw = dy * 42 / 100 + (dy % 3 == 2 ? 1 : 0);
              for (dx = -hw; dx <= hw; dx++) {
                i16 X = x + dx, Y = y0 - th + dy;
                if (inb(X, Y)) { if (near) setH(X, Y, 3); else setT(X, Y, tl); }
              }
            }
            if (near) for (dx = x - 3; dx <= x + 3; dx++) if (dx >= 0 && dx < GEN_W && y0 < grnd[dx]) grnd[dx] = y0;
          }
          { i16 st = rnd(2, 5); x += st * sparse; }
        }
      }
    }
    gen_phase(P_RIDGE);
}
