"""Scores many random seeds for art problems: big flat single-shade blobs, flat tiles, too few shades. Prints the worst."""
import subprocess, json, random, sys
import numpy as np
from collections import defaultdict
HOST = 'gen/gen_host'   # run from the repo root after make -C gen
def raw(s): return np.frombuffer(subprocess.run([HOST, 'raw', str(s)], capture_output=True).stdout, np.uint8).reshape(144, 160)
def traits(s): return json.loads(subprocess.run([HOST, 'traits', str(s)], capture_output=True).stdout)
def biggest_flat(px, shade):
    # largest 4-connected region of `shade` counting only "solid" pixels (all 4 neighbours the same shade)
    m = px == shade
    solid = m.copy(); solid[1:, :] &= m[:-1, :]; solid[:-1, :] &= m[1:, :]; solid[:, 1:] &= m[:, :-1]; solid[:, :-1] &= m[:, 1:]
    seen = np.zeros_like(solid); best = 0; bbox = None
    ys, xs = np.nonzero(solid)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        stack = [(y0, x0)]; seen[y0, x0] = True; n = 0; mny, mxy, mnx, mxx = y0, y0, x0, x0
        while stack:
            y, x = stack.pop(); n += 1
            mny, mxy, mnx, mxx = min(mny, y), max(mxy, y), min(mnx, x), max(mxx, x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a, b = y + dy, x + dx
                if 0 <= a < 144 and 0 <= b < 160 and solid[a, b] and not seen[a, b]: seen[a, b] = True; stack.append((a, b))
        if n > best: best, bbox = n, (mny, mxy, mnx, mxx)
    return best / (144 * 160), bbox
rnd = random.Random(42)
rows = []
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
for i in range(N):
    s = rnd.getrandbits(32)
    px = raw(s); t = traits(s)
    b3, bb3 = biggest_flat(px, 3); b0, _ = biggest_flat(px, 0)
    tiles = px.reshape(18, 8, 20, 8).transpose(0, 2, 1, 3).reshape(360, 64)
    flat = float(np.mean(tiles.min(1) == tiles.max(1)))
    share = np.bincount(px.ravel(), minlength=4) / px.size
    used = int((share > 0.03).sum())
    touches_bottom = bool(bb3 is not None and bb3[1] >= 140); bb3 = [int(v) for v in bb3] if bb3 else None
    rows.append(dict(seed=s, t=t, b3=b3, b0=b0, flat=flat, used=used, share=share.round(3).tolist(), bottom=touches_bottom, bbox=bb3))
json.dump(rows, open('/tmp/art_scan_rows.json', 'w'))
def key(r): t = r['t']; return f"{t['time']}|{t['terrain']}|{t['ground']}|{t['weather']}"
print('pieces', len(rows))
for name, f in [('black flat blob (not ground)', lambda r: r['b3'] if not r['bottom'] else 0), ('white flat blob', lambda r: r['b0']), ('flat tiles', lambda r: r['flat'])]:
    top = sorted(rows, key=f, reverse=True)[:12]
    print('\n==', name)
    for r in top: print(f"{r['seed']:>10}  {f(r):.3f}  used={r['used']} share={r['share']}  {key(r)}  sky={r['t']['sky']} extras={r['t']['extras']}")
print('\nshade count < 3:', sum(r['used'] < 3 for r in rows))
