import mimetypes
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from .. import config
from ..db import get_db
from ..security import get_current_user, require_admin, require_student
from ..services import grading, ocr
from ..utils import bad_request, forbidden, not_found, now, oid, ser
from .uploads import save_upload_file

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

GRACE = timedelta(minutes=2)


class AnswerIn(BaseModel):
    questionId: str
    response: Any = None
    markedForReview: bool = False


class AnswersIn(BaseModel):
    answers: list[AnswerIn] = []


class GradeItem(BaseModel):
    questionId: str
    score: float
    feedback: str | None = None


class GradeIn(BaseModel):
    answers: list[GradeItem] = []
    overallFeedback: str | None = None


def _questions(test_id):
    return list(get_db().questions.find({"testId": test_id}).sort("order", 1))


def _ends_at(sub, test):
    return sub["startedAt"] + timedelta(minutes=int(test["duration"]))


def _responses_map(sub):
    return {str(a["questionId"]): {"response": a.get("response"), "markedForReview": a.get("markedForReview", False)}
            for a in sub.get("answers", [])}


def _finalize(sub, test, auto=False):
    """Grade an online submission and mark it submitted/graded."""
    questions = _questions(test["_id"])
    answers, needs_review = grading.grade_answers(questions, _responses_map(sub))
    total, max_score = grading.summarize(answers, questions)
    upd = {
        "answers": answers, "totalScore": total, "maxScore": max_score, "needsReview": needs_review,
        "status": "submitted" if needs_review else "graded", "submittedAt": now(), "autoSubmitted": auto,
        "overallFeedback": grading.overall_feedback(answers, questions),
    }
    get_db().submissions.update_one({"_id": sub["_id"]}, {"$set": upd})
    sub.update(upd)
    return sub


def finalize_if_expired(sub, test):
    if sub.get("status") == "in_progress" and sub.get("mode") == "online" and now() > _ends_at(sub, test) + GRACE:
        return _finalize(sub, test, auto=True)
    return sub


def _load_own(sub_id, student):
    db = get_db()
    sub = db.submissions.find_one({"_id": oid(sub_id), "studentId": student["_id"]})
    if not sub:
        raise not_found("Submission")
    test = db.tests.find_one({"_id": sub["testId"]})
    if not test:
        raise not_found("Test")
    return sub, test


def _assigned_published(test_id, student):
    test = get_db().tests.find_one({"_id": oid(test_id)})
    if not test or test["status"] != "published":
        raise not_found("Test")
    if student["_id"] not in test.get("assignedStudents", []) and not any(t in test.get("assignedTeams", []) for t in student.get("teamIds", [])):
        raise forbidden("This test is not assigned to you")
    return test


def _merge_answers(sub, answers_in):
    current = _responses_map(sub)
    for a in answers_in:
        current[a.questionId] = {"response": a.response, "markedForReview": a.markedForReview}
    return [{"questionId": oid(k), "response": v["response"], "markedForReview": v["markedForReview"]} for k, v in current.items()]


def _progress(sub, test):
    return {
        "submission": {
            "id": str(sub["_id"]), "status": sub["status"], "mode": sub.get("mode"),
            "startedAt": ser(sub["startedAt"]), "endsAt": ser(_ends_at(sub, test)), "serverNow": ser(now()),
            "answers": [{"questionId": str(a["questionId"]), "response": a.get("response"), "markedForReview": a.get("markedForReview", False)}
                        for a in sub.get("answers", [])],
        }
    }


# ------------------------------------------------------------ student: online ---

@router.post("/start/{test_id}")
def start(test_id: str, user=Depends(require_student)):
    db = get_db()
    test = _assigned_published(test_id, user)
    sub = db.submissions.find_one({"testId": test["_id"], "studentId": user["_id"]})
    if sub:
        sub = finalize_if_expired(sub, test)
        if sub["status"] != "in_progress":
            raise HTTPException(409, detail="You have already submitted this test.")
        return _progress(sub, test)
    if test.get("dueDate") and now() > test["dueDate"]:
        raise bad_request("The due date for this test has passed.")
    sub = {"testId": test["_id"], "studentId": user["_id"], "mode": "online", "answers": [], "files": [],
           "totalScore": 0, "maxScore": 0, "status": "in_progress", "startedAt": now(), "createdAt": now()}
    try:
        sub["_id"] = db.submissions.insert_one(sub).inserted_id
    except DuplicateKeyError:
        sub = db.submissions.find_one({"testId": test["_id"], "studentId": user["_id"]})
    return _progress(sub, test)


