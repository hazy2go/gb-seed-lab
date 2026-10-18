// Devnet/test stand-in for src/lanes/hardware.mjs (swapped in by sim-hooks.mjs, never in production): a simulated
// Game Boy that "draws" the reference picture of the seed in a few phases with realistic gaps, so the whole queue,
// seed, storage and mint path can be exercised on devnet without the console. The pixels are the reference build's,
// so the server's tile check passes exactly as with a correct cartridge.
import { EventEmitter } from 'node:events';
import { drawPiece, toTiles } from '../../src/reference.mjs';
import { startFrame } from '../../src/lanes/frame.mjs';
export { crc16, startFrame } from '../../src/lanes/frame.mjs';
export class HardwareLane extends EventEmitter {
  constructor() {
    super(); this.open_ = true; this.busy = false; this.lastByte = Date.now();
    setInterval(() => { this.lastByte = Date.now(); }, 500).unref();
    setTimeout(() => this.emit('ready'), 500);
  }
  get ready() { return !this.busy; }
  get silentFor() { return Date.now() - this.lastByte; }
  info() { return { kind: 'hardware', label: 'SIMULATED Game Boy (devnet test)', port: 'sim' }; }
  draw(seed, piece, special = 0) {
    this.busy = true;
    this.lastFrame = startFrame(seed, piece, special);   // the bytes the real lane would send
    const tiles = toTiles(drawPiece(seed, special).px), PHASE_MS = +(process.env.SIM_PHASE_MS || 2500);
    setTimeout(() => this.emit('begin', { seed: seed >>> 0, piece: piece & 0xffff, traits: [] }), 300);
    for (let k = 1; k <= 3; k++) setTimeout(() => this.emit('phase', { seq: k, phase: k, rows: 18, tiles: Buffer.from(tiles) }), 300 + k * PHASE_MS);
    setTimeout(() => { this.emit('done', { seed: seed >>> 0, piece: piece & 0xffff, frames: Math.round((300 + 4 * PHASE_MS) / 16.74), screenCrc: 0, screenOk: true, heartbeat: null }); this.busy = false; setTimeout(() => this.emit('ready'), 200); }, 300 + 4 * PHASE_MS);
  }
}
