#!/usr/bin/env python3
"""Freeze the Slow Horizons gallery into static files, so the gallery runs without the mint server.

    python3 web/tools/freeze.py            (needs Pillow for the atlas)

Writes, next to the page:
  data/pieces.json      every finished piece: number, seed, traits, timings, heartbeat, owner at mint, Arweave files
  data/atlas.png        every piece's original 160x144 image, in piece order, ATLAS_COLS per row
  data/replays/N.json   the drawing replay of each piece (the tiles the Game Boy sent, as the mint page replays them)
Sources: the mint server's public API (gallery, 1x images, replays) and each piece's Arweave metadata (file links).
Safe to re-run: replays and Arweave links already frozen are kept, everything else is refreshed."""
import concurrent.futures as cf
import io, json, os, sys, time, urllib.error, urllib.request

API = 'https://api.gameboylabs.xyz'
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(WEB, 'data')
ATLAS_COLS = 32
UA = {'User-Agent': 'slow-horizons-freeze/1'}

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
def get(url, tries=6, head=False):
    for k in range(tries):
        try:
            h = dict(UA, Range='bytes=0-31') if head else UA
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if k == tries - 1 or e.code == 404: raise
            time.sleep((8 if e.code == 429 else 1.5) * (k + 1))     # be gentle with the mint server
        except Exception:
            if k == tries - 1: raise
            time.sleep(1.5 * (k + 1))

def main():
    os.makedirs(os.path.join(OUT, 'replays'), exist_ok=True)
    old = {}
    try: old = {p['n']: p for p in json.load(open(os.path.join(OUT, 'pieces.json')))['pieces']}
    except Exception: pass
    try: old.update({int(k): {'ar': v} for k, v in json.load(open(os.path.join(OUT, '.ar-cache.json'))).items()})
    except Exception: pass
    # 1. the gallery, every page
    pieces, off = {}, 0
    while True:
        g = json.loads(get(f'{API}/api/gallery?limit=60&offset={off}'))
        if not g.get('pieces'): break
        for p in g['pieces']: pieces[p['n']] = p
        off += 60
    done = [pieces[n] for n in sorted(pieces) if pieces[n].get('image') and pieces[n].get('drawEnd')]
    print(len(done), 'finished pieces')
    # 2. Arweave file links from each piece's metadata (image 960, hires 1920, 1x 160), kept once known
    def arfiles(p):
        o = old.get(p['n'], {}).get('ar')
        if o: return p['n'], o
        if not p.get('arweave'): return p['n'], None
        try: m = json.loads(get(p['arweave']))
        except Exception as e: print('arweave metadata not reachable yet for', p['n'], e); return p['n'], None
        files = {}
        for f in m.get('properties', {}).get('files', []):
            u = f.get('uri', '')
            files.setdefault('list', []).append(u)
        lst = files.get('list', [])
        # the metadata lists image (960), hires (1920), 1x (160) in that order; check sizes from the PNG header
        out = {'meta': p['arweave']}
        for u in lst:
            try: head = get(u, head=True)[:24]
            except Exception as e: print('arweave file not reachable yet', p['n'], u, e); return p['n'], None
            w = int.from_bytes(head[16:20], 'big')
            out[{960: 'image', 1920: 'hires', 160: 'x1'}.get(w, f'w{w}')] = u
        return p['n'], out
    with cf.ThreadPoolExecutor(3) as ex:
        ar = dict(ex.map(arfiles, done))
    json.dump({k: v for k, v in ar.items() if v}, open(os.path.join(OUT, '.ar-cache.json'), 'w'))
    # 3. replays (kept once frozen)
    def replay(p):
        f = os.path.join(OUT, 'replays', f"{p['n']}.json")
        if os.path.exists(f) and os.path.getsize(f) > 100: return p['n'], True
        try:
            b = get(f"{API}/pieces/{p['n']}.replay.json")
            json.loads(b)
            open(f, 'wb').write(b); return p['n'], True
        except Exception as e:
            print('no replay for', p['n'], e); return p['n'], False
    with cf.ThreadPoolExecutor(2) as ex:
        rep = dict(ex.map(replay, done))
    # 4. the atlas of 1x images
    from PIL import Image
    os.makedirs(os.path.join(CACHE, 'x1'), exist_ok=True)
    def x1(p):     # the original from Arweave when known, else the mint server; cached on disk
        f = os.path.join(CACHE, 'x1', f"{p['n']}.png")
        if not os.path.exists(f):
            u = (ar.get(p['n']) or {}).get('x1') or f"{API}/pieces/{p['n']}.1x.png"
            open(f, 'wb').write(get(u))
        return p['n'], Image.open(f).convert('RGB')
    with cf.ThreadPoolExecutor(3) as ex:
        ims = dict(ex.map(x1, done))
    rows = (len(done) + ATLAS_COLS - 1) // ATLAS_COLS
    atlas = Image.new('RGB', (ATLAS_COLS * 160, rows * 144), (245, 238, 222))
    for i, p in enumerate(done):
        im = ims[p['n']]
        assert im.size == (160, 144), (p['n'], im.size)
        atlas.paste(im, ((i % ATLAS_COLS) * 160, (i // ATLAS_COLS) * 144))
    atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
    # 5. pieces.json: what the gallery needs, nothing private (wallet addresses are public on chain)
    keep = ('n', 'wallet', 'seed', 'seedHex', 'traits', 'description', 'title', 'special', 'drawStart', 'drawEnd', 'frames',
            'heartbeat', 'match', 'seedBlock', 'seedBlockhash', 'leftover')
    # pieces whose Arweave files are not reachable: keep their files here, from the mint server
    os.makedirs(os.path.join(OUT, 'files'), exist_ok=True)
    for p in done:
        if ar.get(p['n']): continue
        loc = {}
        for kind, suffix in (('hires', '.hires.png'), ('x1', '.1x.png'), ('image', '.png')):
            f = os.path.join(OUT, 'files', f"{p['n']}{suffix}")
            try:
                if not os.path.exists(f): open(f, 'wb').write(get(f"{API}/pieces/{p['n']}{suffix}"))
                loc[kind] = f"data/files/{p['n']}{suffix}"
            except Exception as e: print('no local copy for', p['n'], kind, e)
        if loc: ar[p['n']] = dict(loc, local=True)
        print('kept local files for', p['n'], sorted(loc))
    out = []
    for i, p in enumerate(done):
        q = {k: p.get(k) for k in keep}
        q['i'] = i
        q['mint'] = (p.get('mint') or {}).get('assetId')
        q['ar'] = ar.get(p['n'])
        q['replay'] = bool(rep.get(p['n']))
        out.append(q)
    meta = {'frozenAt': int(time.time() * 1000), 'count': len(out), 'atlasCols': ATLAS_COLS,
            'wallets': len({p['wallet'] for p in out}), 'network': 'mainnet-beta'}
    json.dump({'meta': meta, 'pieces': out}, open(os.path.join(OUT, 'pieces.json'), 'w'), separators=(',', ':'))
    print('wrote', len(out), 'pieces;', sum(rep.values()), 'replays;', sum(1 for v in ar.values() if v), 'arweave links;',
          'atlas', atlas.size)

if __name__ == '__main__':
    main()
