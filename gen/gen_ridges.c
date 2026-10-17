// gb-seed-lab generator: terrain profiles and ridges. Switchable ROM bank on the Game Boy.
#ifdef __SDCC
#pragma bank 255
#endif
#include "gen_int.h"

static i16 mistrow[GEN_HEIGHT];
static u8 bv[GEN_HEIGHT];   // clamped tl - mistrow[y]: the plain ridge tone per row
static u8 skyrow[GEN_HEIGHT];   // skyAt(y), once per picture
static u8 vol_lit;   // the volcano (drawn before the nearer layers) stands under a light sky

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
  for (x = 0; x < GEN_W; x++) {   // (md - lo) * 256 / (hi - lo); hi - lo < 32768
    i16 n = md[x + off] - lo;
    prof[x] = hi <= lo ? 0 : n >= hi - lo ? 256 : frac256((u16)n, (u16)(hi - lo));
  }
}
static void smooth(i16 *a, i16 k) {   // over array indices 0 .. (GX1 - GX0)
  i16 i, j, nw = GX1 - GX0;
  for (i = 0; i < nw; i++) {
    i32 s = 0; i16 c = 0;
    for (j = i - k; j <= i + k; j++) if (j >= 0 && j < nw) { s += a[j]; c++; }
    tmp[i] = s >= -32768 && s <= 32767 ? (i16)s / c : (i16)(s / c);   // 16-bit divide when it fits (same result)
  }
  for (i = 0; i < nw; i++) a[i] = tmp[i];
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

#ifndef __SDCC
// ---- banner pass (PC only): replay the normal pass's ridges and continue them past both edges
static i16 rec_hgt[8][GEN_W], rec_volx, rec_voly, rec_kk[8][2], rec_top[8];
u32 gen_seed_now;
static void extend_side(i16 l, i16 base, i16 amp, u8 terr, i16 dir) {
  // a midpoint-displacement walk from the edge height, on its own random stream (the picture's stream is untouched)
  static i16 e[257];
  u32 save = rs_get();
  i16 n = dir > 0 ? GX1 - GEN_W : -GX0, edge = dir > 0 ? rec_hgt[l][GEN_W - 1] : rec_hgt[l][0], i, step = 256, d, half;
  u8 rough = terr == R_HILLS ? 128 : terr == R_PEAKS ? 140 : 141;
  // the piece squashed this layer by rec_kk to keep it below the sun/moon: the sides get the same squash
  amp = (i16)imax(1, (i16)((i32)amp * rec_kk[l][dir > 0] / 256));
  rseed(gen_seed_now ^ (u32)(l * 0x9E3779B1UL) ^ (dir > 0 ? 0xA5A5A5A5UL : 0x5A5A5A5AUL));
  if (edge == SENT) {   // islands: open water beyond the edge
    for (i = 0; i < n; i++) hgt[IX(dir > 0 ? GEN_W + i : -1 - i)] = SENT;
    rs_set(save); return;
  }
  e[0] = edge; e[256] = base * 8 - (i16)rnd(amp * 2, amp * 6);
  d = amp * 4;
  while (step > 1) {
    half = step / 2;
    for (i = half; i < 256; i += step) { i16 r = rnd(-d, d); e[i] = (i16)(((i32)e[i - half] + e[i + half]) / 2 + r); }
    step = half; d = (i16)((i32)d * rough / 256);
  }
  {   // softer shapes (peaks once, rounder terrains three times), still starting exactly at the edge height
    i16 pass, passes = terr == R_PEAKS ? 1 : 3;
    for (pass = 0; pass < passes; pass++) for (i = 1; i < 255; i++) e[i] = (i16)(((i32)e[i - 1] + e[i] * 2 + e[i + 1]) / 4);
  }
  for (i = 0; i < n; i++) {
    // never higher than the piece's own highest point on this layer: the banner must not turn into a bowl
    i16 v = e[i + 1] < rec_top[l] ? rec_top[l] + (rec_top[l] - e[i + 1]) / 2 : e[i + 1];   // folded back down, not cut flat
    v = clampi(v, 8 * 8, (wet ? horizon - 1 : H - 1) * 8);
    hgt[IX(dir > 0 ? GEN_W + i : -1 - i)] = v;
  }
  rs_set(save);
}
static void wide_profile(i16 l, i16 base, i16 amp, u8 terr) {
  i16 x;
  for (x = 0; x < GEN_W; x++) hgt[IX(x)] = rec_hgt[l][x];
  extend_side(l, base, amp, terr, 1);
  extend_side(l, base, amp, terr, -1);
}
#endif

#ifndef __SDCC
// one tree at column x (draws nothing on open water), its height from the random stream
static void plant_tree(i16 x, u8 near, i16 tl) {
  i16 th, y0, dy, dx;
  if (hgt[IX(x)] == SENT || iabs(x - cabx) <= 10) return;   // a glade around the cabin
  th = t->terrain == R_ISLANDS ? rnd(3, 7) : near ? rnd(5, 13) : rnd(3, 7); y0 = hgt[IX(x)] / 8 + 1;
  for (dy = 0; dy <= th; dy++) {
    i16 hw = dy * 42 / 100 + (dy % 3 == 2 ? 1 : 0);
    for (dx = -hw; dx <= hw; dx++) {
      i16 X = x + dx, Y = y0 - th + dy;
      if (inb(X, Y)) { if (near) setH(X, Y, 3); else setT(X, Y, tl); }
    }
  }
  if (near) for (dx = x - 3; dx <= x + 3; dx++) if (dx >= GX0 && dx < GX1 && y0 < grnd[IX(dx)]) grnd[IX(dx)] = y0;
}
#endif

// cabin site on the near layer (before its trees, so they leave a glade around it): the flattest spot
static void cabin_site(void) {
  i16 x, bs = 32767;
  cabx = 20;
  for (x = 20; x < 140; x++) { i16 s = iabs(grnd[IX(x + 5)] - grnd[IX(x - 5)]); if (s < bs && grnd[IX(x)] < H - 12) { bs = s; cabx = x; } }
}

void ridge_setup(void) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
  // 8. ridges, far to near
  L = t->layers;
  bottom = wet ? horizon - 3 : (i16)((i32)h * 78 / 100);
  far = clampi(skyAt(skyBottom) + (night ? 12 : t->sky == S_ECLIPSE ? -12 : 48), 0, 166);   // night: wider tone range so ridges separate; eclipse: hazed by the horizon ring
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
  for (x = GX0; x < GX1; x++) { grnd[IX(x)] = h; skyl[IX(x)] = (u8)h; }
  for (y = 0; y < h; y++) skyrow[y] = (u8)skyAt(y);
  if (t->sky == S_ECLIPSE) for (y = skyBottom * 45 / 100; y < h; y++) skyrow[y] = (u8)(skyrow[y] - (i16)((i32)60 * smooth256(skyBottom * 45 / 100, skyBottom, y) / 256));   // the horizon ring (gen_sky.c)
}

