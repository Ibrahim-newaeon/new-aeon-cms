# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow"]
# ///
import glob
import sys

from PIL import Image, ImageDraw

out, folder = sys.argv[1], sys.argv[2]
bpm = float(sys.argv[3]) if len(sys.argv) > 3 else 0
files = sorted(glob.glob(folder + "/t*.png"), key=lambda f: float(f.rsplit("/t", 1)[1][:-4]))
if not files:
    sys.exit(f"no t*.png frames in {folder}")
cols, th = 6, 300
first = Image.open(files[0])
tw = round(th * first.width / first.height)
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (tw + 8), rows * (th + 26)), (255, 255, 255))
draw = ImageDraw.Draw(sheet)
for k, f in enumerate(files):
    t = float(f.rsplit("/t", 1)[1][:-4])
    x, y = (k % cols) * (tw + 8), (k // cols) * (th + 26)
    sheet.paste(Image.open(f).convert("RGB").resize((tw, th)), (x, y + 22))
    label = f"{t:.2f}s" + (f"  beat {int(t / (60 / bpm)) + 1}" if bpm else "")
    draw.text((x + 3, y + 5), label, fill=(20, 26, 21))
sheet.save(out)
print(out, sheet.size)
