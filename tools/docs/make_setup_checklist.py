#!/usr/bin/env python3
"""Generate updates/SETUP-CHECKLIST.pdf — the owner's one-time setup steps
for the group-updates routine. Regenerate: python3 tools/docs/make_setup_checklist.py
"""
import os

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT, "updates", "SETUP-CHECKLIST.pdf")

INK = HexColor("#2b2118")
PURPLE = HexColor("#5b3a8c")
GREEN = HexColor("#1d6b40")
GOLD = HexColor("#b8860b")
CREAM = HexColor("#faf6ec")

S = {
    "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=24, leading=28,
                            textColor=PURPLE, alignment=1),
    "sub": ParagraphStyle("s", fontName="Helvetica-Oblique", fontSize=13, leading=17,
                          textColor=INK, alignment=1, spaceAfter=8),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=15, leading=19,
                        textColor=GREEN, spaceBefore=12, spaceAfter=5),
    "b": ParagraphStyle("b", fontName="Helvetica", fontSize=11.5, leading=16,
                        textColor=INK, spaceAfter=5),
    "mono": ParagraphStyle("m", fontName="Courier-Bold", fontSize=11, leading=15,
                           textColor=PURPLE),
}
P = lambda t, st="b": Paragraph(t, S[st])

REPO = "github.com/jbvyvf67cb-ai/wutang-arcade"
GAME = "https://jbvyvf67cb-ai.github.io/wutang-arcade/"
GUIDE = GAME + "HOW-TO-GUIDE.pdf"


def check_row(items):
    rows = [[P("☐"), P(f"<b>{a}</b> — {b}")] for a, b in items]
    t = Table(rows, colWidths=[0.35 * inch, 6.5 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, HexColor("#e4dcc9")),
    ]))
    return t


story = [
    P("Group Updates — Owner Setup Checklist", "title"),
    P("JOSHUA: A French Quarter Bear Tale · one-time setup, about 10 minutes", "sub"),
    HRFlowable(width="100%", color=GOLD, thickness=2),

    P("1. Create the routines on claude.ai (required — no coding, no terminal)", "h"),
    P("The update rounds are <b>Claude Code Routines</b>: scheduled cloud sessions that "
      "run on your Claude Pro/Max subscription. You create them in your browser at "
      "<b>claude.ai/code/routines</b> (or in the Claude desktop app: Routines → "
      "New routine → Remote). No API key, no command line.", "b"),
    check_row([
        ("Open the form", "Go to claude.ai/code/routines → <b>New routine</b>. If asked, "
         "connect your GitHub account so Claude can access the repo."),
        ("Name + instructions", "Name it “Group updates — 8 AM”. Into the Instructions "
         "box, paste the prompt from the repo file <b>updates/ROUTINE-PROMPT.md</b> "
         "(open it on GitHub and copy everything below the line). Pick your preferred "
         "model in the prompt box."),
        ("Repository", f"Add <b>{REPO.split('/')[-2]}/{REPO.split('/')[-1]}</b>."),
        ("Permissions tab", "Enable <b>Allow unrestricted branch pushes</b> for the repo "
         "— the routine must push to the default branch so the game deploys."),
        ("Trigger", "Schedule → Daily → 8:00 AM (times are in your local timezone)."),
        ("Repeat ×3", "Create three more routines with the same prompt and repo, "
         "scheduled daily at 2:00 PM, 8:00 PM, and 12:00 AM."),
    ]),
    P("Runs bill your subscription's usage allowance (same pool as your own Claude Code "
      "sessions) and count against a daily routine-run cap — empty-queue rounds exit in "
      "seconds and cost almost nothing. Commits and pushes appear as <i>your</i> GitHub "
      "account.", "b"),

    P("2. Invite your group (required — the repo is private)", "h"),
    check_row([
        ("Invite collaborators", f"{REPO} → Settings → Collaborators → Add people. "
         "Give them <b>Write</b> access so they can drop files into updates/queue."),
        ("No GitHub account?", "They create a free one first — the player guide covers it."),
    ]),

    P("3. Run one end-to-end test (recommended)", "h"),
    check_row([
        ("Queue a small request", "Repo → updates/queue → Add file → Create new file → "
         "name it test.txt, write something small (“add one extra coin trail on Royal "
         "Street”), commit."),
        ("Trigger a round now", "claude.ai/code/routines → open the 8 AM routine → "
         "<b>Run now</b>. Click the run to watch the session live."),
        ("Verify (10–30 min later)", "The live game updated; your file moved to "
         "updates/processed/&lt;timestamp&gt;/ next to a SUMMARY.md; the queue is empty again."),
    ]),

    P("4. Share with the group", "h"),
    check_row([
        ("Player guide (public link)", GUIDE),
        ("The repo", f"https://{REPO}  (they add requests here)"),
        ("The game", GAME),
    ]),

    P("5. Ongoing (light touch)", "h"),
    check_row([
        ("Check the runs list", "claude.ai/code/routines shows every run. Green only "
         "means the session finished — open a run's transcript to see what was actually "
         "done. Failed or skipped rounds leave the queue intact; requests are picked up "
         "next round."),
        ("Mind your usage", "Track consumption at claude.ai/settings/usage. Each "
         "non-empty round draws from your plan like a session you ran yourself; rounds "
         "also count against a daily routine-run cap."),
        ("Audit trail", "Every round writes updates/processed/&lt;timestamp&gt;/SUMMARY.md "
         "explaining what changed and why."),
        ("Pause / run on demand", "Each routine's page has a pause toggle and a "
         "Run now button."),
    ]),

    Spacer(1, 10),
    HRFlowable(width="100%", color=GOLD, thickness=2),
    P("<b>Schedule:</b> 8 AM, 2 PM, 8 PM, midnight — entered in your local timezone in "
      "the routine form. Runs may start a few minutes late (scheduling stagger is normal).", "b"),
    P("<b>Branch note:</b> the routines push to (and the game deploys from) the default "
      "branch — leave the default branch as-is and everything stays lined up.", "b"),
]

doc = SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                        leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                        title="Group Updates — Setup Checklist")
doc.build(story)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
