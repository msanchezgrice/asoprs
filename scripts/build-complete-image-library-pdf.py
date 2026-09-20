import json
import re
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

PAGE_WIDTH = 960
PAGE_HEIGHT = 540
NAVY = HexColor("#0B1426")
CORAL = HexColor("#F06E5F")
IVORY = HexColor("#F7F4EE")
IVORY_DARK = HexColor("#E9E4DA")
MUTED = HexColor("#677085")
WHITE = HexColor("#FFFFFF")


def ascii_text(value: str) -> str:
    replacements = {"\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u00a0": " ", "\u00b7": " - "}
    for source, replacement in replacements.items():
        value = value.replace(source, replacement)
    return value.encode("ascii", "replace").decode("ascii")


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    words = re.split(r"\s+", ascii_text(text).strip())
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped_text(canvas: Canvas, text: str, x: float, y: float, width: float, *, font: str, size: float, leading: float, max_lines: int) -> None:
    lines = wrap_text(text, font, size, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = f"{lines[-1].rstrip('.')}..."
    canvas.setFont(font, size)
    for line in lines:
        canvas.drawString(x, y, line)
        y -= leading


def draw_contained_image(canvas: Canvas, image_path: Path, x: float, y: float, width: float, height: float) -> None:
    with Image.open(image_path) as image:
        image_width, image_height = image.size
    scale = min(width / image_width, height / image_height)
    rendered_width = image_width * scale
    rendered_height = image_height * scale
    canvas.drawImage(ImageReader(str(image_path)), x + (width - rendered_width) / 2, y + (height - rendered_height) / 2, rendered_width, rendered_height, preserveAspectRatio=True, anchor="c")


def build_pdf(manifest_path: Path, output_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text())
    entries = manifest["entries"]
    project_root = manifest_path.resolve().parents[2]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas = Canvas(str(output_path), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    canvas.setTitle("ASOPRS Image Library - Complete")
    canvas.setAuthor("ASOPRS Study Portal")
    canvas.setSubject("Complete reviewed image library in curriculum order")

    for page_index, entry in enumerate(entries, start=1):
        canvas.setFillColor(WHITE)
        canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(50, 514, ascii_text(f'{entry["domainTitle"]} / {entry["sectionTitle"]}').upper())
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 18)
        title = ascii_text(entry["documentTitle"])
        if stringWidth(title, "Helvetica-Bold", 18) > 610:
            canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(50, 490, title)
        canvas.setFillColor(CORAL)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawRightString(910, 492, ascii_text(f'{entry["figureLabel"]} - Source page {entry["pageNumber"]}'))

        canvas.setFillColor(IVORY)
        canvas.setStrokeColor(IVORY_DARK)
        canvas.roundRect(50, 55, 560, 405, 12, fill=1, stroke=1)
        image_path = project_root / "public" / entry["imagePath"].lstrip("/")
        draw_contained_image(canvas, image_path, 64, 69, 532, 377)

        canvas.setFillColor(CORAL)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(650, 446, "DESCRIPTION")
        canvas.setFillColor(NAVY)
        caption = ascii_text(entry["caption"])
        caption_size = 13 if len(caption) < 220 else 11
        draw_wrapped_text(canvas, caption, 650, 417, 260, font="Helvetica", size=caption_size, leading=caption_size * 1.42, max_lines=16)

        canvas.setFillColor(MUTED)
        source = ascii_text(f'Source: {entry["sourcePdfPath"]}')
        draw_wrapped_text(canvas, source, 650, 83, 260, font="Helvetica", size=7.5, leading=10, max_lines=3)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(910, 32, f"ASOPRS Image Library - {page_index} of {len(entries)}")
        canvas.showPage()

    canvas.save()
    print(f"Wrote {len(entries)} image pages to {output_path}")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-complete-image-library-pdf.py <manifest.json> <output.pdf>")
    build_pdf(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()
