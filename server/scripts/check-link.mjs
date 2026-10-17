// Is the Game Boy connected? Opens the Pico (USB vendor 2e8a, or SERIAL_PORT / argv), switches it to bridge mode 2
// and reports for ~12 s: the port, whether the ROM's idle polls arrive (lane ready), heartbeat readings, and any
// frames. With DRAW=1 it also sends one test seed (dev piece 0) and waits for the Game Boy's 'B' (begin) frame.
// Stop the server first: only one program can hold the serial port.
//   node scripts/check-link.mjs [port]
import { SerialPort } from 'serialport';
import { HardwareLane } from '../src/lanes/hardware.mjs';

const ports = await SerialPort.list();
console.log('serial ports:'); for (const p of ports) console.log(' ', p.path, p.vendorId ? `vendor ${p.vendorId} product ${p.productId}` : '', p.manufacturer || '');
const port = process.argv[2] || process.env.SERIAL_PORT || '';
if (!port && !ports.some(p => (p.vendorId || '').toLowerCase() === '2e8a')) { console.log('\nNO PICO: no port with USB vendor 2e8a. Check the USB cable (data, not charge-only) and that the gb-link-usb firmware is flashed.'); process.exit(1); }

const lane = new HardwareLane({ port });
const hb = [];
let sawReady = false, began = null;
lane.on('error', (e) => console.log('error:', e.message));
lane.on('ready', () => { sawReady = true; console.log('READY: the Game Boy is polling (seedlab ROM idle)'); });
lane.on('down', (e) => console.log('down:', e.message));
lane.on('hello', (h) => console.log('hello frame:', h, '(the ROM just started)'));
lane.on('heartbeat', (h) => { hb.push(h.ppb / 1000); });
lane.on('begin', (b) => { began = b; console.log('begin frame: seed', b.seed.toString(16), 'piece', b.piece, 'traits', b.traits.join(',')); });
lane.on('phase', (p) => console.log('screen update', p.seq, 'phase', p.phase, 'rows', p.rows));
lane.on('fault', (f) => console.log('fault:', f.reason));

await new Promise(r => setTimeout(r, 6000));
if (process.env.DRAW === '1' && lane.ready) { console.log('sending test seed 12345678 as piece 0'); lane.draw(0x12345678, 0); }
await new Promise(r => setTimeout(r, process.env.DRAW === '1' ? 15000 : 6000));
const avg = hb.length ? hb.reduce((a, b) => a + b, 0) / hb.length : null;
console.log(`\nport ${lane.sp?.path || '-'} | Game Boy polling: ${sawReady ? 'yes' : 'NO'} | heartbeat: ${avg == null ? 'none' : avg.toFixed(2) + ' ppm (' + hb.length + ' readings; a DMG reads about -56)'}${process.env.DRAW === '1' ? ' | test draw began: ' + (began ? 'yes' : 'NO') : ''}`);
if (!sawReady) console.log('Not polling: is the Game Boy on, running slowhorizons.gb from the EverDrive, cable plugged in both ends, Pico powered BEFORE the Game Boy?');
process.exit(sawReady ? 0 : 2);
