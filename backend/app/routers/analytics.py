from collections import defaultdict

from fastapi import APIRouter, Depends

from ..db import get_db
from ..security import require_admin, require_student
from ..services.questions import TYPE_LABELS
from ..utils import not_found, oid, ser

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

BUCKETS = ["0-20", "21-40", "41-60", "61-80", "81-100"]


def _pct(score, mx):
    return round(100 * score / mx, 1) if mx else 0.0


def _bucket(p):
    if p <= 20:
        return "0-20"
    if p <= 40:
        return "21-40"
    if p <= 60:
        return "41-60"
    if p <= 80:
        return "61-80"
    return "81-100"


def _concept_and_type_stats(subs):
    db = get_db()
    test_ids = list({s["testId"] for s in subs})
    qmap = {q["_id"]: q for q in db.questions.find({"testId": {"$in": test_ids}})}
    concepts = defaultdict(lambda: [0.0, 0.0, 0])
    types = defaultdict(lambda: [0.0, 0.0, 0])
    for s in subs:
        for a in s.get("answers", []):
            q = qmap.get(a["questionId"])
            if not q:
                continue
            for bucket, key in ((concepts, q.get("concept") or "General"), (types, q["type"])):
                bucket[key][0] += float(a.get("score", 0))
                bucket[key][1] += float(a.get("maxScore", q.get("marks", 1)))
                bucket[key][2] += 1
    concept_list = sorted(
        [{"concept": k, "score": round(v[0], 2), "max": round(v[1], 2), "percent": _pct(v[0], v[1]), "questions": v[2]} for k, v in concepts.items()],
        key=lambda x: x["percent"])
    type_list = [{"type": k, "label": TYPE_LABELS.get(k, k), "score": round(v[0], 2), "max": round(v[1], 2),
                  "percent": _pct(v[0], v[1]), "questions": v[2]} for k, v in types.items()]
    return concept_list, type_list


@router.get("/me")
def my_analytics(user=Depends(require_student)):
    db = get_db()
    subs = list(db.submissions.find({"studentId": user["_id"], "status": {"$ne": "in_progress"}}).sort("submittedAt", 1))
    tests = {t["_id"]: t for t in db.tests.find({"_id": {"$in": [s["testId"] for s in subs]}})}
    trend = []
    for s in subs:
        t = tests.get(s["testId"])
        if not t:
            continue
        # class average for comparison
        others = list(db.submissions.find({"testId": s["testId"], "status": {"$ne": "in_progress"}}, {"totalScore": 1, "maxScore": 1}))
        avg = sum(_pct(o["totalScore"], o["maxScore"]) for o in others) / len(others) if others else 0
        trend.append({"testId": str(t["_id"]), "submissionId": str(s["_id"]), "title": t["title"], "date": ser(s.get("submittedAt")),
                      "score": s.get("totalScore", 0), "max": s.get("maxScore", 0), "percent": _pct(s.get("totalScore", 0), s.get("maxScore", 0)),
                      "classAverage": round(avg, 1), "mode": s.get("mode"), "status": s["status"]})
    concepts, types = _concept_and_type_stats(subs)
    pcts = [x["percent"] for x in trend]
    assigned = db.tests.count_documents({"status": "published", "$or": [{"assignedStudents": user["_id"]}, {"assignedTeams": {"$in": user.get("teamIds", [])}}]})
    answered = sum(1 for s in subs for a in s.get("answers", []) if a.get("isCorrect") is not None)
    correct = sum(1 for s in subs for a in s.get("answers", []) if a.get("isCorrect"))
    return {
        "kpis": {
            "testsTaken": len(trend), "testsAssigned": assigned, "pending": max(0, assigned - len(trend)),
            "averagePercent": round(sum(pcts) / len(pcts), 1) if pcts else 0, "bestPercent": max(pcts) if pcts else 0,
            "latestPercent": pcts[-1] if pcts else 0, "accuracy": _pct(correct, answered),
        },
        "trend": trend, "concepts": concepts, "types": types,
        "strengths": [c["concept"] for c in reversed(concepts) if c["percent"] >= 75][:5],
        "weaknesses": [c["concept"] for c in concepts if c["percent"] < 50][:5],
    }


