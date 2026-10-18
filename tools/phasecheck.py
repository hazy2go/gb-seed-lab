"""Every screen during a drawing, not only the last one: run seedlab.gb in PyBoy and after each phase compare the
screen with the reference build's screen for that phase (tools/phases.mjs). Live viewers see these screens.
  .venv/bin/python tools/phasecheck.py 1 2 3
"""
import subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from emu import ROM, ROOT, symbol, read_shades  # noqa: E402
from pyboy import PyBoy  # noqa: E402

def main():
    seeds = sys.argv[1:] or ['1']   # numbers, or sp:<id> for a 1/1 scene
    mail = symbol('_mail')
    pb = PyBoy(str(ROM), window='null', sound_emulated=False); pb.set_emulation_speed(0)
    shots = []
    pb.hook_register(0, symbol('_gen_phase'), lambda _: shots.append(read_shades(pb)), None)
    for _ in range(120): pb.tick()
    bad = 0
    for s in seeds:
        want = subprocess.run(['node', str(ROOT / 'tools' / 'phases.mjs'), s], capture_output=True, check=True).stdout
        sp = int(s[3:]) if s.startswith('sp:') else 0; s = 0 if sp else int(s, 0)
        frames = [want[i:i + 23040] for i in range(0, len(want), 23040)]
        for i in range(4): pb.memory[mail + i] = (s >> (8 * i)) & 255
        pb.memory[mail + 9] = sp
        pb.memory[mail + 5] = 1; pb.memory[mail + 4] = 1
        got = []
        while pb.memory[mail + 5]: pb.tick()
        got = shots[1:] + [read_shades(pb)]   # at each gen_phase entry the screen shows the phase before; then the last one
        shots.clear()
        diffs = [sum(1 for a, b in zip(g, w) if a != b) for g, w in zip(got, frames)]
        ok = len(got) == len(frames) and not any(diffs)
        bad += not ok
        print(f'{"1/1 #" + str(sp) if sp else "seed " + str(s)}: {len(got)} screens (reference {len(frames)}), pixels differing per screen {diffs}{"" if ok else "  FAIL"}')
    pb.stop(save=False)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
