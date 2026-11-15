import re
import secrets

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import config
from ..db import get_db
from ..security import hash_password, require_admin
from ..services import mailer
from ..utils import not_found, now, oid, ser

router = APIRouter(prefix="/api/teams", tags=["teams"])
students_router = APIRouter(prefix="/api/students", tags=["students"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class InviteEntry(BaseModel):
    email: str
    name: str = ""


class InviteIn(BaseModel):
    students: list[InviteEntry]
    mode: str = "invite"  # "invite" = email link, "credentials" = create account with temp password


def _own_team(team_id, admin):
    team = get_db().teams.find_one({"_id": oid(team_id), "adminId": admin["_id"]})
    if not team:
        raise not_found("Team")
    return team


def _team_detail(team):
    db = get_db()
    students = [{"id": str(s["_id"]), "name": s["name"], "email": s["email"], "mustChangePassword": s.get("mustChangePassword", False)}
                for s in db.users.find({"_id": {"$in": team.get("students", [])}}).sort("name", 1)]
    d = ser(team)
    d["students"] = students
    d["invites"] = [{"id": str(i["_id"]), "email": i["email"], "name": i.get("name", ""), "status": i["status"],
                     "sentAt": ser(i.get("sentAt")), "link": f"{config.FRONTEND_URL}/invite/{i['token']}"}
                    for i in team.get("invites", [])]
    return d


@router.get("")
def list_teams(user=Depends(require_admin)):
    teams = get_db().teams.find({"adminId": user["_id"]}).sort("createdAt", -1)
    return {"teams": [{**ser({k: v for k, v in t.items() if k != "invites"}),
                       "studentCount": len(t.get("students", [])),
                       "pendingInvites": sum(1 for i in t.get("invites", []) if i["status"] == "pending")} for t in teams]}


@router.post("")
def create_team(body: TeamIn, user=Depends(require_admin)):
    doc = {"name": body.name.strip(), "description": body.description.strip(), "adminId": user["_id"], "students": [],
           "invites": [], "createdAt": now()}
    doc["_id"] = get_db().teams.insert_one(doc).inserted_id
    return {"team": _team_detail(doc)}


@router.get("/{team_id}")
def get_team(team_id: str, user=Depends(require_admin)):
    return {"team": _team_detail(_own_team(team_id, user))}


@router.put("/{team_id}")
def update_team(team_id: str, body: TeamIn, user=Depends(require_admin)):
    team = _own_team(team_id, user)
    get_db().teams.update_one({"_id": team["_id"]}, {"$set": {"name": body.name.strip(), "description": body.description.strip()}})
    return get_team(team_id, user)


@router.delete("/{team_id}")
def delete_team(team_id: str, user=Depends(require_admin)):
    team = _own_team(team_id, user)
    db = get_db()
    db.users.update_many({"teamIds": team["_id"]}, {"$pull": {"teamIds": team["_id"]}})
    db.tests.update_many({"adminId": user["_id"]}, {"$pull": {"assignedTeams": team["_id"]}})
    db.teams.delete_one({"_id": team["_id"]})
    return {"message": "Team deleted"}


@router.post("/{team_id}/invite")
def invite(team_id: str, body: InviteIn, user=Depends(require_admin)):
    team = _own_team(team_id, user)
    db = get_db()
    institution = (user.get("institution") or {}).get("name", "")
    results = []
    for entry in body.students:
        email = entry.email.strip().lower()
        name = entry.name.strip() or email.split("@")[0]
        if not EMAIL_RE.match(email):
            results.append({"email": email, "status": "error", "message": "Invalid email"})
            continue
        existing = db.users.find_one({"email": email})
        if existing:
            if existing["role"] != "student":
                results.append({"email": email, "status": "error", "message": "Email belongs to an admin"})
                continue
            if existing.get("adminId") == user["_id"]:
                db.users.update_one({"_id": existing["_id"]}, {"$addToSet": {"teamIds": team["_id"]}})
                db.teams.update_one({"_id": team["_id"]}, {"$addToSet": {"students": existing["_id"]}})
                results.append({"email": email, "status": "added", "message": "Existing student added to team"})
                continue
        if body.mode == "credentials" and not existing:
            temp = secrets.token_urlsafe(6)
            student = {"name": name, "email": email, "password": hash_password(temp), "role": "student", "adminId": user["_id"],
                       "teamIds": [team["_id"]], "mustChangePassword": True, "institution": {"name": "", "tagline": "", "logoPath": ""},
                       "createdAt": now()}
            student["_id"] = db.users.insert_one(student).inserted_id
            db.teams.update_one({"_id": team["_id"]}, {"$addToSet": {"students": student["_id"]}})
            sent = mailer.send_credentials(email, name, team["name"], user["name"], temp, f"{config.FRONTEND_URL}/login")
            results.append({"email": email, "status": "created", "emailSent": sent, "tempPassword": temp,
                            "message": "Account created" + ("" if sent else " (email not configured - share the password manually)")})
            continue
        # email invitation link
        db.teams.update_one({"_id": team["_id"]}, {"$pull": {"invites": {"email": email, "status": "pending"}}})
        token = secrets.token_urlsafe(24)
        inv = {"_id": ObjectId(), "email": email, "name": name, "token": token,
               "status": "pending", "sentAt": now()}
        db.teams.update_one({"_id": team["_id"]}, {"$push": {"invites": inv}})
        link = f"{config.FRONTEND_URL}/invite/{token}"
        sent = mailer.send_invite(email, team["name"], user["name"], institution, link)
        results.append({"email": email, "status": "invited", "emailSent": sent, "link": link,
                        "message": "Invitation sent" if sent else "Invitation created (email not configured - share the link)"})
    return {"results": results, "team": _team_detail(db.teams.find_one({"_id": team["_id"]}))}


@router.delete("/{team_id}/invites/{invite_id}")
def cancel_invite(team_id: str, invite_id: str, user=Depends(require_admin)):
    team = _own_team(team_id, user)
    get_db().teams.update_one({"_id": team["_id"]}, {"$pull": {"invites": {"_id": oid(invite_id)}}})
    return get_team(team_id, user)


@router.delete("/{team_id}/students/{student_id}")
def remove_student(team_id: str, student_id: str, user=Depends(require_admin)):
    team = _own_team(team_id, user)
    sid = oid(student_id)
    db = get_db()
    db.teams.update_one({"_id": team["_id"]}, {"$pull": {"students": sid}})
    db.users.update_one({"_id": sid}, {"$pull": {"teamIds": team["_id"]}})
    return get_team(team_id, user)


# ------------------------------------------------------------- students list ----

@students_router.get("")
def list_students(user=Depends(require_admin)):
    db = get_db()
    teams = {t["_id"]: t["name"] for t in db.teams.find({"adminId": user["_id"]})}
    out = []
    for s in db.users.find({"role": "student", "adminId": user["_id"]}).sort("name", 1):
        subs = list(db.submissions.find({"studentId": s["_id"], "status": {"$ne": "in_progress"}}))
        pct = [100 * x["totalScore"] / x["maxScore"] for x in subs if x.get("maxScore")]
        out.append({"id": str(s["_id"]), "name": s["name"], "email": s["email"],
                    "teams": [teams[t] for t in s.get("teamIds", []) if t in teams],
                    "testsTaken": len(subs), "averagePercent": round(sum(pct) / len(pct), 1) if pct else None})
    return {"students": out}


@students_router.post("/{student_id}/reset-password")
def reset_student_password(student_id: str, user=Depends(require_admin)):
    db = get_db()
    s = db.users.find_one({"_id": oid(student_id), "adminId": user["_id"], "role": "student"})
    if not s:
        raise not_found("Student")
    temp = secrets.token_urlsafe(6)
    db.users.update_one({"_id": s["_id"]}, {"$set": {"password": hash_password(temp), "mustChangePassword": True}})
    sent = mailer.send_credentials(s["email"], s["name"], "your team", user["name"], temp, f"{config.FRONTEND_URL}/login")
    return {"tempPassword": temp, "emailSent": sent}


@students_router.delete("/{student_id}")
def delete_student(student_id: str, user=Depends(require_admin)):
    db = get_db()
    s = db.users.find_one({"_id": oid(student_id), "adminId": user["_id"], "role": "student"})
    if not s:
        raise not_found("Student")
    db.teams.update_many({"adminId": user["_id"]}, {"$pull": {"students": s["_id"]}})
    db.tests.update_many({"adminId": user["_id"]}, {"$pull": {"assignedStudents": s["_id"]}})
    db.submissions.delete_many({"studentId": s["_id"]})
    db.users.delete_one({"_id": s["_id"]})
    return {"message": "Student removed"}
