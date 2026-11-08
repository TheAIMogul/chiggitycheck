# Turns <photo>.lines.json (ruled lines read off a ruler by gpt-5.5) into row boxes, after snapping each line to the
# printed rule within +-14px (a ruled line crosses the whole table; handwriting does not). Table left/right come from
# the vision boxes. Writes "boxes" into <photo>.boxes.json (keeps "raw").
# usage: python3 scripts/snap-lines.py <photo.png> [overlay.png]
import sys, json, warnings
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
path = sys.argv[1]
B = json.load(open(path[:-4] + '.boxes.json')); raw = B.get('raw') or B['boxes']
L = json.load(open(path[:-4] + '.lines.json'))['lines']
im = Image.open(path).convert('L'); W, H = im.size
a = np.asarray(im, dtype=np.float32)
bg = np.asarray(im.filter(ImageFilter.BoxBlur(10)), dtype=np.float32)
dark = ((bg - a) > 9).astype(np.float32)
dark = np.maximum(dark, np.maximum(np.roll(dark, 1, 0), np.roll(dark, -1, 0)))
xl = float(np.median([b[0] for b in raw])) * W; xr = float(np.median([b[0] + b[2] for b in raw])) * W
cols = np.arange(int(xl) + 12, int(xr) - 12, 3)
def cover(yl, yr):
    ys = np.clip(np.round(yl + (yr - yl) * (cols - xl) / (xr - xl)).astype(int), 0, H - 1)
    return dark[ys, cols].mean()
snapped, hits = [], 0
for l in L:
    best = (cover(l['yl'], l['yr']), l['yl'], l['yr'])
    for dl in range(-14, 15):
        for dr in range(-14, 15, 2):
            c = cover(l['yl'] + dl, l['yr'] + dl + dr * 0.5)
            if c > best[0]: best = (c, l['yl'] + dl, l['yr'] + dl + dr * 0.5)
    if best[0] > 0.4: hits += 1; snapped.append(best[1:])
    else: snapped.append((l['yl'], l['yr']))
out = []
for k in range(len(snapped) - 1):
    (tl, tr), (bl, br) = snapped[k], snapped[k + 1]
    lo, hi = min(tl, tr), max(bl, br); p = (hi - lo) * 0.05
    out.append([round(xl / W, 4), round((lo - p) / H, 4), round((xr - xl) / W, 4), round((hi - lo + 2 * p) / H, 4)])
B['raw'] = raw; B['boxes'] = out; B['lines_snapped'] = hits; B['lines_total'] = len(L)
json.dump(B, open(path[:-4] + '.boxes.json', 'w'))
if len(sys.argv) > 2:
    o = Image.open(path).convert('RGB'); d = ImageDraw.Draw(o)
    for i, bx in enumerate(out): d.rectangle([bx[0]*W, bx[1]*H, (bx[0]+bx[2])*W, (bx[1]+bx[3])*H], outline=(255, 40, 40) if i % 2 == 0 else (30, 120, 255), width=3)
    for (yl, yr) in snapped: d.line([(xl, yl), (xr, yr)], fill=(0, 170, 0), width=2)
    o.save(sys.argv[2])
print(json.dumps({'snapped': hits, 'of': len(L), 'rows': len(out)}))
