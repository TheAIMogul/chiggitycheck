# Draws a pixel ruler (ticks every 10px, labels every 50px) down both margins of a photo, for the vision model to read.
# usage: python3 scripts/ruler.py <in.png> <out.png>
import sys
from PIL import Image, ImageDraw, ImageFont
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size
pad = 70
o = Image.new('RGB', (W + 2 * pad, H), 'white'); o.paste(im, (pad, 0)); d = ImageDraw.Draw(o)
try: f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
except Exception: f = ImageFont.load_default()
for y in range(0, H, 10):
    L = 22 if y % 50 == 0 else 10
    d.line([(pad - L, y), (pad, y)], fill=(220, 0, 0), width=2); d.line([(W + pad, y), (W + pad + L, y)], fill=(220, 0, 0), width=2)
    if y % 50 == 0 and y > 0:
        d.text((2, y - 10), str(y), fill=(220, 0, 0), font=f); d.text((W + pad + 26, y - 10), str(y), fill=(220, 0, 0), font=f)
o.save(sys.argv[2])
