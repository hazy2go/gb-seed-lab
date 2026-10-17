"""Run seedlab.gb in PyBoy (headless): give it seeds through the mailbox, read the finished tiles from VRAM
and compare them with the native build of the same C source.
  .venv/bin/python tools/emu.py 1 2 3          check seeds
  .venv/bin/python tools/emu.py --png out.png 7  also save the emulator screen
"""
import re, subprocess, sys, time
from pathlib import Path
from pyboy import PyBoy

ROOT = Path(__file__).resolve().parent.parent
ROM = ROOT / 'gb' / 'seedlab.gb'
HOST = ROOT / 'gen' / 'gen_host'

def symbol(name):
    for line in (ROOT / 'gb' / 'seedlab.noi').read_text().splitlines():
        m = re.match(r'DEF\s+(\S+)\s+0x([0-9A-Fa-f]+)', line)
        if m and m.group(1) == name:
            return int(m.group(2), 16)
    raise KeyError(name)

def tile_addr(n):
    return 0x8000 + n * 16 if n < 256 else 0x9000 + (n - 256) * 16

def read_shades(pb):
    px = bytearray(160 * 144)
    for n in range(360):
        a = tile_addr(n); tx, ty = n % 20, n // 20
        for r in range(8):
            lo, hi = pb.memory[a + r * 2], pb.memory[a + r * 2 + 1]
            for c in range(8):
                px[(ty * 8 + r) * 160 + tx * 8 + c] = ((lo >> (7 - c)) & 1) | (((hi >> (7 - c)) & 1) << 1)
    return bytes(px)

def main():
    args = sys.argv[1:]; png = None
    if '--png' in args: i = args.index('--png'); png = args[i + 1]; del args[i:i + 2]
    seeds = [int(a, 0) for a in args] or [1]
    mail = symbol('_mail')
    pb = PyBoy(str(ROM), window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    for _ in range(120): pb.tick()
    bad = 0
    for s in seeds:
        for i in range(4): pb.memory[mail + i] = (s >> (8 * i)) & 255
        pb.memory[mail + 5] = 1
        pb.memory[mail + 4] = 1
        t0 = time.time(); n = 0
        while pb.memory[mail + 5]:
            pb.tick(); n += 1
            if n > 60 * 60 * 30: print('timeout'); return 1
        got = read_shades(pb)
        want = subprocess.run([str(HOST), 'raw', str(s)], capture_output=True).stdout
        diff = sum(1 for a, b in zip(got, want) if a != b)
        print(f'seed {s}: {n} frames = {n / 59.73:.1f} s on a Game Boy, {diff} pixels differ ({time.time() - t0:.1f} s emulated)')
        bad += diff != 0
        if png: pb.screen.image.save(png)
    pb.stop(save=False)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
