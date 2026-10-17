// Test stand-in for src/lanes/hardware.mjs (swapped in by loader-hooks.mjs, tests only): a connected, polling Game Boy
// that never starts a drawing, so pieces stay in the line and the mint counts as open.
import { EventEmitter } from 'node:events';
export function crc16() { return 0; }
export class HardwareLane extends EventEmitter {
  constructor() { super(); this.open_ = true; this.lastByte = Date.now(); setInterval(() => { this.lastByte = Date.now(); }, 1000).unref(); }
  get ready() { return false; }
  get silentFor() { return Date.now() - this.lastByte; }
  info() { return { kind: 'hardware', label: 'test lane', port: 'test' }; }
  draw() {}
}
