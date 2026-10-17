"""Emulator lane for the mint server: runs gb/seedlab.gb in PyBoy and reports what the ROM puts on screen.
This is a development and fallback lane. The server labels everything it draws "emulator", never "hardware".

stdin  (JSON lines): {"seed": 123, "speed": 1.0}    speed 1.0 = real Game Boy time, 0 = as fast as possible
stdout (JSON lines): {"type": "ready"}
                     {"type": "phase", "seq": 1, "phase": 1, "tiles": "<base64, 360 tiles x 16 bytes>"}
                     {"type": "done", "seed": 123, "frames": 25113}
"""
import base64, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from emu import ROM, symbol  # noqa: E402
from pyboy import PyBoy  # noqa: E402

FPS = 4194304 / 70224  # 59.73


def tiles(pb):
    return bytes(pb.memory[0x8000:0x8000 + 360 * 16])


def emit(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def main():
    mail, phase_now, phase_seq = symbol('_mail'), symbol('_phase_now'), symbol('_phase_seq')
    pb = PyBoy(str(ROM), window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    for _ in range(120):
        pb.tick()
    emit({'type': 'ready'})
    for line in sys.stdin:
        if not line.strip():
            continue
        job = json.loads(line)
        seed, speed = int(job['seed']) & 0xFFFFFFFF, float(job.get('speed', 1.0))
        for i in range(4):
            pb.memory[mail + i] = (seed >> (8 * i)) & 255
        pb.memory[mail + 5] = 1
        pb.memory[mail + 4] = 1
        seq, frames, t0 = pb.memory[phase_seq], 0, time.monotonic()
        while pb.memory[mail + 5]:
            pb.tick()
            frames += 1
            if pb.memory[phase_seq] != seq:
                seq = pb.memory[phase_seq]
                emit({'type': 'phase', 'seq': seq, 'phase': pb.memory[phase_now], 'tiles': base64.b64encode(tiles(pb)).decode()})
            if speed > 0 and frames % 30 == 0:
                ahead = frames / (FPS * speed) - (time.monotonic() - t0)
                if ahead > 0:
                    time.sleep(ahead)
        emit({'type': 'done', 'seed': seed, 'frames': frames})


if __name__ == '__main__':
    main()
