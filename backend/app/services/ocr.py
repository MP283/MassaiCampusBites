"""Text extraction from uploaded content: plain text, PDFs (text layer) and images (OCR).

Image OCR uses Tesseract (via pytesseract) when the binary is installed; otherwise Gemini vision.
"""
import os
import shutil
from pathlib import Path

from .. import config
from . import gemini

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
_WINDOWS_TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def _tesseract_cmd():
    if config.TESSERACT_CMD and Path(config.TESSERACT_CMD).exists():
        return config.TESSERACT_CMD
    found = shutil.which("tesseract")
    if found:
        return found
    if os.name == "nt" and Path(_WINDOWS_TESSERACT).exists():
        return _WINDOWS_TESSERACT
    return None


def tesseract_available() -> bool:
    return _tesseract_cmd() is not None


def _ocr_tesseract(path: str) -> str:
    import pytesseract
    from PIL import Image

    pytesseract.pytesseract.tesseract_cmd = _tesseract_cmd()
    with Image.open(path) as img:
        return pytesseract.image_to_string(img.convert("RGB"))


def _pdf_text(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def extract_text(path: str, mime: str | None = None):
    """Returns (text, method, warning)."""
    ext = Path(path).suffix.lower()
    try:
        if ext in {".txt", ".md"}:
            return Path(path).read_text(encoding="utf-8", errors="ignore"), "text", ""

        if ext == ".pdf":
            text = _pdf_text(path)
            if len(text.strip()) >= 50:
                return text, "pdf-text", ""
            if gemini.available():
                return gemini.transcribe_file(path, "application/pdf"), "gemini-vision", ""
            return text, "pdf-text", (
                "This PDF looks scanned (no text layer). Add a GEMINI_API_KEY for AI OCR, "
                "or upload the pages as images with Tesseract installed."
            )

        if ext in IMAGE_EXT:
            if tesseract_available():
                text = _ocr_tesseract(path)
                if text.strip():
                    return text, "tesseract", ""
            if gemini.available():
                return gemini.transcribe_file(path, mime), "gemini-vision", ""
            return "", "none", (
                "No OCR engine available. Install Tesseract OCR or set GEMINI_API_KEY to read images."
            )
    except Exception as exc:  # noqa: BLE001
        print(f"[ocr] extraction failed for {path}: {exc}")
        return "", "error", f"Text extraction failed: {exc}"
    return "", "none", f"Unsupported file type {ext}"
