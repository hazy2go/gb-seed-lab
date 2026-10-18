// Hardware lane: the real Game Boy running seedlab.gb, through the gb-link-usb Pico in bridge mode 2.
// Link protocol v2 (see the top of gb/main.c): every frame is $7E type len(2 LE) payload crc16(2 LE), the CRC
// (CCITT, init $FFFF) covering type, len and payload. Bridge mode 2 escapes GB byte $FD as $FD $00 and inserts
// heartbeat reports as $FD $01 int32 ppb uint32 n.
//
// Start frame (PC -> Game Boy): see startFrame below.
//
// Events: ready / down (the Game Boy is talking or not), hello, begin {seed, piece, traits}, phase {phase, seq,
// rows, tiles}, done {seed, piece, frames, screenCrc, screenOk}, heartbeat {ppb, n, at}, fault {reason}.
import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import { crc16, startFrame } from './frame.mjs';

const BRIDGE_MAGIC = Buffer.from('\x1bGBBRIDG2', 'latin1');
const ALIVE_MS = 3000;        // the ROM polls every ~1 ms and pauses 0.3 s every ~2 s
const PARTIAL_MS = 150;       // bytes inside a frame arrive every ~1 ms; a gap this long means the frame is dead

export { crc16, startFrame };

export class HardwareLane extends EventEmitter {
  constructor({ port = '' } = {}) {
    super();
    this.kind = 'hardware';
    this.portPath = port;
    this.open_ = false;
    this.lastByte = Date.now();   // grace period at startup
    this.lastFrameAt = Date.now();
    this.wasReady = false;
    this.reset();
    this.connect();
    this.aliveTimer = setInterval(() => this.checkAlive(), 500);
    this.lastHb = 0;
    this.on('heartbeat', () => { this.lastHb = Date.now(); });
    // Self-heal: bytes arrive but no heartbeat for 10 s while idle = the firmware fell back out of bridge mode 2 (it
    // does that on a USB blip while macOS keeps the port open): send the switch again. Port open but silent for 20 s
    // while idle = a dead port: close it, the 'close' handler reconnects.
    this.healTimer = setInterval(() => {
      if (!this.open_ || this.want || this.inDraw) return;
      const now = Date.now();
      if (now - this.lastByte < 1000 && now - this.lastHb > 10000 && now - (this.lastMagic || 0) > 10000) { this.lastMagic = now; this.sp.write(BRIDGE_MAGIC); this.emit('error', new Error('no heartbeat: re-sent bridge switch')); }
      else if (now - this.lastByte > 20000 && now - (this.lastReopen || 0) > 20000) { this.lastReopen = now; this.sp.close(() => {}); }
    }, 2000);
  }
  // Ready = idle: the ROM's idle polls are arriving and no frame has been in progress for 2.5 s. While it draws, the
  // Game Boy computes for seconds without any link traffic, so it is "not ready" then; the server's phase watchdog
  // judges a drawing, and only long silence with nothing to draw counts as offline.
  get ready() {
    const now = Date.now();
    return this.open_ && !this.want && !this.inDraw && now - this.lastByte < 1000 && now - this.lastFrameAt > 2500;
  }
  get silentFor() { return Date.now() - this.lastByte; }
  reset() {
    this.buf = Buffer.alloc(0); this.esc = false; this.hbLeft = 0; this.hbBuf = [];
    this.screen = Buffer.alloc(360 * 16); this.expectSeq = 1; this.inDraw = null; this.lastRx = 0;
  }
  checkAlive() {
    const r = this.ready;
    if (r !== this.wasReady) { this.wasReady = r; if (r) this.emit('ready'); else this.emit('down', new Error(this.open_ ? 'Game Boy silent' : 'Pico not connected')); }
  }
  connect() {
    this.open().catch((e) => { this.emit('error', e); setTimeout(() => this.connect(), 5000); });
  }
  async open() {
    let p = this.portPath;
    if (!p) {
      const pico = (await SerialPort.list()).find(x => (x.vendorId || '').toLowerCase() === '2e8a');
      if (!pico) throw new Error('no Pico found (USB vendor 2e8a)');
      p = pico.path;
    }
    this.sp = new SerialPort({ path: p, baudRate: 115200 });
    this.sp.on('data', (d) => { try { this.onData(d); } catch (e) { this.emit('fault', { reason: 'parser: ' + e.message }); this.reset(); } });
    this.sp.on('error', (e) => this.emit('error', e));
    this.sp.on('end', () => { if (this.sp?.isOpen) this.sp.close(() => {}); });   // a 0-byte read ends the stream without 'close' (seen: Pico replugged, never picked up)
    this.sp.on('close', () => { this.open_ = false; this.reset(); this.checkAlive(); this.emit('error', new Error('serial port closed')); setTimeout(() => this.connect(), 5000); });
    await new Promise((res, rej) => { this.sp.once('open', res); this.sp.once('error', rej); });
    this.reset();
    this.sp.write(BRIDGE_MAGIC);
    this.open_ = true;
  }
  info() { return { kind: this.kind, label: 'Real Game Boy (DMG) via gb-link-usb', port: this.sp?.path }; }
  draw(seed, piece = 0, special = 0) {
    this.want = { seed: seed >>> 0, piece: piece & 0xffff, special: special & 0xff };
    this.sp.write(startFrame(seed, piece, special));
  }
  // undo the bridge-2 escaping; heartbeat reports become events, the rest is the Game Boy's stream
  unescape(d) {
    const out = [];
    for (const b of d) {
      if (this.hbLeft > 0) {
        this.hbBuf.push(b);
        if (--this.hbLeft === 0) { const h = Buffer.from(this.hbBuf); this.emit('heartbeat', { ppb: h.readInt32LE(0), n: h.readUInt32LE(4), at: Date.now() }); }
      } else if (this.esc) {
        this.esc = false;
        if (b === 0x00) out.push(0xfd);
        else if (b === 0x01) { this.hbLeft = 8; this.hbBuf = []; }
      } else if (b === 0xfd) this.esc = true;
      else out.push(b);
    }
    return Buffer.from(out);
  }
  onData(raw) {
    const now = Date.now();
    this.lastByte = now;
    if (this.buf.length && now - this.lastRx > PARTIAL_MS) this.buf = Buffer.alloc(0);   // drop a dead partial frame
    this.lastRx = now;
    this.buf = Buffer.concat([this.buf, this.unescape(raw)]);
    for (;;) {
      const start = this.buf.indexOf(0x7e);
      if (start < 0) { this.buf = Buffer.alloc(0); return; }
      if (start > 0) this.buf = this.buf.subarray(start);
      if (this.buf.length < 4) return;
      const type = String.fromCharCode(this.buf[1]), len = this.buf.readUInt16LE(2);
      const okLen = type === 'H' ? len === 8 : type === 'B' ? len === 15 : type === 'D' ? len === 10
        : type === 'P' ? len >= 3 && (len - 3) % 321 === 0 && (len - 3) / 321 <= 18 : false;
      if (!okLen) { this.buf = this.buf.subarray(1); continue; }
      if (this.buf.length < 4 + len + 2) { this.lastFrameAt = Date.now(); return; }   // mid-frame
      if (crc16(this.buf.subarray(1, 4 + len)) !== this.buf.readUInt16LE(4 + len)) { this.buf = this.buf.subarray(1); continue; }
      const payload = Buffer.from(this.buf.subarray(4, 4 + len));
      this.buf = this.buf.subarray(4 + len + 2);
      this.lastFrameAt = Date.now();
      this.frame(type, payload);
    }
  }
  frame(type, p) {
    if (type === 'H') {
      if (this.inDraw || this.want) this.emit('fault', { reason: 'Game Boy restarted during a drawing' });
      this.inDraw = null; this.want = null;
      this.emit('hello', p.toString('latin1'));
    } else if (type === 'B') {
      const seed = p.readUInt32LE(0), piece = p.readUInt16LE(4);
      if (this.want && (seed !== this.want.seed || piece !== this.want.piece)) { this.emit('fault', { reason: `began seed ${seed.toString(16)} piece ${piece}, expected ${this.want.seed.toString(16)} piece ${this.want.piece}` }); return; }
      this.screen = Buffer.alloc(360 * 16); this.expectSeq = 1; this.inDraw = { seed, piece };
      this.emit('begin', { seed, piece, traits: [...p.subarray(6)] });
    } else if (type === 'P') {
      if (!this.inDraw) return;
      const phase = p[0], seq = p[1], n = p[2];
      if (seq !== (this.expectSeq & 0xff)) { this.emit('fault', { reason: `screen update ${seq} arrived, expected ${this.expectSeq}` }); this.inDraw = null; return; }
      this.expectSeq++;
      let last = -1;
      for (let k = 0; k < n; k++) {
        const off = 3 + k * 321, row = p[off];
        if (row >= 18 || row <= last) { this.emit('fault', { reason: 'bad row list in a screen update' }); this.inDraw = null; return; }
        last = row;
        p.copy(this.screen, row * 320, off + 1, off + 321);
      }
      this.emit('phase', { seq, phase, rows: n, tiles: Buffer.from(this.screen) });
    } else if (type === 'D') {
      if (!this.inDraw) return;
      const seed = p.readUInt32LE(0), piece = p.readUInt16LE(4), frames = p.readUInt16LE(6), screenCrc = p.readUInt16LE(8);
      const ok = seed === this.inDraw.seed && piece === this.inDraw.piece && crc16(this.screen) === screenCrc;
      this.inDraw = null; this.want = null;
      this.emit('done', { seed, piece, frames, screenCrc, screenOk: ok, heartbeat: null });
    }
  }
}
