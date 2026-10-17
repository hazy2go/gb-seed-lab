"""Check gb/fastmath.s: run gb/test/mathtest.gb in PyBoy and compare every product, quotient and remainder with
Python (C semantics: truncating division, remainder with the dividend's sign).
  make -C gb test/mathtest.gb && .venv/bin/python tools/mathtest.py [batches]   (128 operand pairs per batch)
"""
import re, sys, struct
from pathlib import Path
from pyboy import PyBoy

ROOT = Path(__file__).resolve().parent.parent
GB = ROOT / 'gb' / 'test'
sym = {m.group(1): int(m.group(2), 16) for m in (re.match(r'DEF\s+(\S+)\s+0x([0-9A-Fa-f]+)', l) for l in (GB / 'mathtest.noi').read_text().splitlines()) if m}
M = 1 << 32
def s32(x): return x - M if x & 0x80000000 else x
def tdiv(a, b): q = abs(a) // abs(b); return q if (a < 0) == (b < 0) else -q

pb = PyBoy(str(GB / 'mathtest.gb'), window='null', sound_emulated=False); pb.set_emulation_speed(0)
for _ in range(300): pb.tick()   # past the boot logo and the ROM start (which clears RAM)
st = sym['_mt_state']
for i, b in enumerate(struct.pack('<I', 0x1234567)): pb.memory[st + i] = b
bad = n = 0
for batch in range(int(sys.argv[1]) if len(sys.argv) > 1 else 200):
    pb.memory[sym['_mt_done']] = 0; pb.memory[sym['_mt_go']] = 1
    while not pb.memory[sym['_mt_done']]: pb.tick()
    raw = bytes(pb.memory[sym['_mt_out'] + k] for k in range(128 * 28))
    for i in range(128):
        a, b, mul, du, mu, ds, ms = struct.unpack_from('<7I', raw, i * 28); n += 1
        sa, sb = s32(a), s32(b)
        want = ((a * b) % M, a // b, a % b, tdiv(sa, sb) % M, (sa - tdiv(sa, sb) * sb) % M)
        got = (mul, du, mu, ds, ms)
        if want != got:
            bad += 1
            if bad <= 10: print(f'a={a:#x} b={b:#x} got {[hex(x) for x in got]} want {[hex(x) for x in want]}')
print(f'{n} operand pairs, {bad} wrong')
sys.exit(1 if bad else 0)
