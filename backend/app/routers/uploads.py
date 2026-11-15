import mimetypes
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from .. import config
from ..db import get_db
from ..security import require_admin
from ..services import ocr
from ..utils import bad_request, not_found, now, oid, ser

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


async def save_upload_file(file: UploadFile, sub: str, max_bytes: int = config.MAX_UPLOAD_BYTES) -> Path:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise bad_request(f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(config.ALLOWED_EXTENSIONS))}")
    data = await file.read()
    if len(data) > max_bytes:
        raise HTTPException(413, f"File too large (max {max_bytes // (1024 * 1024)} MB)")
    if not data:
        raise bad_request(f"'{file.filename}' is empty")
    dest = config.UPLOAD_ROOT / sub / f"{int(time.time() * 1000)}-{secrets.token_hex(6)}{ext}"
    dest.write_bytes(data)
    return dest


def _summary(doc):
    d = ser(doc)
    text = doc.get("extractedText", "")
    d["textLength"] = len(text)
    d["preview"] = text[:400]
    d.pop("extractedText", None)
    return d


@router.post("")
async def upload_content(files: list[UploadFile] = File(...), user=Depends(require_admin)):
    db = get_db()
    created = []
    for f in files:
        dest = await save_upload_file(f, "content")
        mime = f.content_type or mimetypes.guess_type(dest.name)[0]
        text, method, warning = await run_in_threadpool(ocr.extract_text, str(dest), mime)
        doc = {
            "originalName": f.filename, "adminId": user["_id"], "filePath": f"content/{dest.name}", "mimeType": mime,
            "size": dest.stat().st_size, "extractedText": text.strip(), "extractionMethod": method,
            "extractionWarning": warning, "createdAt": now(),
        }
        doc["_id"] = db.uploads.insert_one(doc).inserted_id
        created.append(_summary(doc))
    return {"uploads": created}


@router.get("")
def list_uploads(user=Depends(require_admin)):
    docs = get_db().uploads.find({"adminId": user["_id"]}).sort("createdAt", -1)
    return {"uploads": [_summary(d) for d in docs]}


@router.get("/{upload_id}")
def get_upload(upload_id: str, user=Depends(require_admin)):
    doc = get_db().uploads.find_one({"_id": oid(upload_id), "adminId": user["_id"]})
    if not doc:
        raise not_found("Upload")
    return {"upload": ser(doc)}


@router.put("/{upload_id}")
def update_upload_text(upload_id: str, body: dict, user=Depends(require_admin)):
    """Let the admin correct OCR output before generating questions."""
    text = str(body.get("extractedText", ""))
    res = get_db().uploads.update_one({"_id": oid(upload_id), "adminId": user["_id"]},
                                      {"$set": {"extractedText": text, "extractionWarning": ""}})
    if not res.matched_count:
        raise not_found("Upload")
    return {"upload": ser(get_db().uploads.find_one({"_id": oid(upload_id)}))}


@router.delete("/{upload_id}")
def delete_upload(upload_id: str, user=Depends(require_admin)):
    db = get_db()
    doc = db.uploads.find_one({"_id": oid(upload_id), "adminId": user["_id"]})
    if not doc:
        raise not_found("Upload")
    (config.UPLOAD_ROOT / doc["filePath"]).unlink(missing_ok=True)
    db.uploads.delete_one({"_id": doc["_id"]})
    db.tests.update_many({"adminId": user["_id"]}, {"$pull": {"uploadIds": doc["_id"]}})
    return {"message": "Deleted"}
