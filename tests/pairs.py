import json
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]
BODY_H, GAP, HEAD_H, PAD, RADIUS, PAPER_MAX = 620, 28, 64, 22, 16, 0.75
TITLE_PX, SUB_PX, COLORS = 30, 24, 128


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


def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def panel(d, box, title, sub, colors, fonts):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=RADIUS, fill=colors["surface"], outline=colors["edge"], width=2)
    d.text((x0 + PAD, y0 + HEAD_H / 2), title, font=fonts[0], fill=colors["accent"], anchor="lm")
    d.text((x0 + PAD * 1.6 + d.textlength(title, font=fonts[0]), y0 + HEAD_H / 2), sub, font=fonts[1], fill=colors["dim"], anchor="lm")


def main(spec_path):
    spec = json.load(open(spec_path))
    colors, fonts = spec["colors"], (font(TITLE_PX, True, spec.get("font")), font(SUB_PX, False, spec.get("font")))
    frames = [fit(Image.open(f).convert("RGB"), BODY_H - 2 * PAD) for f in spec["frames"]]
    paper = fit(Image.open(spec["paper"]).convert("RGB"), BODY_H - 2 * PAD)
    cap = int(PAPER_MAX * max(f.width for f in frames))
    if paper.width > cap:
        paper = paper.resize((cap, round(paper.height * cap / paper.width)), Image.LANCZOS)
    lw, rw = paper.width + 2 * PAD, max(f.width for f in frames) + 2 * PAD
    W, H = lw + rw + 3 * GAP, HEAD_H + BODY_H + 2 * GAP
    base = Image.new("RGB", (W, H), colors["bg"])
    d = ImageDraw.Draw(base)
    left, right = (GAP, GAP, GAP + lw, H - GAP), (2 * GAP + lw, GAP, W - GAP, H - GAP)
    panel(d, left, "Paper", spec["paperLabel"], colors, fonts)
    panel(d, right, "ccn-sim", spec["guiLabel"], colors, fonts)
    base.paste(paper, (left[0] + PAD, GAP + HEAD_H + (BODY_H - 2 * PAD - paper.height) // 2 + PAD // 2))
    out = []
    for f in frames:
        im = base.copy()
        im.paste(f, (right[0] + PAD + (rw - 2 * PAD - f.width) // 2, GAP + HEAD_H + PAD // 2))
        out.append(im.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT))
    durations = [spec["frameMs"]] * (len(out) - 1) + [spec["holdMs"]]
    out[0].save(spec["out"], save_all=True, append_images=out[1:], duration=durations, loop=0, optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 tests/pairs.py <spec.json>")
    main(sys.argv[1])
