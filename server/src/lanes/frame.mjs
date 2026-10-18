// Link frame helpers shared by the hardware lane and the simulated lane (tests, devnet).
const CRC_TAB = Array.from({ length: 256 }, (_, i) => { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; return c; });
export function crc16(bytes, c = 0xffff) { for (const b of bytes) c = ((c << 8) & 0xffff) ^ CRC_TAB[((c >> 8) ^ b) & 0xff]; return c; }
// Start frame PC -> Game Boy: $7E 'S' seed(4 LE) piece(2 LE) special(1) crc(2 LE), CRC over everything after $7E.
// special 0 = a normal piece, 1..10 = that 1/1 scene (the ROM sets gen_special before drawing).
export function startFrame(seed, piece = 0, special = 0) {
  const b = Buffer.alloc(11);
  b[0] = 0x7e; b[1] = 0x53; b.writeUInt32LE(seed >>> 0, 2); b.writeUInt16LE(piece & 0xffff, 6); b[8] = special & 0xff;
  b.writeUInt16LE(crc16(b.subarray(1, 9)), 9);
  return b;
}
