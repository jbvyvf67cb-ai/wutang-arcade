#!/usr/bin/env python3
"""Generate updates/HOW-TO-GUIDE.pdf — the non-technical group-updates guide.

Builds a friendly PDF explaining how to drop change requests into
updates/queue/ and how the 4x-daily Claude routine turns them into the
live game. Uses the committed screenshot tour + PIL-drawn GitHub UI
mockups. Regenerate after big changes:  python3 tools/docs/make_update_guide.py
"""
import os

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Image as RLImage, KeepTogether, PageBreak, Paragraph,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SHOTS = os.path.join(ROOT, "qa", "screenshots", "quarter")
OUT = os.path.join(ROOT, "updates", "HOW-TO-GUIDE.pdf")
TMP = "/tmp/guide_assets"
os.makedirs(TMP, exist_ok=True)

# ---- palette (Mardi Gras, but tasteful) ----
INK = HexColor("#2b2118")
PURPLE = HexColor("#5b3a8c")
GREEN = HexColor("#1d6b40")
GOLD = HexColor("#b8860b")
CREAM = HexColor("#faf6ec")
RED = HexColor("#a33b3b")

REPO_URL = "github.com/jbvyvf67cb-ai/wutang-arcade"
GAME_URL = "https://jbvyvf67cb-ai.github.io/wutang-arcade/"


def font(size, bold=False):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else "")
    return ImageFont.truetype(path, size)


