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


AWNINGS = [
    (140, 40, 45), (35, 80, 50), (45, 55, 110), (120, 90, 30),
    (90, 40, 90), (40, 90, 95), (130, 70, 35), (60, 60, 60),
    (150, 55, 70), (35, 65, 40), (110, 100, 45), (70, 45, 95),
]


def facade_tile(idx: int) -> Image.Image:
    img = Image.new("RGB", (T, T), STUCCOS[idx])
    d = ImageDraw.Draw(img)
    sh = SHUTTERS[idx]
    aw = AWNINGS[idx]
    dark = (28, 26, 30)
    trim = tuple(max(0, c - 45) for c in STUCCOS[idx])
    brick = idx % 3 == 1
    if brick:
        bc = tuple(max(0, c - 25) for c in STUCCOS[idx])
        for by in range(0, T, 9):
            d.line([(0, by), (T, by)], fill=bc)
        for by in range(0, T, 18):
            for bx in range(0, T, 22):
                d.line([(bx + (11 if (by // 9) % 2 else 0), by), (bx + (11 if (by // 9) % 2 else 0), by + 9)], fill=bc)

    ground_h = 76  # ground-floor storefront band at the bottom of the tile
    rows = 2
    cols = 2 + (idx % 2)
    win_w = T // (cols * 2 + 1) + (4 if idx % 4 == 0 else 0)
    for r in range(rows):
        y0 = 16 + r * ((T - ground_h - 10) // rows)
        y1 = y0 + (T - ground_h - 10) // rows - 22
        for c in range(cols):
            x0 = (c * 2 + 1) * (T // (cols * 2 + 1))
            x1 = x0 + win_w
            d.rectangle([x0 - 3, y0 - 6, x1 + 3, y0 - 2], fill=trim)
            d.rectangle([x0, y0, x1, y1], fill=dark)
            d.line([((x0 + x1) // 2, y0), ((x0 + x1) // 2, y1)], fill=(60, 62, 72), width=2)
            d.line([(x0, (y0 + y1) // 2), (x1, (y0 + y1) // 2)], fill=(60, 62, 72), width=2)
            sw = max(6, win_w // 4)
            d.rectangle([x0 - sw - 2, y0, x0 - 2, y1], fill=sh)
            d.rectangle([x1 + 2, y0, x1 + sw + 2, y1], fill=sh)
            for ly in range(y0 + 4, y1 - 3, 7):
                d.line([(x0 - sw - 1, ly), (x0 - 3, ly)], fill=tuple(max(0, v - 18) for v in sh))
                d.line([(x1 + 3, ly), (x1 + sw + 1, ly)], fill=tuple(max(0, v - 18) for v in sh))
            # wrought-iron juliet rail under each upper window
            d.rectangle([x0 - sw - 2, y1 + 2, x1 + sw + 2, y1 + 4], fill=(20, 20, 22))
            for rx in range(x0 - sw, x1 + sw, 5):
                d.line([(rx, y1 + 4), (rx, y1 + 12)], fill=(20, 20, 22))

    # ---- ground floor: storefront glass + door + striped awning ----
    gy = T - ground_h
    d.rectangle([0, gy, T, T], fill=tuple(max(0, c - 18) for c in STUCCOS[idx]))
    # awning with stripes
    d.rectangle([4, gy, T - 4, gy + 18], fill=aw)
    for sx_ in range(4, T - 4, 16):
        d.rectangle([sx_, gy, sx_ + 8, gy + 18], fill=tuple(min(255, c + 60) for c in aw))
    d.rectangle([4, gy + 18, T - 4, gy + 22], fill=tuple(max(0, c - 30) for c in aw))
    # storefront windows + recessed door
    d.rectangle([10, gy + 28, T // 2 - 14, T - 10], fill=(25, 28, 34))
    d.line([(10, gy + 52), (T // 2 - 14, gy + 52)], fill=(70, 72, 80), width=2)
    door_x0, door_x1 = T // 2 + 2, T // 2 + 44
    d.rectangle([door_x0, gy + 26, door_x1, T - 6], fill=(38, 28, 24))
    d.rectangle([door_x0 + 5, gy + 32, door_x1 - 5, T - 30], fill=(55, 42, 34))
    d.ellipse([door_x1 - 12, gy + 64, door_x1 - 7, gy + 69], fill=(180, 150, 70))
    # second window right of door on wide tiles
    d.rectangle([door_x1 + 8, gy + 28, T - 10, T - 10], fill=(25, 28, 34))
    # gas lantern beside the door
    d.rectangle([door_x0 - 12, gy + 34, door_x0 - 4, gy + 48], fill=(15, 15, 16))
    d.rectangle([door_x0 - 10, gy + 37, door_x0 - 6, gy + 45], fill=(255, 220, 140))

    # cornice + parapet shadow
    d.rectangle([0, 0, T, 8], fill=trim)
    d.rectangle([0, 8, T, 11], fill=tuple(max(0, c - 70) for c in STUCCOS[idx]))
    grime(img, 500)
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
    # faded yellow center dashes (texture tiles along street length)
    for dy in range(10, 512, 86):
        d.rectangle([249, dy, 262, dy + 40], fill=(150, 130, 55, 130))
    # crosswalk-ish wear bars near tile edge
    for bx in range(40, 472, 48):
        d.rectangle([bx, 480, bx + 24, 508], fill=(120, 118, 116, 60))
    # manhole covers
    for mx, my in [(140, 180), (390, 340)]:
        d.ellipse([mx - 22, my - 22, mx + 22, my + 22], fill=(28, 27, 30, 255))
        d.ellipse([mx - 18, my - 18, mx + 18, my + 18], outline=(55, 53, 56, 255), width=2)
    # gutter wear along both edges
    d.rectangle([0, 0, 14, 512], fill=(30, 30, 34, 120))
    d.rectangle([498, 0, 512, 512], fill=(30, 30, 34, 120))
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
# street name blades (real Bourbon St cross streets) — white on green
for name, text in [
    ("street_bourbon.png", "BOURBON ST"),
    ("street_stpeter.png", "ST. PETER ST"),
    ("street_orleans.png", "ORLEANS ST"),
]:
    sign(name, text, (240, 245, 240), (18, 80, 45), w=512, h=96)
sign("sign_lipstixx.png", "LIPSTIXX", (255, 70, 160), (24, 8, 20), glow=True)
sign("sign_travel.png", "FLIGHTS HOME — $500", (240, 230, 200), (30, 50, 80))
sign("sign_daiquiri.png", "BIG EZ DAIQUIRIS", (90, 230, 120), (40, 20, 50), glow=True)
sign("sign_cafe.png", "CAFÉ BEIGNET", (250, 240, 210), (70, 45, 30))
sign("sign_antiques.png", "ROYAL ANTIQUES", (220, 200, 150), (35, 30, 28))
sign("sign_grill.png", "CLOVER GRILL", (250, 250, 250), (140, 30, 35))
print("textures written to", OUT, os.listdir(OUT))