@router.put("/{sub_id}/answers")
def save_answers(sub_id: str, body: AnswersIn, user=Depends(require_student)):
    sub, test = _load_own(sub_id, user)
    sub = finalize_if_expired(sub, test)
    if sub["status"] != "in_progress":
        raise HTTPException(409, detail="Time is up: this test has been submitted.")
    merged = _merge_answers(sub, body.answers)
    get_db().submissions.update_one({"_id": sub["_id"]}, {"$set": {"answers": merged, "updatedAt": now()}})
    return {"saved": True, "endsAt": ser(_ends_at(sub, test)), "serverNow": ser(now())}


@router.post("/{sub_id}/submit")
async def submit(sub_id: str, body: AnswersIn, user=Depends(require_student)):
    sub, test = _load_own(sub_id, user)
    if sub["status"] != "in_progress":
        raise HTTPException(409, detail="This test has already been submitted.")
    late = now() > _ends_at(sub, test) + GRACE
    if not late:  # answers sent after the grace period are ignored
        sub["answers"] = _merge_answers(sub, body.answers)
    sub = await run_in_threadpool(_finalize, sub, test, late)
    return {"submissionId": str(sub["_id"]), "status": sub["status"], "totalScore": sub["totalScore"], "maxScore": sub["maxScore"]}


# ----------------------------------------------------------- student: offline ---

@router.post("/offline/{test_id}")
async def submit_offline(test_id: str, files: list[UploadFile] = File(...), user=Depends(require_student)):
    db = get_db()
    test = _assigned_published(test_id, user)
    if not test.get("allowOffline", True):
        raise bad_request("Offline submission is not enabled for this test.")
    existing = db.submissions.find_one({"testId": test["_id"], "studentId": user["_id"]})
    if existing and existing["status"] != "in_progress":
        raise HTTPException(409, detail="You have already submitted this test.")
    if not files:
        raise bad_request("Attach at least one image or PDF of your answer sheet.")
    saved = []
    for f in files[:10]:
        dest = await save_upload_file(f, "submissions")
        saved.append({"originalName": f.filename, "filePath": f"submissions/{dest.name}",
                      "mimeType": f.content_type or mimetypes.guess_type(dest.name)[0]})
    questions = _questions(test["_id"])
    file_args = [(str(config.UPLOAD_ROOT / s["filePath"]), s["mimeType"]) for s in saved]

    def work():
        texts = []
        if not grading.gemini.available():
            for path, mime in file_args:
                t, _, _ = ocr.extract_text(path, mime)
                if t.strip():
                    texts.append(t.strip())
        answers, needs_review, overall = grading.grade_offline(questions, file_args)
        return answers, needs_review, overall, "\n\n".join(texts)

    answers, needs_review, overall, extracted = await run_in_threadpool(work)
    total, max_score = grading.summarize(answers, questions)
    doc = {"testId": test["_id"], "studentId": user["_id"], "mode": "offline", "answers": answers, "files": saved,
           "extractedText": extracted, "totalScore": total, "maxScore": max_score, "needsReview": needs_review,
           "status": "submitted" if needs_review else "graded", "overallFeedback": overall or grading.overall_feedback(answers, questions),
           "startedAt": existing["startedAt"] if existing else now(), "submittedAt": now(), "createdAt": now()}
    if existing:
        db.submissions.replace_one({"_id": existing["_id"]}, doc)
        doc["_id"] = existing["_id"]
    else:
        doc["_id"] = db.submissions.insert_one(doc).inserted_id
    return {"submissionId": str(doc["_id"]), "status": doc["status"], "totalScore": total, "maxScore": max_score}


@router.get("/mine")
def my_submissions(user=Depends(require_student)):
    db = get_db()
    out = []
    for s in db.submissions.find({"studentId": user["_id"], "status": {"$ne": "in_progress"}}).sort("submittedAt", -1):
        t = db.tests.find_one({"_id": s["testId"]}) or {}
        out.append({"id": str(s["_id"]), "testId": str(s["testId"]), "testTitle": t.get("title", "(deleted)"), "mode": s.get("mode"),
                    "status": s["status"], "totalScore": s.get("totalScore", 0), "maxScore": s.get("maxScore", 0),
                    "submittedAt": ser(s.get("submittedAt")), "needsReview": s.get("needsReview", False)})
    return {"submissions": out}


# ---------------------------------------------------------------- shared ----------

