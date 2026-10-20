// Replay as an animated GIF (Hazy 2026-10-21): the screen updates the Game Boy sent while drawing a piece
// (pieces/N.replay.json), each landing one tile row band at a time like on the page, then the palette fade.
// No dependencies: a small GIF89a + LZW encoder. Works in the browser (window.ReplayGif) and in node (tests).
(function (root) {
  const W = 160, H = 144;

  function decode(b64) {   // 360 tiles, 2 bits per pixel, as the page decodes them
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const px = new Uint8Array(W * H);
    for (let n = 0; n < 360; n++) {
      const tx = n % 20, ty = (n / 20) | 0;
      for (let r = 0; r < 8; r++) {
        const lo = bin.charCodeAt(n * 16 + r * 2), hi = bin.charCodeAt(n * 16 + r * 2 + 1);
        for (let c = 0; c < 8; c++) px[(ty * 8 + r) * W + tx * 8 + c] = ((lo >> (7 - c)) & 1) | (((hi >> (7 - c)) & 1) << 1);
      }
    }
    return px;
  }
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  function lzw(px, minSize) {
    const clear = 1 << minSize, eoi = clear + 1, out = [];
    let size = minSize + 1, next = eoi + 1, dict = new Map(), cur = 0, nbits = 0;
    const emit = (code) => { cur |= code << nbits; nbits += size; while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8; } };
    emit(clear);
    let prefix = px[0];
    for (let i = 1; i < px.length; i++) {
      const k = px[i], key = prefix * 256 + k, c = dict.get(key);
      if (c !== undefined) { prefix = c; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (nbits > 0) out.push(cur & 255);
    return out;
  }

  // frames: [{ px: Uint8Array of palette indices (w*h), delay: centiseconds }]
  function encode(w, h, palette, frames) {
    let bits = 1; while ((1 << bits) < palette.length) bits++;
    const out = [], u16 = (v) => out.push(v & 255, (v >> 8) & 255), str = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    str('GIF89a'); u16(w); u16(h); out.push(0xf0 | (bits - 1), 0, 0);
    for (let i = 0; i < 1 << bits; i++) out.push(...(palette[i] || [0, 0, 0]));
    out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0);   // loop forever
    const minSize = Math.max(2, bits);
    for (const f of frames) {
      out.push(0x21, 0xf9, 4, 0); u16(f.delay); out.push(0, 0);
      out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0, minSize);
      const data = lzw(f.px, minSize);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]); }
      out.push(0);
    }
    out.push(0x3b);
    return Uint8Array.from(out);
  }

  // replay: { phases: [{ t, tiles }] }; lcd and colors: 4 '#rrggbb' each (screen while drawing, the piece's palette)
  function build(replay, lcd, colors, { scale = 3 } = {}) {
    const pal = [], index = new Map();
    const idx = (c) => { const k = c.join(','); if (!index.has(k)) { index.set(k, pal.length); pal.push(c); } return index.get(k); };
    const L = lcd.map(rgb).map(idx), F = colors.map(rgb), from = lcd.map(rgb);
    const STEPS = 8, fade = [];
    for (let s = 1; s <= STEPS; s++) {
      const k = s / STEPS, e = k * k * (3 - 2 * k);
      fade.push(from.map((f, i) => idx(f.map((v, j) => Math.round(v + (F[i][j] - v) * e)))));
    }
    const w = W * scale, h = H * scale, frames = [];
    const screen = new Uint8Array(W * H);   // 2-bit values currently shown
    const frame = (map, delay) => {
      const px = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) { const row = ((y / scale) | 0) * W; for (let x = 0; x < w; x++) px[y * w + x] = map[screen[row + ((x / scale) | 0)]]; }
      frames.push({ px, delay });
    };
    frame(L, 50);
    const phases = replay.phases || [], total = phases[phases.length - 1]?.t || 1;
    let prevT = 0;
    for (const ph of phases) {
      const px = decode(ph.tiles);
      for (let row = 24; row <= H; row += 24) { screen.set(px.subarray((row - 24) * W, row * W), (row - 24) * W); frame(L, 4); }
      frames[frames.length - 1].delay = Math.max(30, Math.round(((ph.t - prevT) / total) * 900));   // the real pacing, ~9 s in all
      prevT = ph.t;
    }
    frames[frames.length - 1].delay = 70;
    fade.forEach((m, i) => frame(m, i === fade.length - 1 ? 400 : 10));
    return encode(w, h, pal, frames);
  }

  const api = { build, encode, decode };
  if (typeof module !== 'undefined') module.exports = api; else root.ReplayGif = api;
})(typeof window !== 'undefined' ? window : globalThis);
