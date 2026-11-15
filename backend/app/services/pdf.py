"""Branded question-paper PDF generation with ReportLab."""
import io
import random
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import config

BRAND = colors.HexColor("#4f46e5")


def shuffled_rights(q):
    """Deterministic shuffle of the right-hand column of a match question (stable per question)."""
    rights = [p["right"] for p in q.get("pairs", [])]
    rng = random.Random(str(q.get("_id", q.get("text", ""))))
    rng.shuffle(rights)
    return rights


def _fmt_marks(m):
    m = float(m)
    return str(int(m)) if m.is_integer() else str(m)


def build_test_pdf(test, questions, institution, include_answers=False) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=18 * mm,
                            title=test.get("title", "Test"))
    ss = getSampleStyleSheet()
    st = {
        "org": ParagraphStyle("org", parent=ss["Title"], fontSize=18, textColor=BRAND, spaceAfter=2, alignment=TA_CENTER),
        "tag": ParagraphStyle("tag", parent=ss["Normal"], fontSize=9, textColor=colors.grey, alignment=TA_CENTER),
        "title": ParagraphStyle("title", parent=ss["Heading2"], alignment=TA_CENTER, spaceBefore=6, spaceAfter=4),
        "sec": ParagraphStyle("sec", parent=ss["Heading3"], textColor=colors.white, backColor=BRAND, borderPadding=(3, 6, 3, 6),
                              spaceBefore=10, spaceAfter=8),
        "q": ParagraphStyle("q", parent=ss["Normal"], fontSize=10.5, leading=14),
        "opt": ParagraphStyle("opt", parent=ss["Normal"], fontSize=10, leading=13, leftIndent=14),
        "small": ParagraphStyle("small", parent=ss["Normal"], fontSize=9, textColor=colors.HexColor("#374151")),
        "ans": ParagraphStyle("ans", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#065f46"), leftIndent=14),
    }
    story = []

    # --- Branded header ---------------------------------------------------
    inst = institution or {}
    org_name = inst.get("name") or "AI Test Platform"
    header_cells = []
    logo_path = inst.get("logoPath")
    if logo_path:
        full = config.UPLOAD_ROOT / "logos" / Path(logo_path).name
        if full.exists():
            try:
                img = Image(str(full))
                ratio = img.imageWidth / float(img.imageHeight or 1)
                img.drawHeight = 18 * mm
                img.drawWidth = 18 * mm * ratio
                header_cells.append(img)
            except Exception:  # noqa: BLE001
                pass
    text_block = [Paragraph(escape(org_name), st["org"])]
    if inst.get("tagline"):
        text_block.append(Paragraph(escape(inst["tagline"]), st["tag"]))
    if header_cells:
        t = Table([[header_cells[0], text_block]], colWidths=[30 * mm, None])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(t)
    else:
        story.extend(text_block)

    story.append(Paragraph(escape(test.get("title", "Test")) + (" — ANSWER KEY" if include_answers else ""), st["title"]))
    meta = Table(
        [[f"Duration: {test.get('duration')} minutes", f"Maximum marks: {_fmt_marks(sum(float(q.get('marks', 1)) for q in questions))}",
          f"Questions: {len(questions)}"],
         ["Name: ______________________", "Roll no: ____________", "Date: ____________"]],
        colWidths=[None, None, None],
    )
    meta.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BOX", (0, 0), (-1, -1), 0.6, BRAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.3, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(meta)
    story.append(Spacer(1, 4))
    instructions = test.get("description") or (
        "Answer all questions. For multiple choice, circle the correct letter. Write clearly; the marks for each question are shown in brackets."
    )
    story.append(Paragraph("<b>Instructions:</b> " + escape(instructions), st["small"]))

    # --- Questions ----------------------------------------------------------
    num = 0
    for sec in test.get("sections", []) or [{"name": "Questions"}]:
        sec_qs = [q for q in questions if q.get("section") == sec["name"]]
        if not sec_qs:
            continue
        sec_marks = _fmt_marks(sum(float(q.get("marks", 1)) for q in sec_qs))
        story.append(Paragraph(f"{escape(sec['name'])}  <font size=9>({sec_marks} marks)</font>", st["sec"]))
        if sec.get("instructions"):
            story.append(Paragraph(escape(sec["instructions"]), st["small"]))
        for q in sec_qs:
            num += 1
            block = [Paragraph(f"<b>Q{num}.</b> {escape(q['text'])} <font color='#6b7280'>[{_fmt_marks(q.get('marks', 1))}]</font>", st["q"])]
            t = q["type"]
            if t == "mcq":
                for j, o in enumerate(q.get("options", [])):
                    block.append(Paragraph(f"({chr(65 + j)}) {escape(o)}", st["opt"]))
                if include_answers:
                    ci = int(q.get("correctAnswer") or 0)
                    block.append(Paragraph(f"Answer: ({chr(65 + ci)}) {escape(q['options'][ci])}", st["ans"]))
            elif t == "fill_blank":
                if include_answers:
                    block.append(Paragraph("Answer: " + escape(" / ".join(q.get("correctAnswer") or [])), st["ans"]))
            elif t == "match":
                rights = shuffled_rights(q)
                rows = [[Paragraph("<b>Column A</b>", st["small"]), Paragraph("<b>Column B</b>", st["small"])]]
                for j, p in enumerate(q.get("pairs", [])):
                    rows.append([Paragraph(f"{j + 1}. {escape(p['left'])}", st["small"]),
                                 Paragraph(f"{chr(97 + j)}. {escape(rights[j])}", st["small"])])
                tbl = Table(rows, colWidths=[55 * mm, None])
                tbl.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                         ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff"))]))
                block.append(Spacer(1, 3))
                block.append(tbl)
                if include_answers:
                    key = ", ".join(f"{j + 1}→{chr(97 + rights.index(p['right']))}" for j, p in enumerate(q["pairs"]))
                    block.append(Paragraph("Answer: " + key, st["ans"]))
            else:
                if include_answers:
                    block.append(Paragraph("Model answer: " + escape(str(q.get("correctAnswer") or "")), st["ans"]))
                else:
                    lines = 4 if t == "short" else 10
                    for _ in range(lines):
                        block.append(Spacer(1, 14))
                        block.append(Table([[""]], colWidths=[None], style=[("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.lightgrey)]))
            block.append(Spacer(1, 8))
            story.append(KeepTogether(block))

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(18 * mm, 10 * mm, f"{org_name} · {test.get('title', '')}")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
