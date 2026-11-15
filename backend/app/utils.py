from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException


def now():
    """Naive UTC datetime (what pymongo returns by default)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def oid(value, name="id"):
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid {name}")


def oids(values):
    return [oid(v) for v in (values or [])]


def ser(value):
    """Recursively convert Mongo documents into JSON-friendly dicts (_id -> id, ObjectId -> str)."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat() + "Z"
    if isinstance(value, list):
        return [ser(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k == "password":
                continue
            out["id" if k == "_id" else k] = ser(v)
        return out
    return value


def public_user(user):
    if not user:
        return None
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "adminId": str(user["adminId"]) if user.get("adminId") else None,
        "teamIds": [str(t) for t in user.get("teamIds", [])],
        "mustChangePassword": bool(user.get("mustChangePassword")),
        "institution": user.get("institution") or {"name": "", "tagline": "", "logoPath": ""},
    }


def not_found(what="Resource"):
    return HTTPException(status_code=404, detail=f"{what} not found")


def bad_request(msg):
    return HTTPException(status_code=400, detail=msg)


def forbidden(msg="You do not have permission for this action"):
    return HTTPException(status_code=403, detail=msg)
