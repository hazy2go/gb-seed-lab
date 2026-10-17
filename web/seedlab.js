// Loader for gen.wasm (the same C source the Game Boy ROM is built from).
// Browser: SeedLab.load('gen.wasm').then(lab => lab.draw(seed)). Node: require('./seedlab.js').load(bytes).
(function (root) {
  const KINDS = ['palette', 'time', 'sky', 'terrain', 'ground', 'weather', 'extra'];
  async function load(src) {
    let onPhase = null;
    const imports = { env: { phase: (p) => { if (onPhase) onPhase(p); } } };
    const bytes = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : src;
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    const e = instance.exports, mem = () => new Uint8Array(e.memory.buffer);
    const str = (ptr) => { const m = mem(); let s = ''; for (let i = ptr; m[i]; i++) s += String.fromCharCode(m[i]); return s; };
    const names = {};
    for (let k = 0; k < KINDS.length; k++) { names[KINDS[k]] = []; for (let i = 0; ; i++) { const p = e.name(k, i); if (!p) break; names[KINDS[k]].push(str(p)); } }
    const palettes = names.palette.map((n, p) => ({ name: n, colors: [0, 1, 2, 3].map(i => '#' + e.color(p, i).toString(16).padStart(6, '0')) }));
    const readTraits = () => {
      const x = e.trait(8), extras = [];
      for (let i = 0; i < 8; i++) if (x & (1 << i)) extras.push(names.extra[i]);
      return { palette: names.palette[e.trait(0)], time: names.time[e.trait(1)], sky: names.sky[e.trait(2)], terrain: names.terrain[e.trait(3)],
        ground: names.ground[e.trait(4)], weather: names.weather[e.trait(5)], ridges: e.trait(6), snowcaps: !!e.trait(7), extras };
    };
    return {
      names, palettes,
      traits(seed) { e.traits(seed >>> 0); return readTraits(); },
      // returns { px: Uint8Array of shades 0..3, traits, colors }; phases(p, shadesOrNull) is called after each drawing phase
      draw(seed, h = 144, phases = null) {
        const n = 160 * h;
        onPhase = phases ? (p) => phases(p, mem().slice(e.buffer(), e.buffer() + n)) : null;
        e.draw(seed >>> 0, h);
        onPhase = null;
        const raw = mem().subarray(e.buffer(), e.buffer() + n), px = new Uint8Array(n);
        for (let i = 0; i < n; i++) px[i] = raw[i] & 3;
        const traits = readTraits();
        return { w: 160, h, px, traits, colors: palettes[e.trait(0)].colors };
      },
    };
  }
  const api = { load };
  if (typeof module !== 'undefined') module.exports = api; else root.SeedLab = api;
})(this);
