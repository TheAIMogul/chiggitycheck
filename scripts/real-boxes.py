# Finds the table rows on a real sheet photo and returns one normalized [x,y,w,h] box per filled row.
# A printed ruled line crosses the whole table; handwriting never does. So: search the sheet's tilt, project the
# dark pixels along that tilt across the full table width, keep only lines that cover most of the width, take the
# thickest one (the rule under NAME / HERE) as the header, and fit the row lines below it.
# usage: python3 scripts/real-boxes.py <photo.png> <rows> [overlay.png]
import sys, json, warnings
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
path, nrows = sys.argv[1], int(sys.argv[2])
im = Image.open(path).convert('L'); W, H = im.size
a = np.asarray(im, dtype=np.float32)
bg = np.asarray(im.filter(ImageFilter.BoxBlur(10)), dtype=np.float32)
dark = ((bg - a) > 9).astype(np.float32)
# also count a pixel if a neighbour above/below is dark (lines are 1-3px and slightly wavy)
dark = np.maximum(dark, np.maximum(np.roll(dark, 1, 0), np.roll(dark, -1, 0)))
X0, X1 = 0.20, 0.80
cols = np.arange(int(X0*W), int(X1*W), 3)
cx = W / 2
def project(slope):
    shift = np.round(slope * (cols - cx)).astype(int)
    ys = np.arange(H)[:, None] + shift[None, :]
    ys = np.clip(ys, 0, H-1)
    return dark[ys, cols[None, :]].mean(axis=1)   # value at y = coverage of the line through (cx, y)
best = max((np.square(project(s)).sum(), s) for s in np.linspace(-0.06, 0.06, 49))
slope = best[1]
prof = project(slope)
lines = []
for y in range(2, H-2):
    if prof[y] > 0.55 and prof[y] >= prof[y-1] and prof[y] >= prof[y+1]:
        if lines and y - lines[-1] < 14:
            if prof[y] > prof[lines[-1]]: lines[-1] = y
            continue
        lines.append(y)
thick = lambda y: prof[max(0, y-4):y+5].sum()
upper = [y for y in lines if 0.15*H < y < 0.6*H]
best = None
for head in upper:
    body = [y for y in lines if y > head + 10]
    gaps = [d for d in np.diff([head] + body) if 25 < d < 95]
    if len(gaps) < 3: continue
    g = float(np.median(gaps))
    pts = [(0, head)]
    for y in body:
        k = (y - head) / g
        if abs(k - round(k)) < 0.22 and 1 <= round(k) <= 24 and all(round(k) != q for q, _ in pts): pts.append((round(k), y))
    score = (len(pts) >= 6, round(thick(head), 1), len(pts))
    if best is None or score > best[0]: best = (score, pts)
assert best, f'no table found, lines={lines}'
pts = best[1]
ks = np.array([p[0] for p in pts], float); ys = np.array([p[1] for p in pts], float)
f = np.poly1d(np.polyfit(ks, ys, 2 if len(pts) >= 8 else 1))
lin = np.poly1d(np.polyfit(ks, ys, 1))
if max(abs(f(k) - lin(k)) for k in range(25)) > 10: f = lin
for k in range(nrows): assert 22 < f(k+1) - f(k) < 100, f'bad spacing {k}'
colp = dark[int(f(0)):int(f(nrows)), :].mean(axis=0)
xs = [x for x in range(W) if colp[x] > 0.5]
left = min([x for x in xs if W*0.04 < x < W*0.3], default=int(W*0.1))
right = min(max([x for x in xs if W*0.65 < x < W*0.95], default=int(W*0.86)) + int(W*0.06), int(W*0.97))
def y_at(k, x): return f(k) + slope * (x - cx)
boxes = []
for k in range(nrows):
    y0 = min(y_at(k, left), y_at(k, right)); y1 = max(y_at(k+1, left), y_at(k+1, right))
    pad = (f(k+1) - f(k)) * 0.12
    boxes.append([round(left/W, 4), round((y0-pad)/H, 4), round((right-left)/W, 4), round((y1-y0+2*pad)/H, 4)])
if len(sys.argv) > 3:
    o = Image.open(path).convert('RGB'); d = ImageDraw.Draw(o)
    for i, b in enumerate(boxes): d.rectangle([b[0]*W, b[1]*H, (b[0]+b[2])*W, (b[1]+b[3])*H], outline=(255, 40, 40) if i % 2 == 0 else (30, 120, 255), width=3)
    o.save(sys.argv[3])
print(json.dumps({'w': W, 'h': H, 'slope': round(float(slope), 4), 'lines': len(pts), 'boxes': boxes}))