@router.get("/overview")
def overview(user=Depends(require_admin)):
    db = get_db()
    tests = list(db.tests.find({"adminId": user["_id"]}))
    test_ids = [t["_id"] for t in tests]
    subs = list(db.submissions.find({"testId": {"$in": test_ids}, "status": {"$ne": "in_progress"}}))
    students = {s["_id"]: s for s in db.users.find({"role": "student", "adminId": user["_id"]})}
    dist = {b: 0 for b in BUCKETS}
    for s in subs:
        dist[_bucket(_pct(s.get("totalScore", 0), s.get("maxScore", 0)))] += 1
    per_test = []
    for t in tests:
        ts = [s for s in subs if s["testId"] == t["_id"]]
        p = [_pct(s["totalScore"], s["maxScore"]) for s in ts]
        per_test.append({"testId": str(t["_id"]), "title": t["title"], "status": t["status"], "attempts": len(ts),
                         "average": round(sum(p) / len(p), 1) if p else 0, "highest": max(p) if p else 0, "lowest": min(p) if p else 0})
    per_student = defaultdict(list)
    for s in subs:
        per_student[s["studentId"]].append(_pct(s["totalScore"], s["maxScore"]))
    leaderboard = sorted(
        [{"studentId": str(k), "name": students[k]["name"] if k in students else "?", "tests": len(v), "average": round(sum(v) / len(v), 1)}
         for k, v in per_student.items()], key=lambda x: -x["average"])
    concepts, types = _concept_and_type_stats(subs)
    recent = []
    for s in sorted(subs, key=lambda x: x.get("submittedAt") or x["startedAt"], reverse=True)[:8]:
        t = next((x for x in tests if x["_id"] == s["testId"]), {})
        st = students.get(s["studentId"], {})
        recent.append({"id": str(s["_id"]), "testTitle": t.get("title", ""), "studentName": st.get("name", "?"), "status": s["status"],
                       "percent": _pct(s["totalScore"], s["maxScore"]), "submittedAt": ser(s.get("submittedAt")), "needsReview": s.get("needsReview", False)})
    all_p = [_pct(s["totalScore"], s["maxScore"]) for s in subs]
    return {
        "kpis": {
            "students": len(students), "teams": db.teams.count_documents({"adminId": user["_id"]}), "tests": len(tests),
            "published": sum(1 for t in tests if t["status"] == "published"), "submissions": len(subs),
            "averagePercent": round(sum(all_p) / len(all_p), 1) if all_p else 0,
            "needsReview": sum(1 for s in subs if s.get("needsReview")),
            "uploads": db.uploads.count_documents({"adminId": user["_id"]}),
        },
        "distribution": [{"range": b, "count": dist[b]} for b in BUCKETS],
        "perTest": per_test, "leaderboard": leaderboard[:10], "concepts": concepts, "types": types, "recent": recent,
    }


@router.get("/test/{test_id}")
def test_analytics(test_id: str, user=Depends(require_admin)):
    db = get_db()
    test = db.tests.find_one({"_id": oid(test_id), "adminId": user["_id"]})
    if not test:
        raise not_found("Test")
    subs = list(db.submissions.find({"testId": test["_id"], "status": {"$ne": "in_progress"}}))
    questions = list(db.questions.find({"testId": test["_id"]}).sort("order", 1))
    dist = {b: 0 for b in BUCKETS}
    for s in subs:
        dist[_bucket(_pct(s["totalScore"], s["maxScore"]))] += 1
    per_q = []
    for i, q in enumerate(questions, 1):
        scores = [a for s in subs for a in s.get("answers", []) if a["questionId"] == q["_id"]]
        got = sum(float(a.get("score", 0)) for a in scores)
        mx = sum(float(a.get("maxScore", q["marks"])) for a in scores)
        per_q.append({"number": i, "questionId": str(q["_id"]), "text": q["text"][:120], "type": q["type"], "concept": q.get("concept"),
                      "attempts": len(scores), "percent": _pct(got, mx)})
    students = {u["_id"]: u for u in db.users.find({"_id": {"$in": [s["studentId"] for s in subs]}})}
    rows = sorted([{"submissionId": str(s["_id"]), "name": students.get(s["studentId"], {}).get("name", "?"),
                    "score": s["totalScore"], "max": s["maxScore"], "percent": _pct(s["totalScore"], s["maxScore"]), "status": s["status"]}
                   for s in subs], key=lambda r: -r["percent"])
    p = [r["percent"] for r in rows]
    concepts, types = _concept_and_type_stats(subs)
    return {"test": {"id": str(test["_id"]), "title": test["title"]},
            "kpis": {"attempts": len(subs), "average": round(sum(p) / len(p), 1) if p else 0, "highest": max(p) if p else 0, "lowest": min(p) if p else 0},
            "distribution": [{"range": b, "count": dist[b]} for b in BUCKETS], "questions": per_q, "students": rows,
            "concepts": concepts, "types": types}
