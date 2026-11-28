import json
import math
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]
TILE_W, LABEL_H, GAP, COLS, RADIUS = 640, 64, 24, 3, 14
TITLE_PX, SUB_PX = 36, 30


def font(size, bold, path):
    for p in ([path] if path else []) + FONT_CANDIDATES:
        try:
            f = ImageFont.truetype(p, size)
        except OSError:
            continue
        if bold:
            try:
                f.set_variation_by_name("Bold")
            except (OSError, AttributeError, ValueError):
                pass
        return f
    return ImageFont.load_default(size)


def main(spec_path, out_path):
    spec = json.load(open(spec_path))
    tiles, colors, font_path = spec["tiles"], spec["colors"], spec.get("font")
    title_f, sub_f = font(TITLE_PX, True, font_path), font(SUB_PX, False, font_path)
    aspect = max((t["crop"][3] - t["crop"][1]) / (t["crop"][2] - t["crop"][0]) for t in tiles)
    th = int(TILE_W * aspect)
    rows = math.ceil(len(tiles) / COLS)
    im = Image.new("RGB", (COLS * TILE_W + (COLS + 1) * GAP, rows * (th + LABEL_H) + (rows + 1) * GAP), colors["bg"])
    d = ImageDraw.Draw(im)
    for i, t in enumerate(tiles):
        r, c = divmod(i, COLS)
        x, y = GAP + c * (TILE_W + GAP), GAP + r * (th + LABEL_H + GAP)
        shot = Image.open(t["png"]).convert("RGB")
        x0, y0, x1, y1 = t["crop"]
        if x1 > shot.width or y1 > shot.height:
            sys.exit(f"{t['png']}: crop {t['crop']} is outside the {shot.width}x{shot.height} screenshot")
        tile = shot.crop((x0, y0, x1, y1)).resize((TILE_W, th), Image.LANCZOS)
        d.rounded_rectangle((x - 2, y - 2, x + TILE_W + 2, y + LABEL_H + th + 2), radius=RADIUS, fill=colors["surface"], outline=colors["edge"], width=2)
        d.text((x + 20, y + LABEL_H / 2), t["title"], font=title_f, fill=colors["accent"], anchor="lm")
        d.text((x + 34 + d.textlength(t["title"], font=title_f), y + LABEL_H / 2), t["sub"], font=sub_f, fill=colors["dim"], anchor="lm")
        im.paste(tile, (x, y + LABEL_H))
    im.save(out_path, optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python3 tests/hero.py <spec.json> <out.png>")
    main(sys.argv[1], sys.argv[2])
