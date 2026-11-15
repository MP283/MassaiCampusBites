from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr, Field

from .. import config
from ..db import get_db
from ..security import create_token, get_current_user, hash_password, require_admin, verify_password
from ..utils import bad_request, now, public_user
from .uploads import save_upload_file

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterAdmin(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    institutionName: str = ""


class Login(BaseModel):
    email: EmailStr
    password: str


class ChangePassword(BaseModel):
    currentPassword: str
    newPassword: str = Field(min_length=6, max_length=128)


class AcceptInvite(BaseModel):
    token: str
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=128)


class Institution(BaseModel):
    name: str = ""
    tagline: str = ""


def _auth_response(user):
    return {"token": create_token(user), "user": public_user(user)}


@router.post("/register-admin")
def register_admin(body: RegisterAdmin):
    db = get_db()
    email = body.email.lower()
    if db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    user = {
        "name": body.name.strip(), "email": email, "password": hash_password(body.password), "role": "admin",
        "teamIds": [], "mustChangePassword": False,
        "institution": {"name": body.institutionName.strip() or body.name.strip(), "tagline": "", "logoPath": ""},
        "createdAt": now(),
    }
    user["_id"] = db.users.insert_one(user).inserted_id
    return _auth_response(user)


@router.post("/login")
def login(body: Login):
    user = get_db().users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password", "")):
        raise HTTPException(401, "Invalid email or password")
    return _auth_response(user)


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"user": public_user(user)}


@router.post("/change-password")
def change_password(body: ChangePassword, user=Depends(get_current_user)):
    if not verify_password(body.currentPassword, user["password"]):
        raise bad_request("Current password is incorrect")
    if body.currentPassword == body.newPassword:
        raise bad_request("New password must be different")
    get_db().users.update_one({"_id": user["_id"]}, {"$set": {"password": hash_password(body.newPassword), "mustChangePassword": False}})
    user = get_db().users.find_one({"_id": user["_id"]})
    return {"message": "Password updated", "user": public_user(user)}


@router.get("/invite/{token}")
def invite_info(token: str):
    db = get_db()
    team = db.teams.find_one({"invites.token": token})
    if not team:
        raise HTTPException(404, "This invitation link is invalid or has expired")
    inv = next(i for i in team["invites"] if i["token"] == token)
    admin = db.users.find_one({"_id": team["adminId"]}) or {}
    existing = db.users.find_one({"email": inv["email"]})
    return {
        "email": inv["email"], "name": inv.get("name", ""), "status": inv["status"], "teamName": team["name"],
        "adminName": admin.get("name", ""), "institution": (admin.get("institution") or {}).get("name", ""),
        "accountExists": bool(existing),
    }


@router.post("/accept-invite")
def accept_invite(body: AcceptInvite):
    db = get_db()
    team = db.teams.find_one({"invites.token": body.token})
    if not team:
        raise HTTPException(404, "This invitation link is invalid or has expired")
    inv = next(i for i in team["invites"] if i["token"] == body.token)
    user = db.users.find_one({"email": inv["email"]})
    if user:
        if user["role"] != "student":
            raise bad_request("This email belongs to an admin account")
        if not verify_password(body.password, user["password"]):
            raise HTTPException(401, "An account already exists for this email. Enter its current password to join the team.")
    else:
        user = {
            "name": body.name.strip(), "email": inv["email"], "password": hash_password(body.password), "role": "student",
            "adminId": team["adminId"], "teamIds": [], "mustChangePassword": False,
            "institution": {"name": "", "tagline": "", "logoPath": ""}, "createdAt": now(),
        }
        user["_id"] = db.users.insert_one(user).inserted_id
    db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"teamIds": team["_id"]}})
    db.teams.update_one(
        {"_id": team["_id"], "invites.token": body.token},
        {"$addToSet": {"students": user["_id"]}, "$set": {"invites.$.status": "accepted"}},
    )
    user = db.users.find_one({"_id": user["_id"]})
    return _auth_response(user)


@router.put("/institution")
def update_institution(body: Institution, user=Depends(require_admin)):
    get_db().users.update_one({"_id": user["_id"]}, {"$set": {"institution.name": body.name.strip(), "institution.tagline": body.tagline.strip()}})
    return {"user": public_user(get_db().users.find_one({"_id": user["_id"]}))}


@router.post("/institution/logo")
async def upload_logo(file: UploadFile = File(...), user=Depends(require_admin)):
    if Path(file.filename or "").suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        raise bad_request("Logo must be a PNG or JPG image")
    saved = await save_upload_file(file, "logos", max_bytes=2 * 1024 * 1024)
    rel = f"logos/{saved.name}"
    old = (user.get("institution") or {}).get("logoPath")
    if old:
        (config.UPLOAD_ROOT / old).unlink(missing_ok=True)
    get_db().users.update_one({"_id": user["_id"]}, {"$set": {"institution.logoPath": rel}})
    return {"user": public_user(get_db().users.find_one({"_id": user["_id"]}))}