void draw_layer(i16 l) GEN_BANKED {
  i16 x, y, i, k, h = H;
  (void)x; (void)y; (void)i; (void)k; (void)h;
    i16 f = L == 1 ? 256 : l * 256 / (L - 1), q, base, amp, tl, mist, minH = 32767, maxH = -32767, snowY, snowAbs, mist0, flr;
    u8 near = l == L - 1, terr = t->terrain, snowy, vlit;
    q = (l + 1) * 256 / L; q = q - (i16)((i32)q * (256 - q) / 1900);
    base = top + (i16)((i32)(bottom - top) * q / 256);
    amp = 64 * (256 - f * 55 / 100) / 256;
    if (terr == R_FJORD) terr = R_PEAKS;
    if (terr == R_ISLANDS && l == 0) terr = R_PEAKS;
    if (terr == R_VOLCANO && l != imax(0, L - 3)) terr = R_PEAKS;
    if (terr == R_MESAS && l < L - 2) terr = R_HILLS;   // mesas on the two nearest layers; far away they read as soft hills
    // heights in 1/8 px
#ifndef __SDCC
    if (WIDE) wide_profile(l, base, amp, terr);   // banner pass: the normal pass's ridge, continued sideways
    else
#endif
    if (terr == R_PEAKS) {
      mdisp(154); smooth(prof, 1);
      for (x = 0; x < GEN_W; x++) {
        u32 v = (u32)prof[x];   // non-negative everywhere below, so / 2^k is the same as >> k
        i16 p = (i16)((v * 102 + ((v * v * 154) >> 8)) >> 8);
        hgt[x] = base * 8 - (i16)(((((u32)amp * 8 * (u32)p) >> 8) * (t->terrain == R_FJORD ? 5 : 4)) >> 2);
      }
    } else if (terr == R_HILLS) {
      mdisp(128); smooth(prof, 7);
      { u32 a = (u32)amp * 8 * 55 / 100; for (x = 0; x < GEN_W; x++) hgt[x] = base * 8 - (i16)((a * (u32)prof[x]) >> 8); }
    } else if (terr == R_MESAS) {
      i16 lv;
      mdisp(141); smooth(prof, 2);
      lv = 140 + rnd(0, 45);   // a high cut: narrow buttes, not slabs
      for (x = 0, k = 0; x < GEN_W; x++) {
        hs[x] = smooth256(lv - 20, lv + 5, prof[x]);
        if (hs[x] > 128) { if (++k > 40) { for (i = x; i < x + 16 && i < GEN_W; i++) hs[i] = 0; x += 15; k = 0; } } else k = 0;   // no plateau wider than ~40 px
      }
      winmax(hs, 6, 1); winmax(hs, 6, 0);   // closing: no slots narrower than a dozen pixels
      for (x = 0; x < GEN_W; x++) md[x] = hs[x];
      winmax(md, 10, 1); winmax(md, 10, 0);   // gaps under ~20 px get a saddle, so buttes never show a deep slot
      for (x = 0; x < GEN_W; x++) {   // talus: a slope at the foot of each wall, the top 40% stays a cliff; a low bench between
        i16 m = imax(hs[x], imax(40, md[x] * 3 / 8)), j;
        for (j = imax(0, x - 6); j <= imin(GEN_W - 1, x + 6); j++) { i16 v = (i16)((u16)hs[j] * 150 >> 8) - iabs(x - j) * 25; if (v > m) m = v; }
        tmp[x] = m;
      }
      for (x = 0; x < GEN_W; x++) hs[x] = tmp[x];
      { u32 a = (u32)amp * 8 * 75 / 100; for (x = 0; x < GEN_W; x++) hgt[x] = base * 8 - (i16)((a * ((u32)hs[x] * 218 + (u32)prof[x] * 38)) >> 16); }
    } else if (terr == R_DUNES) {
      i16 lam = rnd(28, 60), off = rnd(0, lam - 1);
      mdisp(128);
      for (x = 0; x < GEN_W; x++) {
        i16 s = (x + off) % lam * 256 / lam, wv = s < 184 ? (i16)((i32)s * 256 / 184) : (256 - s) * 256 / 72;
        hgt[x] = base * 8 - (i16)((((u32)amp * 8 * 38 / 100) * ((u32)wv * 179 + (u32)prof[x] * 77)) >> 16);
      }
      smooth(hgt, 1);
    } else if (terr == R_VOLCANO) {
      i16 cx = rnd(45, 115), w = rnd(38, 60), mn = 32767;
      mdisp(154);
      for (x = 0; x < GEN_W; x++) {
        i16 c = imax(0, 256 - iabs(x - cx) * 256 / w), c125 = (i16)((i32)c * (192 + c / 4) / 256);
        hgt[x] = base * 8 - (i16)(((u32)amp * 8 * ((u32)320 * c125 + (u32)31 * prof[x])) >> 16);
        if (iabs(x - cx) < 4) hgt[x] += 24 - iabs(x - cx) * 4;
        if (hgt[x] < mn) mn = hgt[x];
      }
      volx = cx; voly = -1;   // set after the clearance rescale below
    } else {   // islands sitting on the horizon
      i16 n = f < 128 ? rnd(1, 2) : rnd(1, 3), j;
      for (x = 0; x < GEN_W; x++) hgt[x] = SENT;
      for (j = 0; j < n; j++) {
        i16 cx = rnd(0, GEN_W - 1), w0 = rnd(14, 46), w = (i16)((i32)w0 * (154 + f) / 256), a0 = rnd(0, 128), a;
        if (w < 4) w = 4;
        a = (i16)((i32)amp * (90 + a0) / 256 * (128 + (i16)((i32)f * 154 / 256)) / 256);
        mdisp(160); smooth(prof, 1);   // rough, so islands read as rock and trees, not a smooth lens
        for (x = 0; x < GEN_W; x++) {
          i16 d = (i16)((i32)iabs(x - cx) * 256 / w);
          if (d < 256) {
            i16 qq = 256 - (i16)((i32)d * d / 256), q15 = (i16)(((i32)qq * qq / 256 + qq) / 2);
            i16 hy = (horizon - 1) * 8 - (i16)((i32)a * 8 * q15 / 256 * (112 + prof[x] / 2) / 256);
            if (hy < hgt[x]) hgt[x] = hy;
          }
        }
      }
    }
    // keep below the top edge and below the sun or moon (a high one fully, a low sun at least half)
    if (!WIDE) {
      i16 clr = lowsun ? ly : ly + lrad + 4, edge = 8, kkE = 256, kkS = 256, kx = 256;
      for (x = 0; x < GEN_W; x++) {
        i16 need = iabs(x - lx) < lrad + 8 ? imax(edge, clr) : edge;
        if (hgt[x] == SENT) continue;
        if (hgt[x] < edge * 8 && base > edge) kkE = imin(kkE, (i16)((i32)(base - edge) * 256 * 8 / (base * 8 - hgt[x])));
        if (need > edge && hgt[x] < need * 8 && base > need) kkS = imin(kkS, (i16)((i32)(base - need) * 256 * 8 / (base * 8 - hgt[x])));
      }
      // a high sun or moon squashes the whole layer; a low sun only around itself, so it sets into a saddle and
      // the ridges away from it keep their height
      if (!lowsun) kkE = kkS = imin(kkE, kkS);
      if (kkE < 256 || kkS < 256) for (x = 0; x < GEN_W; x++) {
        kx = imin(kkE, 256 - (i16)((i32)(256 - kkS) * (256 - smooth256(lrad + 8, lrad + 48, iabs(x - lx))) / 256));
        if (hgt[x] != SENT && kx < 256) hgt[x] = base * 8 - (i16)((i32)(base * 8 - hgt[x]) * kx / 256);
#ifndef __SDCC
        if (x == 0) rec_kk[l][0] = kx;
#endif
      }
#ifndef __SDCC
      rec_kk[l][1] = kx;
      if (kkE == 256 && kkS == 256) rec_kk[l][0] = rec_kk[l][1] = 256;
      rec_top[l] = 32767; for (x = 0; x < GEN_W; x++) if (hgt[x] != SENT && hgt[x] < rec_top[l]) rec_top[l] = hgt[x];
      if (rec_top[l] == 32767) rec_top[l] = base * 8;
#endif
    }
    if (terr == R_VOLCANO && !WIDE) {   // the crater after rescaling: midway between the highest rim point on each side
      i16 xl = volx - 1, xr = volx + 1, dx;
      for (dx = 2; dx <= 6; dx++) {
        if (volx - dx >= 0 && hgt[volx - dx] < hgt[xl]) xl = volx - dx;
        if (volx + dx < GEN_W && hgt[volx + dx] < hgt[xr]) xr = volx + dx;
      }
      volx = (xl + xr) / 2;
      voly = hgt[volx] / 8;
    }
    // a nearer ridge never hides the crater: it dips around the volcano's top so the plume starts from a visible peak
    if (t->terrain == R_VOLCANO && terr != R_VOLCANO && vol_lit && voly > 0 && l > imax(0, L - 3)) {
      i16 dx;
      for (dx = -28; dx <= 28; dx++) {   // full depth within 12 px, fading out by 28 px: a saddle, never a cliff
        i16 X = volx + dx, need = (voly + 7 + iabs(dx) / 2) * 8, w = 256 - smooth256(12, 28, iabs(dx));
        if (X >= 0 && X < GEN_W && hgt[X] != SENT && hgt[X] < need) hgt[X] += (i16)((i32)(need - hgt[X]) * w / 256);
      }
    }
#ifndef __SDCC
    if (!WIDE) { for (x = 0; x < GEN_W; x++) rec_hgt[l][x] = hgt[x]; rec_volx = volx; rec_voly = voly; }
    else { volx = rec_volx; voly = rec_voly; }
#endif
    for (x = GX0; x < GX1; x++) hs[IX(x)] = hgt[IX(x)] == SENT ? horizon * 8 : hgt[IX(x)];
    smooth(hs, 3);
    tl = near ? 192 : far + (i16)((i32)(192 - far) * (f + (i16)((i32)f * (256 - f) / 1100)) / 256);
    if (near && t->terrain == R_ISLANDS) tl = far + (i16)((i32)(192 - far) * 200 / 256);   // islands keep some haze, never a black lens
    for (x = 0; x < GEN_W; x++) if (hgt[IX(x)] != SENT) { if (hgt[IX(x)] < minH) minH = hgt[IX(x)]; if (hgt[IX(x)] > maxH) maxH = hgt[IX(x)]; }   // the picture's own columns
    minH /= 8; maxH /= 8;
    mist = near ? 0 : (256 - f) * 54 / 256 + 10 + (t->weather == W_FOG ? 32 : 0);
    if (night) mist /= 2;   // at night valley mist must not outshine the moon
    snowY = minH + (maxH - minH) * 38 / 100;
    snowAbs = top + (bottom - top) * 45 / 100;   // low foreground humps stay bare
    mist0 = minH + (base - minH) / 4;
    flr = wet ? horizon : h;
    vlit = 0;
    if (terr == R_VOLCANO) {   // what is really behind the crater (sky or cloud, not the sun): light means a dark cone with a dark outline
      i16 sum = 0, n = 0, d;
      for (d = -6; d <= 6; d += 3) if (inb(volx + d, voly - 3)) { u8 v = px_get(volx + d, voly - 3); if (v < HARD) { sum += v; n++; } }
      vlit = n ? sum / n < 96 : skyrow[clampi(voly, 0, flr - 1)] < 96;
    }
    if (terr == R_VOLCANO) vol_lit = vlit;
    snowy = t->snowcaps && !near && (terr == R_PEAKS || terr == R_VOLCANO);
    // the valley mist depends only on the row: once per row instead of per pixel
    for (y = 0; y < flr; y++) mistrow[y] = (i16)(((u16)mist * (u16)smooth256(mist0, base + 4, y)) >> 8);   // <= 96 * 256
    for (y = 0; y < flr; y++) { i16 v = tl - mistrow[y]; bv[y] = (u8)(v < 0 ? 0 : v > TONE_MAX ? TONE_MAX : v); }
    if (!near && minH <= maxH) {   // a far layer stays at least 20 tone steps off the sky behind it, on the side it already is
      i16 ym = clampi((minH + maxH) / 2, 0, flr - 1);
      u8 dark = bv[ym] >= skyrow[ym] || vlit;
      i16 gap = vlit ? 36 : 20;   // the volcano's outline must read, or its plume floats
      // only where the ridge line meets the sky (down to its lowest notch), fading out below so the valley mist stays
      for (y = 0; y < imin(flr, maxH + 16); y++) {
        i16 v = bv[y], sv = skyrow[y], w = y < maxH + 4 ? 12 : maxH + 16 - y;   // weight 0..12
        if (dark) { if (v < sv + gap) v += (imin(TONE_MAX, sv + gap) - v) * w / 12; }
        else if (v > sv - gap) v -= (v - imax(0, sv - gap)) * w / 12;
        bv[y] = (u8)v;
      }
    }
    for (x = GX0; x < GX1; x++) {
      i16 y0, d8, rimD, jit, sgn = lx > x ? 1 : lx < x ? -1 : 0, rim = rimA;
      u8 lit;
      if (hgt[IX(x)] == SENT) continue;
      y0 = imax(0, hgt[IX(x)] / 8);
      if (y0 < skyl[IX(x)]) skyl[IX(x)] = (u8)y0;
      if (!near && y0 < flr) { i16 c = iabs((i16)bv[y0] - skyrow[y0]); rim = imin(rimA, imax(0, 2 * (c - 12))); }   // a faint ridge gets a faint rim
      d8 = hs[IX(imin(GX1 - 1, x + 2))] - hs[IX(imax(GX0, x - 2))];
      lit = sgn * d8 >= 2;
      rimD = 3 + imin(6, iabs(d8) / 8);
      jit = 3 * SINA(x * 19 / 2 + l * 41) / 127 + 4 * SINA(x * 29 / 10 + l * 81) / 127 + ((x * 13 + l) % 5 == 0 ? -2 : 0);
      {
        // rows near the ridge line can get rim light or snow; below that every pixel is the row's plain tone
#ifdef __SDCC
        i16 slow = imin(flr, imax(lit ? y0 + rimD : y0, snowy ? imin(snowY, snowAbs) + jit : y0));
        for (y = y0; y < slow; y++) {
          i16 dy = y - y0, v = bv[y];
          if (lit && dy < rimD && !(vlit && dy < 2)) v -= rim * (rimD - dy) / rimD * (near ? 154 : 256) / 256;   // <= 83 * 256: 16 bits; the volcano's outline stays dark
          if (snowy && y < snowY + jit && y < snowAbs + jit && !(vlit && (dy < 2 || (iabs(x - volx) <= 4 && y < voly + 4)))) v = imax(0, tl - 160) + (lit ? 0 : 35) + (vlit ? 24 : 0) + clampi((y - (snowY + jit - 4)) * 64, 0, 256) * 38 / 256;
          px_set(x, y, (u8)(v < 0 ? 0 : v > TONE_MAX ? TONE_MAX : v));
        }
#else
        i16 sy = imin(snowY, snowAbs);
        if (WIDE && (x < 0 || x >= GEN_W)) {   // banner sides: a snow cap, never a slab (eased in over 24 px from the seam); no lit/unlit flicker on gentle slopes
          i16 ds = x < 0 ? -x : x - (GEN_W - 1);
          if (sy > y0 + 5) sy = ds < 24 ? y0 + 5 + (sy - y0 - 5) * (24 - ds) / 24 : y0 + 5;
          lit = d8 >= 6 || d8 <= -6 ? lit : 1;
        }
        i16 slow = imin(flr, imax(lit ? y0 + rimD : y0, snowy ? sy + jit : y0));
        for (y = y0; y < slow; y++) {
          i16 dy = y - y0, v = bv[y];
          if (lit && dy < rimD && !(vlit && dy < 2)) v -= rim * (rimD - dy) / rimD * (near ? 154 : 256) / 256;   // <= 83 * 256: 16 bits; the volcano's outline stays dark
          if (snowy && y < sy + jit && !(vlit && (dy < 2 || (iabs(x - volx) <= 4 && y < voly + 4)))) v = imax(0, tl - 160) + (lit ? 0 : 35) + (vlit ? 24 : 0) + clampi((y - (snowY + jit - 4)) * 64, 0, 256) * 38 / 256;
          px_set(x, y, (u8)(v < 0 ? 0 : v > TONE_MAX ? TONE_MAX : v));
        }
#endif
        for (; y < flr; y++) px_set(x, y, bv[y]);
        if (t->terrain == R_ISLANDS && l > 0 && flr - 1 > y0) px_set(x, flr - 1, (u8)imax(0, tl - 90));   // light shoreline
      }
      if (near) grnd[IX(x)] = y0;
    }
    if (terr == R_VOLCANO) draw_volcano();
    if (near && (t->extras & X_CABIN)) cabin_site();
#ifdef __SDCC
    // trees on the two nearest layers
    if (l >= L - 2) {
      u8 trees = t->ground == G_FOREST || t->terrain == R_ISLANDS;
      if (!trees && t->ground == G_SNOWFIELD) trees = chance(128);
      if (trees) {
        i16 sparse = t->ground == G_SNOWFIELD ? 3 : t->terrain == R_ISLANDS ? 2 : 1;
        for (x = GX0 + rnd(0, 3); x < GX1; ) {
          if (hgt[IX(x)] != SENT && iabs(x - cabx) > 10) {
            i16 th = t->terrain == R_ISLANDS ? rnd(3, 7) : near ? rnd(5, 13) : rnd(3, 7), y0 = hgt[IX(x)] / 8 + 1, dy, dx;
            for (dy = 0; dy <= th; dy++) {
              i16 hw = dy * 42 / 100 + (dy % 3 == 2 ? 1 : 0);
              for (dx = -hw; dx <= hw; dx++) {
                i16 X = x + dx, Y = y0 - th + dy;
                if (inb(X, Y)) { if (near) setH(X, Y, 3); else setT(X, Y, tl); }
              }
            }
            if (near) for (dx = x - 3; dx <= x + 3; dx++) if (dx >= GX0 && dx < GX1 && y0 < grnd[IX(dx)]) grnd[IX(dx)] = y0;
          }
          { i16 st = rnd(2, 5); x += st * sparse; }
        }
      }
    }
#else
    // trees on the two nearest layers
    SYNC(24 + l);   // banner: the wide pass skipped this layer's shape randomness; the trees start in step with the piece
    if (l >= L - 2) {
      u8 trees = t->ground == G_FOREST || t->terrain == R_ISLANDS;
      if (!trees && t->ground == G_SNOWFIELD) trees = chance(128);
      if (trees) {
        i16 sparse = t->ground == G_SNOWFIELD ? 3 : t->terrain == R_ISLANDS ? 2 : 1, first = -1;
        for (x = rnd(0, 3); x < GEN_W; ) {   // the piece's trees (in the banner too, so none is cut at the seams)
          if (first < 0) first = x;
          plant_tree(x, near, tl);
          { i16 st = rnd(2, 5); x += st * sparse; }
        }
#ifndef __SDCC
        if (WIDE) {   // banner sides: the same spacing rules, continued outward on a side stream
          SIDE_BEGIN(0x7EE5UL + (u32)l * 977UL);
          for (; x < GX1; ) { plant_tree(x, near, tl); { i16 st = rnd(2, 5); x += st * sparse; } }
          for (x = first - rnd(2, 5) * sparse; x >= GX0; ) { plant_tree(x, near, tl); { i16 st = rnd(2, 5); x -= st * sparse; } }
          SIDE_END();
        }
#endif
      }
    }
#endif
    gen_phase(P_RIDGE);
}
