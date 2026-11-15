from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .. import config
from ..db import get_db
from ..security import get_current_user, require_admin, require_student
from ..services import mailer, pdf
from ..services.questions import TYPES, allocate_marks, generate_questions, normalize_question
from ..utils import bad_request, forbidden, not_found, now, oid, oids, ser
from .submissions import finalize_if_expired

router = APIRouter(prefix="/api/tests", tags=["tests"])


class SectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    instructions: str = ""
    counts: dict[str, int] = {}


class TestIn(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = ""
    uploadIds: list[str] = []
    topicHint: str = ""
    duration: int = Field(30, ge=1, le=600)
    totalMarks: float = Field(20, gt=0, le=1000)
    difficulty: str = "medium"
    sections: list[SectionIn] = []
    allowOffline: bool = True
    dueDate: datetime | None = None


class TestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    uploadIds: list[str] | None = None
    topicHint: str | None = None
    duration: int | None = Field(None, ge=1, le=600)
    totalMarks: float | None = Field(None, gt=0, le=1000)
    difficulty: str | None = None
    sections: list[SectionIn] | None = None
    allowOffline: bool | None = None
    dueDate: datetime | None = None


class QuestionsIn(BaseModel):
    questions: list[dict]
    rescaleTo: float | None = None  # optionally re-scale marks to this total


class AssignIn(BaseModel):
    teamIds: list[str] = []
    studentIds: list[str] = []
    notify: bool = True


class PublishIn(BaseModel):
    publish: bool = True


def _sections(sections):
    out = []
    seen = set()
    for s in sections:
        name = s.name.strip()
        if name in seen:
            raise bad_request(f"Duplicate section name '{name}'")
        seen.add(name)
        out.append({"name": name, "instructions": s.instructions.strip(),
                    "counts": {t: max(0, min(50, int(s.counts.get(t, 0) or 0))) for t in TYPES}})
    return out


def _own_test(test_id, admin):
    test = get_db().tests.find_one({"_id": oid(test_id), "adminId": admin["_id"]})
    if not test:
        raise not_found("Test")
    return test


def _questions(test_id):
    return list(get_db().questions.find({"testId": test_id}).sort("order", 1))


def _student_ids_for(test):
    db = get_db()
    ids = set(test.get("assignedStudents", []))
    for team in db.teams.find({"_id": {"$in": test.get("assignedTeams", [])}}):
        ids.update(team.get("students", []))
    return list(ids)


def _is_assigned(test, student):
    if student["_id"] in test.get("assignedStudents", []):
        return True
    return any(t in test.get("assignedTeams", []) for t in student.get("teamIds", []))


# ---------------------------------------------------------------- admin ---------

@router.get("")
def list_tests(user=Depends(require_admin)):
    db = get_db()
    tests = list(db.tests.find({"adminId": user["_id"]}).sort("createdAt", -1))
    out = []
    for t in tests:
        d = ser(t)
        d["questionCount"] = db.questions.count_documents({"testId": t["_id"]})
        d["submissionCount"] = db.submissions.count_documents({"testId": t["_id"], "status": {"$ne": "in_progress"}})
        d["assignedCount"] = len(_student_ids_for(t))
        out.append(d)
    return {"tests": out}


@router.post("")
def create_test(body: TestIn, user=Depends(require_admin)):
    if body.difficulty not in {"easy", "medium", "hard", "mixed"}:
        raise bad_request("Invalid difficulty")
    sections = _sections(body.sections) or [{"name": "Section A", "instructions": "", "counts": {"mcq": 5, "fill_blank": 0, "match": 0, "short": 0, "long": 0}}]
    db = get_db()
    upload_ids = oids(body.uploadIds)
    if upload_ids and db.uploads.count_documents({"_id": {"$in": upload_ids}, "adminId": user["_id"]}) != len(upload_ids):
        raise bad_request("One or more uploads were not found")
    doc = {
        "title": body.title.strip(), "description": body.description.strip(), "adminId": user["_id"], "uploadIds": upload_ids,
        "topicHint": body.topicHint.strip(), "duration": body.duration, "totalMarks": body.totalMarks, "difficulty": body.difficulty,
        "sections": sections, "assignedTeams": [], "assignedStudents": [], "status": "draft", "allowOffline": body.allowOffline,
        "dueDate": body.dueDate.replace(tzinfo=None) if body.dueDate else None, "generatedWith": "",
        "createdAt": now(), "updatedAt": now(),
    }
    doc["_id"] = db.tests.insert_one(doc).inserted_id
    return {"test": ser(doc)}


@router.get("/assigned")
def assigned_tests(user=Depends(require_student)):
    db = get_db()
    tests = db.tests.find({
        "status": "published",
        "$or": [{"assignedStudents": user["_id"]}, {"assignedTeams": {"$in": user.get("teamIds", [])}}],
    }).sort("createdAt", -1)
    out = []
    for t in tests:
        sub = db.submissions.find_one({"testId": t["_id"], "studentId": user["_id"]})
        if sub:
            sub = finalize_if_expired(sub, t)
        admin = db.users.find_one({"_id": t["adminId"]}) or {}
        out.append({
            "id": str(t["_id"]), "title": t["title"], "description": t.get("description", ""), "duration": t["duration"],
            "totalMarks": t["totalMarks"], "difficulty": t.get("difficulty"), "allowOffline": t.get("allowOffline", True),
            "dueDate": ser(t.get("dueDate")), "questionCount": db.questions.count_documents({"testId": t["_id"]}),
            "institution": (admin.get("institution") or {}).get("name", ""),
            "submission": None if not sub else {
                "id": str(sub["_id"]), "status": sub["status"], "mode": sub.get("mode"), "totalScore": sub.get("totalScore", 0),
                "maxScore": sub.get("maxScore", 0), "submittedAt": ser(sub.get("submittedAt")), "needsReview": sub.get("needsReview", False),
            },
        })
    return {"tests": out}


@router.get("/{test_id}")
def get_test(test_id: str, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    d = ser(test)
    d["questions"] = ser(_questions(test["_id"]))
    db = get_db()
    d["uploads"] = [{"id": str(u["_id"]), "originalName": u["originalName"]} for u in db.uploads.find({"_id": {"$in": test.get("uploadIds", [])}})]
    d["teams"] = [{"id": str(t["_id"]), "name": t["name"], "studentCount": len(t.get("students", []))}
                  for t in db.teams.find({"_id": {"$in": test.get("assignedTeams", [])}})]
    d["assignedCount"] = len(_student_ids_for(test))
    return {"test": d}


@router.put("/{test_id}")
def update_test(test_id: str, body: TestUpdate, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    upd = {}
    data = body.model_dump(exclude_unset=True)
    for k in ("title", "description", "topicHint", "duration", "totalMarks", "difficulty", "allowOffline"):
        if k in data and data[k] is not None:
            upd[k] = data[k].strip() if isinstance(data[k], str) else data[k]
    if "difficulty" in upd and upd["difficulty"] not in {"easy", "medium", "hard", "mixed"}:
        raise bad_request("Invalid difficulty")
    if "dueDate" in data:
        upd["dueDate"] = body.dueDate.replace(tzinfo=None) if body.dueDate else None
    if body.uploadIds is not None:
        upd["uploadIds"] = oids(body.uploadIds)
    if body.sections is not None:
        upd["sections"] = _sections(body.sections)
    upd["updatedAt"] = now()
    get_db().tests.update_one({"_id": test["_id"]}, {"$set": upd})
    return get_test(test_id, user)


@router.delete("/{test_id}")
def delete_test(test_id: str, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    db = get_db()
    db.questions.delete_many({"testId": test["_id"]})
    db.submissions.delete_many({"testId": test["_id"]})
    db.tests.delete_one({"_id": test["_id"]})
    return {"message": "Test deleted"}


@router.post("/{test_id}/generate")
async def generate(test_id: str, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    db = get_db()
    if db.submissions.count_documents({"testId": test["_id"]}):
        raise bad_request("Students have already attempted this test; questions can no longer be regenerated.")
    uploads = list(db.uploads.find({"_id": {"$in": test.get("uploadIds", [])}}))
    source = "\n\n".join(f"[{u['originalName']}]\n{u.get('extractedText', '')}" for u in uploads if u.get("extractedText"))
    if not source.strip() and not test.get("topicHint"):
        raise bad_request("Select at least one upload with extracted text, or enter a topic, before generating.")
    try:
        qs, engine, warning = await run_in_threadpool(generate_questions, test, source)
    except ValueError as exc:
        raise bad_request(str(exc))
    db.questions.delete_many({"testId": test["_id"]})
    for q in qs:
        q["testId"] = test["_id"]
        q["createdAt"] = now()
    if qs:
        db.questions.insert_many(qs)
    db.tests.update_one({"_id": test["_id"]}, {"$set": {"generatedWith": engine, "updatedAt": now(),
                                                       "totalMarks": round(sum(q["marks"] for q in qs), 2) or test["totalMarks"]}})
    result = get_test(test_id, user)
    result["engine"] = engine
    result["warning"] = warning
    return result


@router.put("/{test_id}/questions")
def save_questions(test_id: str, body: QuestionsIn, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    db = get_db()
    if db.submissions.count_documents({"testId": test["_id"]}):
        raise bad_request("Students have already attempted this test; questions are locked.")
    section_names = {s["name"] for s in test.get("sections", [])}
    default_sec = test["sections"][0]["name"] if test.get("sections") else "Section A"
    normalized = []
    for i, raw in enumerate(body.questions):
        q = normalize_question(raw, default_sec)
        if not q:
            raise bad_request(f"Question {i + 1} is incomplete (check its text, options/pairs and answer).")
        if q["section"] not in section_names:
            q["section"] = default_sec
        q["marks"] = float(raw.get("marks") or q["marks"])
        normalized.append(q)
    if body.rescaleTo:
        allocate_marks(normalized, body.rescaleTo)
    sec_index = {s["name"]: i for i, s in enumerate(test.get("sections", []))}
    normalized.sort(key=lambda q: sec_index.get(q["section"], 99))
    old_ids = {str(q["_id"]) for q in _questions(test["_id"])}
    db.questions.delete_many({"testId": test["_id"]})
    for i, (raw, q) in enumerate(zip(body.questions, normalized)):
        q["order"] = i
        q["testId"] = test["_id"]
        q["createdAt"] = now()
        if raw.get("id") and str(raw["id"]) in old_ids:
            q["_id"] = oid(raw["id"])  # keep ids stable across edits
    if normalized:
        db.questions.insert_many(normalized)
    total = round(sum(q["marks"] for q in normalized), 2)
    db.tests.update_one({"_id": test["_id"]}, {"$set": {"totalMarks": total or test["totalMarks"], "updatedAt": now()}})
    return get_test(test_id, user)


@router.post("/{test_id}/publish")
def publish(test_id: str, body: PublishIn, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    db = get_db()
    if body.publish and not db.questions.count_documents({"testId": test["_id"]}):
        raise bad_request("Generate or add questions before publishing.")
    db.tests.update_one({"_id": test["_id"]}, {"$set": {"status": "published" if body.publish else "draft", "updatedAt": now()}})
    if body.publish and test["status"] != "published":
        _notify_students(test, _student_ids_for(test))
    return get_test(test_id, user)


@router.post("/{test_id}/assign")
def assign(test_id: str, body: AssignIn, user=Depends(require_admin)):
    test = _own_test(test_id, user)
    db = get_db()
    team_ids = oids(body.teamIds)
    student_ids = oids(body.studentIds)
    if team_ids and db.teams.count_documents({"_id": {"$in": team_ids}, "adminId": user["_id"]}) != len(team_ids):
        raise bad_request("One or more teams were not found")
    if student_ids and db.users.count_documents({"_id": {"$in": student_ids}, "adminId": user["_id"], "role": "student"}) != len(student_ids):
        raise bad_request("One or more students were not found")
    before = set(_student_ids_for(test))
    db.tests.update_one({"_id": test["_id"]}, {"$set": {"assignedTeams": team_ids, "assignedStudents": student_ids, "updatedAt": now()}})
    test = db.tests.find_one({"_id": test["_id"]})
    if body.notify and test["status"] == "published":
        _notify_students(test, [s for s in _student_ids_for(test) if s not in before])
    return get_test(test_id, user)


def _notify_students(test, student_ids):
    for s in get_db().users.find({"_id": {"$in": list(student_ids)}}):
        mailer.send_test_assigned(s["email"], s["name"], test["title"], f"{config.FRONTEND_URL}/student")


@router.get("/{test_id}/pdf")
def test_pdf(test_id: str, answers: bool = Query(False), user=Depends(get_current_user)):
    db = get_db()
    test = db.tests.find_one({"_id": oid(test_id)})
    if not test:
        raise not_found("Test")
    if user["role"] == "admin":
        if test["adminId"] != user["_id"]:
            raise forbidden()
    else:
        if test["status"] != "published" or not _is_assigned(test, user) or not test.get("allowOffline", True):
            raise forbidden("This paper is not available to you")
        answers = False
    admin = db.users.find_one({"_id": test["adminId"]}) or {}
    data = pdf.build_test_pdf(test, _questions(test["_id"]), admin.get("institution"), include_answers=answers)
    safe = "".join(c if c.isalnum() else "_" for c in test["title"])[:60]
    fname = f"{safe}{'_answer_key' if answers else ''}.pdf"
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fname}"'})


# -------------------------------------------------------------- student ---------

@router.get("/{test_id}/paper")
def paper(test_id: str, user=Depends(require_student)):
    """Question paper for students: no answers, explanations, or match pairings."""
    db = get_db()
    test = db.tests.find_one({"_id": oid(test_id)})
    if not test or test["status"] != "published" or not _is_assigned(test, user):
        raise not_found("Test")
    qs = []
    for q in _questions(test["_id"]):
        item = {"id": str(q["_id"]), "section": q["section"], "type": q["type"], "text": q["text"], "marks": q["marks"]}
        if q["type"] == "mcq":
            item["options"] = q.get("options", [])
        if q["type"] == "match":
            item["left"] = [p["left"] for p in q.get("pairs", [])]
            item["rightOptions"] = pdf.shuffled_rights(q)
        qs.append(item)
    admin = db.users.find_one({"_id": test["adminId"]}) or {}
    return {"test": {
        "id": str(test["_id"]), "title": test["title"], "description": test.get("description", ""), "duration": test["duration"],
        "totalMarks": test["totalMarks"], "sections": [{"name": s["name"], "instructions": s.get("instructions", "")} for s in test["sections"]],
        "allowOffline": test.get("allowOffline", True), "institution": admin.get("institution") or {}, "questions": qs,
    }}
