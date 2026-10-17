// Hardware lane: a real Game Boy running seedlab.gb, through the gb-link-usb Pico in bridge mode.
// Frames from the Game Boy: $7E type len(2 LE) payload sum(2 LE). Idle polls are $00 and are skipped.
// Not yet tested on hardware (needs the Pico connected). If the port is missing or drops, it retries every 5 s;
// meanwhile the lane is not ready and minting is closed.
import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';

const BRIDGE_MAGIC = Buffer.from('\x1bGBBRIDGE', 'latin1');

export class HardwareLane extends EventEmitter {
  constructor({ port = '' } = {}) {
    super();
    this.kind = 'hardware';
    this.ready = false;
    this.portPath = port;
    this.buf = Buffer.alloc(0);
    this.connect();
  }
  connect() {
    this.open().catch((e) => { this.emit('error', e); setTimeout(() => this.connect(), 5000); });
  }
  async open() {
    let p = this.portPath;
    if (!p) {
      const ports = await SerialPort.list();
      const pico = ports.find(x => (x.vendorId || '').toLowerCase() === '2e8a');
      if (!pico) throw new Error('no Pico found (USB vendor 2e8a)');
      p = pico.path;
    }
    this.sp = new SerialPort({ path: p, baudRate: 115200 });
    this.sp.on('data', (d) => this.onData(d));
    this.sp.on('error', (e) => this.emit('error', e));
    this.sp.on('close', () => { this.ready = false; this.emit('error', new Error('serial port closed')); setTimeout(() => this.connect(), 5000); });
    await new Promise((res) => this.sp.once('open', res));
    this.sp.write(BRIDGE_MAGIC);
    this.ready = true;   // the ROM says hello at boot; if it is already running we just send seeds
    this.emit('ready');
  }
  info() { return { kind: this.kind, label: 'Real Game Boy (DMG) via gb-link-usb', port: this.sp?.path }; }
  draw(seed) {
    const b = Buffer.alloc(7);
    b[0] = 0x7e; b[1] = 0x53; b.writeUInt32LE(seed >>> 0, 2);
    b[6] = b[2] ^ b[3] ^ b[4] ^ b[5];
    this.sp.write(b);
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const start = this.buf.indexOf(0x7e);
      if (start < 0) { this.buf = Buffer.alloc(0); return; }
      if (start > 0) this.buf = this.buf.subarray(start);
      if (this.buf.length < 4) return;
      const type = String.fromCharCode(this.buf[1]), len = this.buf.readUInt16LE(2);
      if (!'HBPD'.includes(type) || len > 6000) { this.buf = this.buf.subarray(1); continue; }
      if (this.buf.length < 4 + len + 2) return;
      const payload = this.buf.subarray(4, 4 + len);
      let sum = 0; for (const x of payload) sum = (sum + x) & 0xffff;
      if (sum !== this.buf.readUInt16LE(4 + len)) { this.buf = this.buf.subarray(1); continue; }
      this.buf = this.buf.subarray(4 + len + 2);
      if (type === 'H') this.emit('hello', payload.toString('latin1'));
      else if (type === 'P') this.emit('phase', { seq: null, phase: payload[0], tiles: Buffer.from(payload.subarray(1)) });
      else if (type === 'D') this.emit('done', { seed: payload.readUInt32LE(0), frames: payload.readUInt16LE(4), heartbeat: null });
    }
  }
}
