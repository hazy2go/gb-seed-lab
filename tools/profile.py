"""Statistical profile of seedlab.gb in PyBoy: samples the program counter once per frame while a seed draws
and maps it to the function it falls in (GBDK .noi symbols, banked ones as 0xBBAAAA).
  .venv/bin/python tools/profile.py 1 5 7
"""
import collections, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from emu import ROM, ROOT, symbol  # noqa: E402
from pyboy import PyBoy  # noqa: E402

syms = []
for line in (ROOT / 'gb' / 'seedlab.noi').read_text().splitlines():
    m = re.match(r'DEF\s+(\S+)\s+0x([0-9A-Fa-f]+)', line)
    if m and not m.group(1).startswith(('l_', 's_', 'b_', '___bank')) and '$' not in m.group(1):
        syms.append((int(m.group(2), 16), m.group(1)))
syms.sort()

def name(full):
    lo, hi, best = 0, len(syms) - 1, '?'
    while lo <= hi:
        mid = (lo + hi) // 2
        if syms[mid][0] <= full: best = syms[mid][1]; lo = mid + 1
        else: hi = mid - 1
    return best

def main():
    mail, bank = symbol('_mail'), symbol('__current_bank')
    pb = PyBoy(str(ROM), window='null', sound_emulated=False); pb.set_emulation_speed(0)
    for _ in range(120): pb.tick()
    hist, total = collections.Counter(), 0
    callers = collections.Counter()
    for s in map(int, sys.argv[1:] or ['1']):
        for i in range(4): pb.memory[mail + i] = (s >> (8 * i)) & 255
        pb.memory[mail + 5] = 1; pb.memory[mail + 4] = 1
        while pb.memory[mail + 5]:
            pb.tick(); total += 1
            pc = pb.register_file.PC
            full = pc if pc < 0x4000 else (pb.memory[bank] << 16) | pc
            fn = name(full); hist[fn] += 1
            if fn.startswith('__'):   # math helper: find the first stack word that points into our code
                sp = pb.register_file.SP
                for k in range(0, 16, 2):
                    ra = pb.memory[sp + k] | (pb.memory[sp + k + 1] << 8)
                    if 0x150 <= ra < 0x8000:
                        full2 = ra if ra < 0x4000 else (pb.memory[bank] << 16) | ra
                        c = name(full2)
                        if not c.startswith('__'): callers[(fn, c, hex(full2))] += 1; break
    print(f'{total} frames ({total / 59.73:.0f} s of Game Boy time)')
    for fn, n in hist.most_common(30): print(f'{100 * n / total:5.1f}%  {fn}')
    print('--- callers of math helpers (top 25)')
    for (fn, c, a), n in callers.most_common(25): print(f'{100 * n / total:5.1f}%  {fn:12s} <- {c} @ {a}')


if __name__ == '__main__':
    main()
