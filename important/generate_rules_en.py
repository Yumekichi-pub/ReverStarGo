"""
Generate ReverStarGo English Rules PDF using reportlab.
Output: ReverStarGo_Rules_EN.pdf
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "ReverStarGo_Rules_EN.pdf")

# ── Colours ──────────────────────────────────────────────────────────
DARK = HexColor("#1a1a2e")
ACCENT = HexColor("#16213e")
SECTION_BG = HexColor("#e8edf3")
BULLET_COLOR = HexColor("#0f3460")

# ── Styles ───────────────────────────────────────────────────────────
style_title = ParagraphStyle(
    "Title",
    fontName="Helvetica-Bold",
    fontSize=22,
    leading=28,
    alignment=TA_CENTER,
    textColor=DARK,
    spaceAfter=4 * mm,
)

style_subtitle = ParagraphStyle(
    "Subtitle",
    fontName="Helvetica",
    fontSize=11,
    leading=14,
    alignment=TA_CENTER,
    textColor=HexColor("#555555"),
    spaceAfter=8 * mm,
)

style_section = ParagraphStyle(
    "Section",
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=DARK,
    spaceBefore=6 * mm,
    spaceAfter=3 * mm,
    borderPadding=(2 * mm, 3 * mm, 2 * mm, 3 * mm),
)

style_body = ParagraphStyle(
    "Body",
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=HexColor("#222222"),
    spaceAfter=2 * mm,
)

style_bullet = ParagraphStyle(
    "Bullet",
    parent=style_body,
    leftIndent=12 * mm,
    bulletIndent=5 * mm,
    spaceBefore=1 * mm,
    spaceAfter=1 * mm,
)

style_footer = ParagraphStyle(
    "Footer",
    fontName="Helvetica",
    fontSize=8.5,
    leading=11,
    alignment=TA_CENTER,
    textColor=HexColor("#888888"),
)


def section_heading(number, title):
    """Return a coloured section heading with number badge."""
    return Paragraph(
        f'<font color="#0f3460">{number}.</font>  {title}',
        style_section,
    )


def bullet(text):
    return Paragraph(f"\u2022  {text}", style_bullet)


def body(text):
    return Paragraph(text, style_body)


def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    story = []

    # ── Title ─────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("ReverStarGo \u2014 Official Rules", style_title))
    story.append(
        Paragraph("A Strategy Board Game on a Six-Pointed Star Hexagonal Board", style_subtitle)
    )
    story.append(
        HRFlowable(
            width="90%", thickness=1, color=HexColor("#cccccc"),
            spaceAfter=6 * mm, spaceBefore=2 * mm,
        )
    )

    # ── 1. Overview ──────────────────────────────────────────────
    story.append(section_heading(1, "Overview"))
    story.append(
        body(
            "ReverStarGo is a strategy board game combining elements of "
            "<b>Reversi</b> and <b>Go</b>, played on a six-pointed star shaped "
            "hexagonal board. It blends the flipping mechanics of Reversi with "
            "the capture concepts of Go to create a unique tactical experience."
        )
    )

    # ── 2. Board ─────────────────────────────────────────────────
    story.append(section_heading(2, "Board"))
    story.append(
        body(
            "The board is a <b>six-pointed star</b> shape made of hexagonal cells."
        )
    )
    story.append(bullet("It has <b>42 playable cells</b> plus <b>1 Core Point (CP)</b> in the center."))
    story.append(
        bullet(
            'The 6 triangular tips of the star are called <b>"Tip Zones."</b>'
        )
    )

    # ── 3. Setup ─────────────────────────────────────────────────
    story.append(section_heading(3, "Setup"))
    story.append(
        body(
            "Place <b>3 black stones</b> and <b>3 white stones</b> alternately "
            "around the CP in the center. <b>Black plays first.</b>"
        )
    )

    # ── 4. Basic Rules (Reversi Rules) ───────────────────────────
    story.append(section_heading(4, "Basic Rules (Reversi Rules)"))
    story.append(
        bullet("Players take turns placing one stone of their color.")
    )
    story.append(
        bullet(
            "You must <b>sandwich</b> opponent's stones between your new stone "
            "and an existing stone of your color to <b>flip</b> them."
        )
    )
    story.append(bullet("Flipping is <b>mandatory</b> when possible."))
    story.append(
        bullet("If you cannot flip any stones, you must <b>pass</b>.")
    )
    story.append(
        bullet(
            "The game ends when <b>neither player can move</b>."
        )
    )

    # ── 5. CP Rules (Go-inspired Capture Rules) ──────────────────
    story.append(section_heading(5, "CP Rules (Go-inspired Capture Rules)"))
    story.append(
        body(
            "The <b>CP (center hex)</b> is a special cell that can be called as "
            "either Black or White."
        )
    )
    story.append(
        bullet(
            "When you use the CP to sandwich stones, you must <b>call its color</b> "
            "immediately after placing your stone."
        )
    )
    story.append(
        bullet(
            "<b>Capture Rule:</b> If you completely surround an opponent's "
            "stone(s) with your stones (like Go), you capture them."
        )
    )
    story.append(bullet("Captured stones become your <b>points</b>."))
    story.append(
        bullet(
            "The captured cells become <b>empty</b> and can be played on again."
        )
    )

    # ── 6. Winning ───────────────────────────────────────────────
    story.append(section_heading(6, "Winning"))
    story.append(
        body(
            "The player with the higher total score wins."
        )
    )
    story.append(
        body(
            "<b>Score = stones on board + captured stones (CP points).</b>"
        )
    )

    # ── 7. Ko Rule ───────────────────────────────────────────────
    story.append(section_heading(7, "Ko Rule"))
    story.append(
        body(
            "The same board position <b>cannot be repeated</b> (similar to "
            "Go's ko rule). This prevents infinite loops."
        )
    )

    # ── Footer separator ─────────────────────────────────────────
    story.append(Spacer(1, 12 * mm))
    story.append(
        HRFlowable(
            width="60%", thickness=0.5, color=HexColor("#cccccc"),
            spaceAfter=4 * mm,
        )
    )
    story.append(
        Paragraph(
            "Game Design: Takeshi Nishiguchi / Built with Claude Code",
            style_footer,
        )
    )

    doc.build(story)
    return OUTPUT_PATH


if __name__ == "__main__":
    path = build_pdf()
    print(f"PDF generated successfully: {path}")
