"""Counts calls into the SDCC math helpers by exact caller (PyBoy entry hooks). Usage: .venv/bin/python tools/hooks.py <seed>"""
import collections, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from profile import name, symbol, ROM
from pyboy import PyBoy
pb = PyBoy(str(ROM), window='null', sound_emulated=False); pb.set_emulation_speed(0)
bank = symbol('__current_bank'); mail = symbol('_mail')
calls = collections.Counter()
def hook(fn):
    sp = pb.register_file.SP
    ra = pb.memory[sp] | (pb.memory[sp + 1] << 8)
    full = ra if ra < 0x4000 else (pb.memory[bank] << 16) | ra
    calls[(fn, name(full), hex(full))] += 1
for fn in ['__moduint', '__divuint', '__divsint', '__modsint', '__divslong', '__divulong', '__modslong', '__modulong', '__divuchar', '__divschar', '__mullong']:
    try: pb.hook_register(0, symbol(fn), hook, fn)
    except Exception as e: print('no hook', fn, e)
for _ in range(120): pb.tick()
s = int(sys.argv[1]) if len(sys.argv) > 1 else 1
for i in range(4): pb.memory[mail + i] = (s >> (8 * i)) & 255
pb.memory[mail + 5] = 1; pb.memory[mail + 4] = 1
while pb.memory[mail + 5]: pb.tick()
for (fn, c, a), n in calls.most_common(25): print(f'{n:8d}  {fn:12s} <- {c} @ {a}')
