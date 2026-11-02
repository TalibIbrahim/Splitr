"""Generate Splitr app icons: the wordmark glyph "s" + accent dot, "Table Talk, one accent".

Run: PYTHONUTF8=1 python apps/mobile/scripts/make-icons.py   (needs Pillow)
Deterministic: same inputs -> same PNGs. Outputs to apps/mobile/assets/images.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# MUST match packages/design-tokens (ink/bg from the colour table, accent = ACCENT_PRESETS.ember).
C = {
    "ink": "#15131A",
    "bg": "#FFFFFF",
    "bg_dark": "#0F0E12",
    "accent": "#D93A16",
    "white": "#FFFFFF",
}

ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
OUT = Path(__file__).resolve().parents[1] / "assets/images"
SIZE = 1024
SS = 2  # supersample for smooth edges


def wordmark(width_frac, glyph_color, dot_color):
    """Return an RGBA SS-scaled canvas with "s." centred (by ink bbox), glyph+dot = width_frac of canvas."""
    n = SIZE * SS
    probe = ImageFont.truetype(str(FONT), 1000)
    adv = probe.getlength("s")
    sb = probe.getbbox("s", anchor="ls")  # (l, t, r, b) relative to baseline origin
    pb = probe.getbbox(".", anchor="ls")
    left = sb[0]
    right = adv + pb[2]
    scale = (n * width_frac) / (right - left)
    font = ImageFont.truetype(str(FONT), round(1000 * scale))
    adv = font.getlength("s")
    sb = font.getbbox("s", anchor="ls")
    pb = font.getbbox(".", anchor="ls")
    left, right = sb[0], adv + pb[2]
    top = min(sb[1], pb[1])
    bottom = max(sb[3], pb[3])  # period sits on baseline, "s" overshoots slightly
    x0 = (n - (right - left)) / 2 - left
    y0 = (n - (bottom - top)) / 2 - top  # baseline y
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((x0, y0), "s", font=font, fill=glyph_color, anchor="ls")
    d.text((x0 + adv, y0), ".", font=font, fill=dot_color, anchor="ls")
    return img


def finish(img, name, size=SIZE, flatten=None):
    if flatten:
        base = Image.new("RGBA", img.size, flatten)
        base.alpha_composite(img)
        img = base.convert("RGB")
    img = img.resize((size, size), Image.LANCZOS)
    img.save(OUT / name, optimize=True)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    full = wordmark(0.56, C["white"], C["accent"])
    # iOS: full-bleed square, opaque, no rounding.
    finish(full, "icon.png", flatten=C["ink"])
    # Android adaptive: glyph+dot inside inner 66% safe zone.
    safe = wordmark(0.50, C["white"], C["accent"])
    finish(safe, "android-icon-foreground.png")
    Image.new("RGB", (SIZE, SIZE), C["ink"]).save(OUT / "android-icon-background.png", optimize=True)
    finish(wordmark(0.50, C["white"], C["white"]), "android-icon-monochrome.png")
    # Splash (transparent): ink glyph on white splash, white glyph on dark splash.
    finish(wordmark(0.56, C["ink"], C["accent"]), "splash-icon.png")
    finish(wordmark(0.56, C["white"], C["accent"]), "splash-icon-dark.png")
    # Favicon: tiny, so give it the ink tile for legibility in any tab theme.
    finish(wordmark(0.62, C["white"], C["accent"]), "favicon.png", size=48, flatten=C["ink"])


if __name__ == "__main__":
    main()