@router.get("/{sub_id}")
def get_result(sub_id: str, user=Depends(get_current_user)):
    db = get_db()
    sub = db.submissions.find_one({"_id": oid(sub_id)})
    if not sub:
        raise not_found("Submission")
    test = db.tests.find_one({"_id": sub["testId"]})
    if not test:
        raise not_found("Test")
    if user["role"] == "student":
        if sub["studentId"] != user["_id"]:
            raise forbidden()
        sub = finalize_if_expired(sub, test)
        if sub["status"] == "in_progress":
            raise bad_request("This test is still in progress.")
    elif test["adminId"] != user["_id"]:
        raise forbidden()
    student = db.users.find_one({"_id": sub["studentId"]}) or {}
    amap = {str(a["questionId"]): a for a in sub.get("answers", [])}
    items = []
    for q in _questions(test["_id"]):
        a = amap.get(str(q["_id"]), {})
        item = ser(q)
        item.update({"response": a.get("response"), "score": a.get("score", 0), "maxScore": a.get("maxScore", q.get("marks", 1)),
                     "isCorrect": a.get("isCorrect"), "feedback": a.get("feedback", ""), "gradedBy": a.get("gradedBy", "")})
        if q["type"] == "match":
            from ..services.pdf import shuffled_rights
            item["rightOptions"] = shuffled_rights(q)
            item["response"] = grading.match_response_list(q, a.get("response"))
        items.append(item)
    out = ser({k: v for k, v in sub.items() if k != "answers"})
    out.update({"testTitle": test["title"], "duration": test["duration"], "studentName": student.get("name", ""),
                "studentEmail": student.get("email", ""), "questions": items,
                "files": [{**f, "url": f"/uploads/{f['filePath']}"} for f in sub.get("files", [])]})
    return {"submission": out}


# ----------------------------------------------------------------- admin ----------

@router.get("/test/{test_id}")
def list_for_test(test_id: str, user=Depends(require_admin)):
    db = get_db()
    test = db.tests.find_one({"_id": oid(test_id), "adminId": user["_id"]})
    if not test:
        raise not_found("Test")
    out = []
    for s in db.submissions.find({"testId": test["_id"]}).sort("submittedAt", -1):
        s = finalize_if_expired(s, test)
        st = db.users.find_one({"_id": s["studentId"]}) or {}
        out.append({"id": str(s["_id"]), "studentId": str(s["studentId"]), "studentName": st.get("name", "?"), "studentEmail": st.get("email", ""),
                    "mode": s.get("mode"), "status": s["status"], "totalScore": s.get("totalScore", 0), "maxScore": s.get("maxScore", 0),
                    "needsReview": s.get("needsReview", False), "submittedAt": ser(s.get("submittedAt")), "startedAt": ser(s.get("startedAt")),
                    "autoSubmitted": s.get("autoSubmitted", False)})
    return {"test": {"id": str(test["_id"]), "title": test["title"], "totalMarks": test["totalMarks"]}, "submissions": out}


@router.put("/{sub_id}/grade")
def override_grades(sub_id: str, body: GradeIn, user=Depends(require_admin)):
    db = get_db()
    sub = db.submissions.find_one({"_id": oid(sub_id)})
    if not sub:
        raise not_found("Submission")
    test = db.tests.find_one({"_id": sub["testId"], "adminId": user["_id"]})
    if not test:
        raise forbidden()
    if sub["status"] == "in_progress":
        raise bad_request("The student has not submitted yet.")
    questions = _questions(test["_id"])
    qmap = {str(q["_id"]): q for q in questions}
    amap = {str(a["questionId"]): a for a in sub.get("answers", [])}
    for g in body.answers:
        q = qmap.get(g.questionId)
        if not q:
            continue
        a = amap.setdefault(g.questionId, {"questionId": q["_id"], "response": None, "markedForReview": False})
        a["maxScore"] = float(q.get("marks", 1))
        a["score"] = max(0.0, min(a["maxScore"], float(g.score)))
        a["isCorrect"] = a["score"] >= a["maxScore"] * 0.6
        if g.feedback is not None:
            a["feedback"] = g.feedback
        a["gradedBy"] = "admin"
    answers = [amap[str(q["_id"])] for q in questions if str(q["_id"]) in amap]
    total, max_score = grading.summarize(answers, questions)
    upd = {"answers": answers, "totalScore": total, "maxScore": max_score, "status": "graded", "needsReview": False, "gradedAt": now()}
    upd["overallFeedback"] = body.overallFeedback if body.overallFeedback is not None else grading.overall_feedback(answers, questions)
    db.submissions.update_one({"_id": sub["_id"]}, {"$set": upd})
    return get_result(sub_id, user)


@router.delete("/{sub_id}")
def reset_submission(sub_id: str, user=Depends(require_admin)):
    """Allow a student to retake a test."""
    db = get_db()
    sub = db.submissions.find_one({"_id": oid(sub_id)})
    if not sub or not db.tests.find_one({"_id": sub["testId"], "adminId": user["_id"]}):
        raise not_found("Submission")
    db.submissions.delete_one({"_id": sub["_id"]})
    return {"message": "Submission reset; the student can attempt the test again."}
