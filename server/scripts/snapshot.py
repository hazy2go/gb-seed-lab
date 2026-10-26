# Holder snapshot of the Slow Horizons collection via DAS (Hazy 2026-10-26, for the holder airdrop).
# Writes data/snapshots/holders-<utc>.{json,csv}: one row per wallet with piece count, 1/1 count and piece numbers.
import json, csv, re, sys, time, urllib.request, os
env = dict(l.strip().split('=', 1) for l in open('.env') if '=' in l and not l.startswith('#'))
RPC, COLL = env['RPC_URL'], env['COLLECTION']
def rpc(method, params):
    r = urllib.request.Request(RPC, json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode(), {'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=60))['result']
slot = rpc('getSlot', [{'commitment': 'finalized'}])
items, page = [], 1
while True:
    r = rpc('getAssetsByGroup', {'groupKey': 'collection', 'groupValue': COLL, 'page': page, 'limit': 1000})
    items += r['items']
    if len(r['items']) < 1000: break
    page += 1
holders = {}
for a in items:
    if a.get('burnt'): continue
    name = a['content']['metadata']['name']; n = int(re.search(r'#(\d+)', name).group(1))
    one = any(t.get('trait_type') == 'Edition' and t.get('value') == '1/1' for t in a['content']['metadata'].get('attributes', []))
    o = a['ownership']['owner']
    h = holders.setdefault(o, {'wallet': o, 'pieces': 0, 'one_of_ones': 0, 'numbers': [], 'delegated': 0})
    h['pieces'] += 1; h['one_of_ones'] += one; h['numbers'].append(n); h['delegated'] += bool(a['ownership'].get('delegated'))
rows = sorted(holders.values(), key=lambda h: (-h['pieces'], h['wallet']))
for h in rows: h['numbers'].sort()
stamp = time.strftime('%Y-%m-%dT%H%MZ', time.gmtime())
meta = {'collection': COLL, 'slot': slot, 'taken_utc': stamp, 'assets': len(items), 'holders': len(rows)}
json.dump({**meta, 'holders': rows}, open(f'data/snapshots/holders-{stamp}.json', 'w'), indent=1)
with open(f'data/snapshots/holders-{stamp}.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['wallet', 'pieces', 'one_of_ones', 'listed_or_delegated', 'piece_numbers'])
    for h in rows: w.writerow([h['wallet'], h['pieces'], h['one_of_ones'], h['delegated'], ' '.join(map(str, h['numbers']))])
print(json.dumps(meta)); print(f'data/snapshots/holders-{stamp}.csv')
