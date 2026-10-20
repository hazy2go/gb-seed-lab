#!/usr/bin/env python3
# Mint health snapshot for the 10-min watch: changes since the last run (state in /tmp), plus anything that looks wrong.
# Prints "OK quiet" lines when nothing needs attention; lines starting "ISSUE" need a look.
import json, os, time, subprocess, urllib.request
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOG = os.path.expanduser('~/Library/Logs/slowhorizons/server.log')
MEM = '/tmp/slowhorizons-health.json'
now = time.time()
last = json.load(open(MEM)) if os.path.exists(MEM) else {'at': now - 600, 'minted': 0}
since = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(last['at']))
s = json.load(open(os.path.join(D, 'data', 'state.json')))
pieces = s['pieces']
minted = sum(p['status'] == 'minted' for p in pieces)
out, issues = [], []
out.append(f"sold {len(pieces)}/2000, minted {minted} (+{minted - last.get('minted', 0)} since last), queue {len(pieces) - minted}")
by = {}
for p in pieces:
    if p['status'] != 'minted': by[p['status']] = by.get(p['status'], 0) + 1
    up = p.get('storedAt')
    if p['status'] in ('drawn', 'minting') and up and (now * 1000 - up) > 20 * 60000:
        issues.append(f"No. {p['n']} {p['status']} {((now*1000-up)/60000):.0f} min after upload, not minted")
    if p['status'] == 'failed': issues.append(f"No. {p['n']} FAILED")
out.append('waiting: ' + (', '.join(f'{k} {v}' for k, v in by.items()) or 'none'))
# server alive
r = subprocess.run(['launchctl', 'list'], capture_output=True, text=True).stdout
line = next((l for l in r.splitlines() if 'com.slowhorizons.server' in l), '')
if not line or line.split()[0] == '-': issues.append('server process NOT running')
# log since last run
new = [l.rstrip() for l in open(LOG, errors='replace') if l[:2] == '20' and l[:19] >= since]   # timestamped lines only
for l in new:
    if 'ALERT' in l or 'mint send' in l or 'failed' in l.lower(): issues.append('log: ' + l[25:200])
exp = sum('expired rebuilding' in l for l in new)
if exp: out.append(f'{exp} mint(s) expired and were rebuilt (normal under load)')
# activity: page errors / refused submits since last run
errs = {}
for l in open(os.path.join(D, 'data', 'activity.jsonl'), errors='replace'):
    if l[7:26] < since: continue
    try: e = json.loads(l)
    except Exception: continue
    if e['kind'] in ('page_error', 'submit_refused', 'error'):
        k = (e['kind'], (e.get('msg') or e.get('reason') or '')[:110])
        errs[k] = errs.get(k, 0) + 1
for (k, m), c in errs.items(): out.append(f'{k} x{c}: {m}')
# minting wallet balance
try:
    req = urllib.request.Request('https://api.mainnet-beta.solana.com', json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'getBalance', 'params': ['971nCH2YFewsPjmeEPY7KohkdgWBpxYoaQE7cNoadp9R']}).encode(), {'content-type': 'application/json'})
    bal = json.load(urllib.request.urlopen(req, timeout=15))['result']['value'] / 1e9
    out.append(f'minting wallet {bal:.4f} SOL (~{int(bal/0.000095)} mints)')
    if bal < 0.1: issues.append(f'minting wallet low: {bal:.4f} SOL')
except Exception as e: out.append(f'balance check failed: {e}')
# Turbo credits for Arweave uploads (charged per file since 2026-10-20 ~22:54 JST); low = top up 0.1 SOL (Hazy)
TURBO_LOW = 40_000_000_000   # winc, ~15-30 pieces
try:
    out_t = subprocess.run(['node', 'scripts/fund-turbo.mjs', 'balance'], cwd=D, capture_output=True, text=True, timeout=60).stdout
    w = int(json.loads(out_t.split('turbo ', 1)[1].strip())['winc'])
    out.append(f'turbo credits {w/1e9:.1f}B winc')
    if w < TURBO_LOW: issues.append(f'TURBO_LOW {w/1e9:.1f}B winc: top up (node scripts/fund-turbo.mjs send 100000000 && node scripts/fund-turbo.mjs topup 99000000)')
except Exception as e: out.append(f'turbo balance check failed: {e}')
if any('Arweave upload failed' in l for l in new): issues.append('UPLOAD_FAILED: check the log; if it says Status 402 (payment required) the credits are out: TURBO_LOW, top up now')
json.dump({'at': now, 'minted': minted}, open(MEM, 'w'))
print('\n'.join(out)); print('\n'.join('ISSUE ' + i for i in issues) if issues else 'NO ISSUES')
