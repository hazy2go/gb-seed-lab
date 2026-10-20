#!/usr/bin/env python3
# Pieces not yet minted: status, Arweave live state, minutes since upload, owner.
import json, time, os
s = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'state.json')))
now = time.time() * 1000
rows = [p for p in s['pieces'] if p['status'] != 'minted']
for p in rows:
    up = p.get('storedAt'); age = f"{(now-up)/60000:.0f}m" if up else '-'
    live = 'live' if p.get('arLive') else ('stored' if (p.get('ar') or {}).get('json') else '-')
    print(p['n'], p['status'], live, 'since upload', age, (p.get('owner') or p.get('wallet') or '')[:4], p.get('mintTx', '') and 'mintTx')
print('minted', sum(p['status'] == 'minted' for p in s['pieces']), 'of', len(s['pieces']))
