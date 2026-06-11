"""Procedural French Quarter textures: facade atlas (12 variants), signs, road.

Output: assets/textures/*.png  (committed; the game ships them)
"""
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../assets/textures"))
os.makedirs(OUT, exist_ok=True)
random.seed(8)  # 8am

T = 256  # tile size
COLS, ROWS = 4, 3

STUCCOS = [
    (214, 178, 138), (196, 154, 120), (188, 168, 146), (172, 142, 118),
    (205, 170, 125), (168, 130, 100), (190, 145, 135), (178, 160, 120),
    (220, 190, 150), (158, 138, 122), (199, 162, 110), (182, 150, 140),
]
SHUTTERS = [
    (52, 84, 60), (40, 60, 90), (90, 50, 40), (35, 70, 65),
    (70, 80, 45), (50, 50, 70), (84, 42, 52), (45, 75, 50),
    (60, 90, 70), (30, 45, 60), (96, 70, 40), (55, 55, 55),
]


def grime(img, amount=900):
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    for _ in range(amount):
        x, y = random.randint(0, w - 1), random.randint(0, h - 1)
        a = random.randint(6, 22)
        v = random.randint(-30, 18)
        c = (max(0, 90 + v), max(0, 80 + v), max(0, 70 + v), a)
        r = random.randint(1, 5)
        d.ellipse([x, y, x + r, y + r], fill=c)


def facade_tile(idx: int) -> Image.Image:
    img = Image.new("RGB", (T, T), STUCCOS[idx])
    d = ImageDraw.Draw(img)
    sh = SHUTTERS[idx]
    dark = (28, 26, 30)
    trim = tuple(max(0, c - 45) for c in STUCCOS[idx])

    rows = 2 if idx % 3 else 3
    cols = 2 + (idx % 2)
    win_w = T // (cols * 2 + 1) + (4 if idx % 4 == 0 else 0)
    for r in range(rows):
        y0 = 18 + r * (T // rows)
        y1 = y0 + (T // rows) - 34
        for c in range(cols):
            x0 = (c * 2 + 1) * (T // (cols * 2 + 1))
            x1 = x0 + win_w
            # tall shuttered window: lintel, dark glass, shutters
            d.rectangle([x0 - 3, y0 - 6, x1 + 3, y0 - 2], fill=trim)
            d.rectangle([x0, y0, x1, y1], fill=dark)
            # glass panes
            d.line([( (x0 + x1) // 2, y0), ((x0 + x1) // 2, y1)], fill=(60, 62, 72), width=2)
            d.line([(x0, (y0 + y1) // 2), (x1, (y0 + y1) // 2)], fill=(60, 62, 72), width=2)
            # shutters
            sw = max(6, win_w // 4)
            d.rectangle([x0 - sw - 2, y0, x0 - 2, y1], fill=sh)
            d.rectangle([x1 + 2, y0, x1 + sw + 2, y1], fill=sh)
            for ly in range(y0 + 4, y1 - 3, 7):
                d.line([(x0 - sw - 1, ly), (x0 - 3, ly)], fill=tuple(max(0, v - 18) for v in sh))
                d.line([(x1 + 3, ly), (x1 + sw + 1, ly)], fill=tuple(max(0, v - 18) for v in sh))
    # ground-floor door on some tiles
    if idx % 2 == 0:
        dw = T // 7
        d.rectangle([T // 2 - dw, T - 64, T // 2 + dw, T - 4], fill=(40, 30, 26))
        d.rectangle([T // 2 - dw + 4, T - 60, T // 2 + dw - 4, T - 30], fill=(58, 44, 36))
    # cornice
    d.rectangle([0, 0, T, 8], fill=trim)
    grime(img, 400)
    return img


def build_atlas():
    atlas = Image.new("RGB", (T * COLS, T * ROWS))
    for i in range(12):
        tile = facade_tile(i)
        atlas.paste(tile, ((i % COLS) * T, (i // COLS) * T))
    atlas = atlas.filter(ImageFilter.GaussianBlur(0.5))
    atlas.save(os.path.join(OUT, "facades.png"), optimize=True)


def load_font(size):
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sign(name, text, fg, bg, w=512, h=128, glow=False):
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    f = load_font(int(h * 0.55))
    bbox = d.textbbox((0, 0), text, font=f)
    x = (w - (bbox[2] - bbox[0])) // 2 - bbox[0]
    y = (h - (bbox[3] - bbox[1])) // 2 - bbox[1]
    if glow:
        glow_img = Image.new("RGB", (w, h), bg)
        gd = ImageDraw.Draw(glow_img)
        gd.text((x, y), text, font=f, fill=fg)
        glow_img = glow_img.filter(ImageFilter.GaussianBlur(6))
        img = Image.blend(img, glow_img, 0.85)
        d = ImageDraw.Draw(img)
    d.text((x, y), text, font=f, fill=fg)
    img.save(os.path.join(OUT, name), optimize=True)


def road():
    img = Image.new("RGB", (512, 512), (38, 38, 44))
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(4000):
        x, y = random.randint(0, 511), random.randint(0, 511)
        v = random.randint(-14, 14)
        d.point((x, y), fill=(38 + v, 38 + v, 44 + v, 255))
    # puddle shine blobs
    for _ in range(7):
        x, y = random.randint(40, 470), random.randint(40, 470)
        rx, ry = random.randint(30, 90), random.randint(14, 40)
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(70, 82, 96, 90))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(os.path.join(OUT, "road.png"), optimize=True)

    img = Image.new("RGB", (512, 512), (148, 138, 124))
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(3000):
        x, y = random.randint(0, 511), random.randint(0, 511)
        v = random.randint(-12, 12)
        d.point((x, y), fill=(148 + v, 138 + v, 124 + v, 255))
    for gx in range(0, 512, 128):  # slab joints
        d.line([(gx, 0), (gx, 512)], fill=(108, 100, 90, 255), width=3)
        d.line([(0, gx), (512, gx)], fill=(112, 104, 94, 255), width=3)
    img.save(os.path.join(OUT, "sidewalk.png"), optimize=True)


build_atlas()
road()
sign("sign_lipstixx.png", "LIPSTIXX", (255, 70, 160), (24, 8, 20), glow=True)
sign("sign_travel.png", "FLIGHTS HOME — $500", (240, 230, 200), (30, 50, 80))
sign("sign_daiquiri.png", "BIG EZ DAIQUIRIS", (90, 230, 120), (40, 20, 50), glow=True)
sign("sign_cafe.png", "CAFÉ BEIGNET", (250, 240, 210), (70, 45, 30))
sign("sign_antiques.png", "ROYAL ANTIQUES", (220, 200, 150), (35, 30, 28))
sign("sign_grill.png", "CLOVER GRILL", (250, 250, 250), (140, 30, 35))
print("textures written to", OUT, os.listdir(OUT))
