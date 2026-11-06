"""Make the Life2Launch logo for a state: the LIFE2LAUNCH wordmark with the state's name centered under it.

    python3 branding/scripts/state_logo.py Oregon            -> branding/states/l2l-oregon.png (white)
    python3 branding/scripts/state_logo.py "North Carolina" --color "#13277a"

The state line is set like the wordmark (same heavy weight, tight spacing, right under it), never taller or wider; long names
lose letter spacing first, then size. Needs Pillow and a bold geometric sans (Inter Display Bold by default).
"""

import argparse
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORDMARK = ROOT / "life2launch-wordmark.png"
FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
CAP_RATIO = 1.0  # state capitals / wordmark capitals (never more)
GAP_RATIO = 0.07  # space between the lines / wordmark capitals: the two lines all but touch
TRACKING = -0.02  # letter spacing, as a share of the state's cap height: tight, like the wordmark
MAX_WIDTH = 1.0  # the state line never runs wider than the wordmark


def _line(text: str, font: ImageFont.FreeTypeFont, tracking: float) -> tuple[int, int, int]:
    """Width of the tracked line, and the top and bottom of its capitals."""
    widths = [font.getlength(char) for char in text]
    top, bottom = font.getbbox("H")[1], font.getbbox("H")[3]
    return round(sum(widths) + tracking * (len(text) - 1)), top, bottom


def make(state: str, color: str, font_path: str, cap_ratio: float = CAP_RATIO) -> Image.Image:
    mark = Image.open(WORDMARK).convert("RGBA")
    mark = mark.crop(mark.getbbox())
    w, h = mark.size
    text = state.upper()
    cap = h * min(1.0, cap_ratio)
    size = cap / 0.727  # Inter's capitals are about 0.727 em
    while True:
        font = ImageFont.truetype(font_path, round(size))
        cap_px = font.getbbox("H")[3] - font.getbbox("H")[1]
        tracking = cap_px * TRACKING
        width, top, bottom = _line(text, font, tracking)
        # Too wide: tighten the spacing, then shrink the letters.
        while width > w * MAX_WIDTH and tracking > -cap_px * 0.06:
            tracking -= cap_px * 0.01
            width, top, bottom = _line(text, font, tracking)
        if width <= w * MAX_WIDTH or size < 8:
            break
        size *= 0.95
    gap = round(h * GAP_RATIO)
    out = Image.new("RGBA", (w, h + gap + (bottom - top)), (0, 0, 0, 0))
    paint = ImageColor.getrgb(color)
    tinted = Image.new("RGBA", mark.size, paint + (255,))
    tinted.putalpha(mark.getchannel("A"))
    out.alpha_composite(tinted, (0, 0))
    draw = ImageDraw.Draw(out)
    x = (w - width) / 2
    for char in text:
        draw.text((x, h + gap - top), char, font=font, fill=paint + (255,))
        x += font.getlength(char) + tracking
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("state")
    parser.add_argument("--color", default="#ffffff")
    parser.add_argument("--font", default=FONT)
    parser.add_argument("--out")
    parser.add_argument("--cap", type=float, default=CAP_RATIO, help="state capitals as a share of the wordmark's (at most 1)")
    args = parser.parse_args()
    suffix = "" if args.color.lower() in ("#fff", "#ffffff", "white") else "-" + args.color.lstrip("#").lower()
    out = Path(args.out) if args.out else ROOT / "states" / f"l2l-{args.state.lower().replace(' ', '-')}{suffix}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    make(args.state, args.color, args.font, args.cap).save(out)
    print(out)
