// Emulator lane: tools/lane_emu.py (PyBoy running the same ROM). Labelled "emulator" everywhere.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { REPO_DIR } from '../config.mjs';

export class EmulatorLane extends EventEmitter {
  constructor({ speed = 1 } = {}) {
    super();
    this.kind = 'emulator';
    this.speed = speed;
    this.ready = false;
    const py = path.join(REPO_DIR, '.venv', 'bin', 'python');
    this.proc = spawn(py, [path.join(REPO_DIR, 'tools', 'lane_emu.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.proc.on('exit', (code) => { this.ready = false; this.emit('error', new Error('emulator lane exited ' + code)); });
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let m; try { m = JSON.parse(line); } catch { return; }
      if (m.type === 'ready') { this.ready = true; this.emit('ready'); }
      else if (m.type === 'phase') this.emit('phase', { seq: m.seq, phase: m.phase, tiles: Buffer.from(m.tiles, 'base64') });
      else if (m.type === 'done') this.emit('done', { seed: m.seed, frames: m.frames, heartbeat: null });
    });
  }
  info() { return { kind: this.kind, label: 'Emulator (PyBoy), not real hardware', speed: this.speed }; }
  draw(seed) { this.proc.stdin.write(JSON.stringify({ seed, speed: this.speed }) + '\n'); }
}
