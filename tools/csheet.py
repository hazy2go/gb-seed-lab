# Contact sheet from the native C build: python3 tools/csheet.py out.png seeds...
import subprocess, sys
from PIL import Image
args = sys.argv[1:]; out = args.pop(0)
seeds = []
for a in args:
    if '-' in a: lo, hi = map(int, a.split('-')); seeds += range(lo, hi + 1)
    else: seeds.append(int(a))
h = 144; cols = 4; S = 2; G = 4
rows = (len(seeds) + cols - 1) // cols
sheet = Image.new('RGB', ((160 * S + G) * cols - G, (h * S + G) * rows - G), 'white')
for k, s in enumerate(seeds):
    ppm = subprocess.run(['gen/gen_host', 'ppm', str(s)], capture_output=True).stdout
    im = Image.frombytes('RGB', (160, h), ppm[ppm.index(b'255\n') + 4:]).resize((160 * S, h * S), Image.NEAREST)
    sheet.paste(im, ((k % cols) * (160 * S + G), (k // cols) * (h * S + G)))
sheet.save(out)
