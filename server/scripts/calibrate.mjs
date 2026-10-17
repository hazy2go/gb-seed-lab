// Heartbeat calibration: the Pico measures its own exact 8192 Hz square wave (firmware ESC GBCALIB2).
// A correct measurement chain reads ~0 ppm. Usage: node scripts/calibrate.mjs [seconds] [port]
import { SerialPort } from 'serialport';
const secs = +(process.argv[2] || 15);
let path = process.argv[3];
if (!path) path = (await SerialPort.list()).find(p => (p.vendorId || '').toLowerCase() === '2e8a')?.path;
const sp = new SerialPort({ path, baudRate: 115200 });
let esc = false, left = 0, buf = [];
const v = [];
sp.on('data', (d) => {
  for (const b of d) {
    if (left) { buf.push(b); if (--left === 0) { const h = Buffer.from(buf); v.push(h.readInt32LE(0) / 1000); } }
    else if (esc) { esc = false; if (b === 1) { left = 8; buf = []; } }
    else if (b === 0xfd) esc = true;
  }
});
await new Promise(r => sp.once('open', r));
sp.write(Buffer.from('\x1bGBCALIB2', 'latin1'));
await new Promise(r => setTimeout(r, secs * 1000));
sp.close();
const mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
console.log(`calibration: ${v.length} reports, mean ${mean.toFixed(3)} ppm, sd ${sd.toFixed(3)} ppm`);
console.log(v.slice(0, 12).map(x => x.toFixed(2)).join(' '));