# ------------------------------------------------ GitHub UI mockup (PIL) ----
def make_ui_mockup():
    """Three schematic panels showing the add-a-request clicks on github.com."""
    W, H = 1980, 760
    img = Image.new("RGB", (W, H), (250, 246, 236))
    d = ImageDraw.Draw(img)
    panel_w, gap = 600, 45
    x0 = (W - 3 * panel_w - 2 * gap) // 2

    def panel(x, title):
        d.rounded_rectangle([x, 90, x + panel_w, H - 30], 14, fill=(255, 255, 255),
                            outline=(180, 170, 150), width=3)
        # browser chrome
        d.rounded_rectangle([x, 90, x + panel_w, 150], 14, fill=(43, 33, 24))
        d.rectangle([x, 125, x + panel_w, 150], fill=(43, 33, 24))
        for i, c in enumerate([(220, 90, 90), (230, 190, 80), (90, 190, 110)]):
            d.ellipse([x + 22 + i * 30, 108, x + 42 + i * 30, 128], fill=c)
        d.text((x + 120, 105), "github.com", font=font(24), fill=(235, 225, 205))
        d.text((x + panel_w // 2, 55), title, font=font(30, True), fill=(91, 58, 140), anchor="mm")

    # ---- panel 1: navigate + Add file ----
    p = x0
    panel(p, "STEP 1 — Open the queue folder")
    d.text((p + 30, 180), REPO_URL, font=font(20), fill=(120, 110, 95))
    d.text((p + 30, 220), "updates / queue", font=font(30, True), fill=(43, 33, 24))
    for i, name in enumerate([".gitkeep", "README.md"]):
        d.rectangle([p + 30, 280 + i * 56, p + panel_w - 30, 280 + i * 56 + 46],
                    fill=(248, 246, 240), outline=(220, 214, 200))
        d.text((p + 50, 290 + i * 56), "📄  " + name, font=font(22), fill=(90, 84, 72))
    # Add file button
    d.rounded_rectangle([p + 320, 430, p + panel_w - 30, 490], 10, fill=(31, 136, 61))
    d.text((p + 320 + 125, 460), "Add file  ▾", font=font(26, True), fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle([p + 250, 500, p + panel_w - 30, 560], 10, fill=(255, 255, 255),
                        outline=(91, 58, 140), width=4)
    d.text((p + 280, 515), "＋ Create new file", font=font(26, True), fill=(91, 58, 140))
    d.text((p + 30, 600), "Sign in to GitHub, open the repo,", font=font(24), fill=(60, 52, 42))
    d.text((p + 30, 635), "click into  updates  then  queue,", font=font(24), fill=(60, 52, 42))
    d.text((p + 30, 670), "then  Add file → Create new file.", font=font(24), fill=(60, 52, 42))

    # ---- panel 2: name + write ----
    p = x0 + panel_w + gap
    panel(p, "STEP 2 — Name it & write your idea")
    d.rectangle([p + 30, 185, p + panel_w - 30, 240], fill=(255, 255, 255), outline=(91, 58, 140), width=4)
    d.text((p + 45, 198), "tasha-streetcar-bell.txt", font=font(24), fill=(43, 33, 24))
    d.text((p + 30, 252), "Name the file:  yourname-your-idea.txt", font=font(20), fill=(120, 110, 95))
    d.rectangle([p + 30, 300, p + panel_w - 30, 600], fill=(252, 250, 245), outline=(200, 192, 175), width=3)
    lines = [
        "Make the streetcar ring a bell when it",
        "stops, and let me ride on its roof to",
        "jump onto the Jax Brewery balconies.",
        "",
        "Also the bell should scare nearby",
        "pirates so they run away for a few",
        "seconds. Feels like a fun escape move.",
    ]
    for i, ln in enumerate(lines):
        d.text((p + 50, 320 + i * 38), ln, font=font(22), fill=(70, 62, 50))
    d.text((p + 30, 625), "Plain English. One idea per file.", font=font(24), fill=(60, 52, 42))
    d.text((p + 30, 660), "Say WHAT, WHERE, and how it should FEEL.", font=font(24), fill=(60, 52, 42))

    # ---- panel 3: commit ----
    p = x0 + 2 * (panel_w + gap)
    panel(p, "STEP 3 — Commit (save) it")
    d.rounded_rectangle([p + 150, 240, p + panel_w - 150, 320], 12, fill=(31, 136, 61))
    d.text((p + panel_w // 2, 280), "Commit changes...", font=font(28, True), fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle([p + 60, 360, p + panel_w - 60, 560], 12, fill=(255, 255, 255),
                        outline=(200, 192, 175), width=3)
    d.text((p + 90, 380), "Commit message (optional)", font=font(20), fill=(120, 110, 95))
    d.rectangle([p + 90, 415, p + panel_w - 90, 460], fill=(248, 246, 240), outline=(210, 202, 186))
    d.text((p + 100, 425), "streetcar bell idea", font=font(20), fill=(90, 84, 72))
    d.rounded_rectangle([p + 90, 485, p + panel_w - 230, 535], 10, fill=(31, 136, 61))
    d.text((p + 100, 498), "Commit changes", font=font(22, True), fill=(255, 255, 255))
    d.text((p + 30, 600), "Click the green button (twice).", font=font(24), fill=(60, 52, 42))
    d.text((p + 30, 635), "Done! Your idea is in the queue for", font=font(24), fill=(60, 52, 42))
    d.text((p + 30, 670), "the next update round.", font=font(24), fill=(60, 52, 42))

    out = os.path.join(TMP, "ui_mockup.png")
    img.save(out)
    return out


def make_timeline():
    """The daily pipeline strip: 4 clocks + the 4 phases."""
    W, H = 1980, 420
    img = Image.new("RGB", (W, H), (250, 246, 236))
    d = ImageDraw.Draw(img)
    times = ["8 AM", "2 PM", "8 PM", "12 AM"]
    d.text((W // 2, 36), "Four update rounds, every day (US Central)", font=font(34, True),
           fill=(43, 33, 24), anchor="mm")
    for i, t in enumerate(times):
        cx = 250 + i * 490
        d.ellipse([cx - 70, 100, cx + 70, 240], outline=(91, 58, 140), width=8, fill=(255, 255, 255))
        d.text((cx, 170), t, font=font(36, True), fill=(91, 58, 140), anchor="mm")
        if i < 3:
            d.line([cx + 90, 170, cx + 400, 170], fill=(184, 134, 11), width=6)
    steps = [
        ("1. COLLECT", "every note in the queue is read"),
        ("2. BUILD", "Claude changes the game code"),
        ("3. CHECK", "nothing may break the game"),
        ("4. PUBLISH", "new version goes live + summary"),
    ]
    for i, (a, b) in enumerate(steps):
        x = 80 + i * 480
        d.rounded_rectangle([x, 280, x + 440, 390], 14, fill=(255, 255, 255),
                            outline=(29, 107, 64), width=4)
        d.text((x + 220, 312), a, font=font(28, True), fill=(29, 107, 64), anchor="mm")
        d.text((x + 220, 358), b, font=font(21), fill=(70, 62, 50), anchor="mm")
    out = os.path.join(TMP, "timeline.png")
    img.save(out)
    return out


# ------------------------------------------------------------ PDF layout ----
def styles():
    base = dict(fontName="Helvetica", textColor=INK)
    return {
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=30, leading=34,
                                textColor=PURPLE, alignment=1),
        "subtitle": ParagraphStyle("subtitle", fontName="Helvetica-Oblique", fontSize=15,
                                   leading=19, textColor=INK, alignment=1),
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=24,
                             textColor=PURPLE, spaceBefore=10, spaceAfter=8),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=14, leading=18,
                             textColor=GREEN, spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("body", fontSize=11.5, leading=16, spaceAfter=6, **base),
        "big": ParagraphStyle("big", fontSize=13, leading=18, spaceAfter=6, **base),
        "caption": ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=10,
                                  leading=13, textColor=HexColor("#6b5e4a"), alignment=1,
                                  spaceAfter=10),
        "exbad": ParagraphStyle("exbad", fontSize=11, leading=15, textColor=RED,
                                fontName="Helvetica", leftIndent=8),
        "exgood": ParagraphStyle("exgood", fontSize=11, leading=15, textColor=GREEN,
                                 fontName="Helvetica", leftIndent=8),
    }


def shot(name, width):
    path = os.path.join(SHOTS, name)
    return RLImage(path, width=width, height=width * 720 / 1280)


def example_table(rows, S):
    t = Table(rows, colWidths=[1.15 * inch, 5.6 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 1, HexColor("#d8cfbc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#e4dcc9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def build():
    S = styles()
    ui = make_ui_mockup()
    timeline = make_timeline()
    doc = SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.6 * inch,
                            bottomMargin=0.6 * inch, leftMargin=0.7 * inch,
                            rightMargin=0.7 * inch, title="JOSHUA — Group Updates Guide")
    P = lambda txt, st="body": Paragraph(txt, S[st])
    story = []

    # ---------------- page 1: cover ----------------
    story += [
        P("JOSHUA", "title"),
        P("A French Quarter Bear Tale — <b>Group Updates Guide</b>", "subtitle"),
        Spacer(1, 10),
        shot("jackson_square.png", 6.9 * inch),
        P("Jackson Square: St. Louis Cathedral, the Cabildo &amp; Presbytère, and the Pontalba galleries — "
          "the whole game map is the real French Quarter, built from OpenStreetMap.", "caption"),
        P("There's a bear named Joshua. He woke up in a gutter outside Lafitte's Blacksmith Shop "
          "with a headache, a red bow tie, and a collage scattered across the entire French Quarter. "
          "He needs $500 for a flight home. <b>You can change his world</b> — add enemies, secrets, "
          "sounds, jokes, whole new toys — just by writing a note.", "big"),
        Spacer(1, 6),
        P(f"<b>Play the game:</b> <font color='#5b3a8c'>{GAME_URL}</font>", "big"),
        P("Works in any browser — laptop, or a recent iPhone/Android. "
          "WASD + Space to move, J to claw, K to drop the Groove.", "body"),
        Spacer(1, 10),
        RLImage(timeline, width=6.9 * inch, height=6.9 * inch * 420 / 1980),
    ]
    story.append(PageBreak())

    # ---------------- page 2: how to submit ----------------
    story += [
        P("How to add your idea (no coding, ~2 minutes)", "h1"),
        P("Requests live in a folder called <b>updates/queue</b> in the game's GitHub project. "
          "You add a plain text file there through the GitHub website — that's the whole job. "
          "You need a free GitHub account and an invite to the project "
          "(ask whoever sent you this guide).", "body"),
        Spacer(1, 6),
        RLImage(ui, width=6.9 * inch, height=6.9 * inch * 760 / 1980),
        Spacer(1, 8),
        P("The three clicks, spelled out", "h2"),
        P("<b>1.</b> Go to <font color='#5b3a8c'>" + REPO_URL + "</font> and sign in. "
          "Click the <b>updates</b> folder, then <b>queue</b>.", "body"),
        P("<b>2.</b> Click <b>Add file → Create new file</b>. In the name box type "
          "<b>yourname-your-idea.txt</b> (example: <i>marcus-more-pirates.txt</i>). "
          "Write your request in the big box below, in plain English.", "body"),
        P("<b>3.</b> Click the green <b>Commit changes…</b> button, then <b>Commit changes</b> "
          "again in the popup. Done — your note is in the queue. At the next round "
          "(8 AM / 2 PM / 8 PM / midnight Central) it gets built into the game.", "body"),
        Spacer(1, 4),
        HRFlowable(width="100%", color=GOLD, thickness=2),
        P("<b>On your phone?</b> The GitHub website works fine in a mobile browser — same three steps. "
          "If the editor looks cramped, request the desktop site.", "body"),
    ]
    story.append(PageBreak())

    # ---------------- page 3: writing good requests ----------------
    story += [
        P("Writing a request that turns out great", "h1"),
        P("The builder is an AI (Claude) with full creative license over the details — but it can't "
          "read your mind. The more your note says about <b>WHAT</b> you want, <b>WHERE</b> it happens, "
          "and <b>how it should FEEL</b>, the closer the result lands to what you imagined.", "body"),
        Spacer(1, 4),
        example_table([
            [P("<b>Too vague</b>", "exbad"), P("<i>“make the game better”</i> — the builder has to guess "
                                               "everything; you might get anything.", "body")],
            [P("<b>Good</b>", "exgood"), P("<i>“Add more pirates near the river.”</i> — clear what and "
                                           "where. The builder picks the how.", "body")],
            [P("<b>Great</b>", "exgood"), P("<i>“Add a pirate captain mini-boss on the Moonwalk steps by "
                                            "the river. Slower than the Huntress but with a cannon that "
                                            "shoots beads. Beating him should feel like a real victory — "
                                            "maybe 50 doubloons and a cheer sound.”</i> — what, where, "
                                            "how it behaves, and how winning should feel.", "body")],
        ], S),
        Spacer(1, 10),
        P("Include these details when you can", "h2"),
        P("• <b>Where:</b> use real places — Bourbon Street, Jackson Square, Café du Monde, Royal Street "
          "balconies, Pirate's Alley, the Mississippi, Preservation Hall, Lipstixx… the map is the real "
          "Quarter, so landmark names work.", "body"),
        P("• <b>How much:</b> “a little faster”, “twice as many”, “rare — hidden in one spot”.", "body"),
        P("• <b>The feeling:</b> “goofy”, “spooky”, “satisfying crunch”, “should make my mom laugh”.", "body"),
        P("• <b>When:</b> the game has a clock (8 AM to neon dusk) — you can ask for things that only "
          "happen at night, or when a shop opens.", "body"),
        Spacer(1, 8),
        P("Idea menu (steal these)", "h2"),
        P("New enemies or a boss · secret coin stashes · new sounds or music tweaks · balcony parkour "
          "routes · jokes and gag messages · new stuff inside the shops and bars · weather · a new "
          "power-up · pigeons · making the Huntress scarier · racing the streetcar · anything that made "
          "you grin in a N64 game.", "body"),
        Spacer(1, 8),
        P("House rules", "h2"),
        P("• One idea per file (submit as many files as you like). "
          "• Keep it playable — requests that would break the game or its budgets get scaled back, with "
          "an explanation. • If two people ask for opposite things in the same round, the builder makes "
          "a judgment call and explains it in the summary.", "body"),
    ]
    story.append(PageBreak())

    # ---------------- page 4: the world you're editing ----------------
    story += [
        P("The world you're editing", "h1"),
        P("Screenshots from the live game — name these places in your requests.", "body"),
        Spacer(1, 4),
        shot("bourbon_dusk.png", 5.4 * inch),
        P("Bourbon Street at dusk — packs of pleats (the frat boys), iron galleries, and the travel agency selling the "
          "$500 flight home (next door to Lipstixx, where the finale happens).", "caption"),
        shot("cafe_du_monde.png", 5.4 * inch),
        P("Café du Monde — green-striped canopy, marble tables, beignets that heal Joshua's bow tie, "
          "and a powdered-sugar cloud gag.", "caption"),
    ]
    story.append(PageBreak())
    story += [
        shot("mississippi_swim.png", 5.4 * inch),
        P("The Mississippi is real water — Joshua swims it for floating doubloons. Pirates patrol the "
          "Moonwalk and the French Market. The Riverfront streetcar runs the levee and you can ride it.", "caption"),
        shot("interior_preservation_hall.png", 5.4 * inch),
        P("Seven real places open up as the day passes — the voodoo shop at 10, the bars at 11, "
          "Preservation Hall at 5 (someone hands the bear a tambourine).", "caption"),
        Spacer(1, 6),
        P("What happens to your request", "h1"),
        P("<b>1.</b> At the next round, the builder reads every note in the queue alongside the game's "
          "design contract, makes the changes, and verifies the game still builds and runs on budget.", "body"),
        P("<b>2.</b> About 15–30 minutes after the round starts, the live game updates at "
          f"<font color='#5b3a8c'>{GAME_URL}</font> — refresh and play.", "body"),
        P("<b>3.</b> Your note is moved to <b>updates/processed/&lt;date&gt;/</b> next to a "
          "<b>SUMMARY.md</b> explaining exactly what was done with each request — or why something "
          "was scaled back or skipped. That's also where to look if your idea didn't show up.", "body"),
        P("<b>4.</b> The queue is empty again, ready for the next round. There is no limit — "
          "the game keeps evolving as long as people keep writing notes.", "body"),
        Spacer(1, 10),
        HRFlowable(width="100%", color=GOLD, thickness=2),
        Spacer(1, 4),
        P("<i>“Reality is merely another kind of wonder.” — Ram Dass.</i> &nbsp;Game map: "
          "© OpenStreetMap contributors. Built and updated by Claude.", "caption"),
    ]

    doc.build(story)
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    build()
