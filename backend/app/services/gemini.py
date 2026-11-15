"""Thin wrapper around the Google Gemini API (google-genai SDK)."""
import json
import mimetypes
import re
from pathlib import Path

from .. import config

_client = None


def available() -> bool:
    return bool(config.GEMINI_API_KEY)


def _get_client():
    global _client
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _parse_json(text: str):
    text = (text or "").strip()
    # Strip markdown fences if the model added them
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fence:
        text = fence.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _file_part(path: str, mime: str | None = None):
    from google.genai import types

    mime = mime or mimetypes.guess_type(path)[0] or "application/octet-stream"
    return types.Part.from_bytes(data=Path(path).read_bytes(), mime_type=mime)


def generate_json(prompt: str, files: list[tuple[str, str | None]] | None = None, temperature: float = 0.6):
    """Ask Gemini for a JSON response. `files` is a list of (path, mime) to attach (images / PDFs)."""
    from google.genai import types

    contents = [_file_part(p, m) for p, m in (files or [])]
    contents.append(prompt)
    resp = _get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=temperature),
    )
    return _parse_json(resp.text)


def transcribe_file(path: str, mime: str | None = None) -> str:
    """Use Gemini's vision capability as an OCR engine."""
    from google.genai import types

    resp = _get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[
            _file_part(path, mime),
            "Transcribe ALL readable text in this document exactly as written. "
            "Keep headings, numbering and line breaks. Output plain text only, no commentary.",
        ],
        config=types.GenerateContentConfig(temperature=0),
    )
    return (resp.text or "").strip()
