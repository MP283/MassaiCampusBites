"""Grading engine.

- MCQ / fill-in-the-blank / match are graded exactly (with tolerant text matching and partial credit for match).
- Short / long answers are graded by Gemini against the model answer; without a key a keyword-overlap
  estimate is used and the submission is flagged for teacher review.
- Offline (uploaded) answer sheets are read and graded by Gemini vision; without a key they await manual grading.
"""
import difflib
import json
import re

from . import gemini
from .mock_gen import STOP

OBJECTIVE = {"mcq", "fill_blank", "match"}


def _norm(s):
    s = str(s or "").lower().strip()
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _round(x, step=0.25):
    return round(round(x / step) * step, 2)


def _is_blank(resp):
    if resp is None:
        return True
    if isinstance(resp, str):
        return not resp.strip()
    if isinstance(resp, list):
        return all(_is_blank(r) for r in resp)
    if isinstance(resp, dict):
        return all(_is_blank(v) for v in resp.values())
    return False


def match_response_list(q, resp):
    """Normalise a match response into a list aligned with q['pairs'] (index -> chosen right text)."""
    n = len(q.get("pairs", []))
    if isinstance(resp, dict):
        return [resp.get(str(i), resp.get(i)) for i in range(n)]
    if isinstance(resp, list):
        return (resp + [None] * n)[:n]
    return [None] * n


def grade_objective(q, resp):
    marks = float(q.get("marks", 1))
    if _is_blank(resp):
        return {"score": 0, "isCorrect": False, "feedback": "Not answered.", "gradedBy": "auto"}
    t = q["type"]
    if t == "mcq":
        try:
            ok = int(resp) == int(q.get("correctAnswer", -1))
        except (TypeError, ValueError):
            ok = False
        correct_text = (q.get("options") or [""])[int(q.get("correctAnswer") or 0)] if q.get("options") else ""
        return {"score": marks if ok else 0, "isCorrect": ok,
                "feedback": "Correct." if ok else f"Incorrect. Correct answer: {correct_text}", "gradedBy": "auto"}
    if t == "fill_blank":
        given = _norm(resp)
        accepted = [_norm(a) for a in q.get("correctAnswer") or []]
        ok = given in accepted or any(
            len(a) > 4 and difflib.SequenceMatcher(None, given, a).ratio() >= 0.85 for a in accepted
        )
        return {"score": marks if ok else 0, "isCorrect": ok,
                "feedback": "Correct." if ok else f"Incorrect. Accepted answer: {', '.join(q.get('correctAnswer') or [])}",
                "gradedBy": "auto"}
    if t == "match":
        pairs = q.get("pairs", [])
        chosen = match_response_list(q, resp)
        right = sum(1 for p, c in zip(pairs, chosen) if c is not None and _norm(c) == _norm(p["right"]))
        score = _round(marks * right / max(1, len(pairs)))
        return {"score": score, "isCorrect": right == len(pairs),
                "feedback": f"{right} of {len(pairs)} pairs matched correctly.", "gradedBy": "auto"}
    raise ValueError(f"Not an objective type: {t}")


def _tokens(text):
    return {w for w in re.findall(r"[a-z][a-z\-]{3,}", str(text or "").lower()) if w not in STOP}


def heuristic_subjective(q, resp):
    marks = float(q.get("marks", 1))
    if _is_blank(resp):
        return {"score": 0, "isCorrect": False, "feedback": "Not answered.", "gradedBy": "auto"}
    key = _tokens(q.get("correctAnswer"))
    got = _tokens(resp)
    ratio = len(key & got) / max(1, len(key))
    score = _round(min(1.0, ratio * 1.3) * marks, 0.5)
    return {"score": score, "isCorrect": score >= marks * 0.6,
            "feedback": f"Estimated by keyword match ({int(ratio * 100)}% of key points mentioned). Awaiting teacher review.",
            "gradedBy": "pending"}


def _ai_grade_subjective(items):
    """items: list of (question, response). Returns {question_id: result}."""
    payload = [
        {"id": str(q["_id"]), "question": q["text"], "modelAnswer": q.get("correctAnswer", ""),
         "maxMarks": q.get("marks", 1), "studentAnswer": str(r)}
        for q, r in items
    ]
    prompt = (
        "You are a fair, consistent examiner. Grade each student answer against the model answer. "
        "Award partial credit in steps of 0.5 for correct key points; ignore spelling/grammar unless meaning changes. "
        "Give 1-2 sentences of constructive feedback addressed to the student (what was good, what was missing).\n"
        'Return ONLY JSON: {"results": [{"id": "...", "score": number, "feedback": "..."}]}\n\n'
        f"ANSWERS:\n{json.dumps(payload, ensure_ascii=False)}"
    )
    data = gemini.generate_json(prompt, temperature=0.1)
    out = {}
    for r in data.get("results", []):
        out[str(r.get("id"))] = r
    return out


def _clamp(score, marks):
    try:
        s = float(score)
    except (TypeError, ValueError):
        s = 0.0
    return _round(max(0.0, min(float(marks), s)), 0.5)


def grade_answers(questions, responses):
    """questions: list of question docs. responses: {qid_str: {"response":..., "markedForReview":...}}.
    Returns (answers, needs_review)."""
    answers = []
    subjective = []
    for q in questions:
        qid = str(q["_id"])
        r = responses.get(qid, {})
        resp = r.get("response")
        base = {"questionId": q["_id"], "response": resp, "markedForReview": bool(r.get("markedForReview")),
                "maxScore": float(q.get("marks", 1))}
        if q["type"] in OBJECTIVE:
            base.update(grade_objective(q, resp))
        elif _is_blank(resp):
            base.update({"score": 0, "isCorrect": False, "feedback": "Not answered.", "gradedBy": "auto"})
        else:
            subjective.append((q, resp, len(answers)))
        answers.append(base)

    needs_review = False
    if subjective:
        ai = {}
        if gemini.available():
            try:
                ai = _ai_grade_subjective([(q, r) for q, r, _ in subjective])
            except Exception as exc:  # noqa: BLE001
                print(f"[grading] Gemini grading failed, using heuristic: {exc}")
        for q, resp, idx in subjective:
            res = ai.get(str(q["_id"]))
            if res:
                score = _clamp(res.get("score"), q.get("marks", 1))
                answers[idx].update({"score": score, "isCorrect": score >= float(q.get("marks", 1)) * 0.6,
                                     "feedback": str(res.get("feedback") or ""), "gradedBy": "ai"})
            else:
                answers[idx].update(heuristic_subjective(q, resp))
                needs_review = True
    return answers, needs_review


def grade_offline(questions, files):
    """files: list of (path, mime). Returns (answers, needs_review, overall_feedback)."""
    blank_answers = [
        {"questionId": q["_id"], "response": None, "markedForReview": False, "maxScore": float(q.get("marks", 1)),
         "score": 0, "isCorrect": False, "feedback": "Awaiting teacher grading.", "gradedBy": "pending"}
        for q in questions
    ]
    if not gemini.available():
        return blank_answers, True, "Your answer sheet was received and is waiting to be graded by your teacher."

    qpayload = []
    for i, q in enumerate(questions, 1):
        item = {"id": str(q["_id"]), "number": i, "type": q["type"], "question": q["text"], "maxMarks": q.get("marks", 1)}
        if q["type"] == "mcq":
            item["options"] = {chr(65 + j): o for j, o in enumerate(q.get("options", []))}
            item["correctOption"] = chr(65 + int(q.get("correctAnswer") or 0))
        elif q["type"] == "match":
            item["correctPairs"] = q.get("pairs", [])
        else:
            item["modelAnswer"] = q.get("correctAnswer")
        qpayload.append(item)
    prompt = (
        "The attached file(s) are a student's handwritten or typed answer sheet for the exam below. "
        "Questions are numbered in the same order. For each question: transcribe the student's answer, "
        "grade it against the expected answer (partial credit in 0.5 steps; MCQ and fill-in-the-blank are all-or-nothing; "
        "match gets proportional credit), and give one sentence of feedback. If an answer cannot be found, score 0 "
        'and set response to "". Also write a 2-sentence overall feedback.\n'
        'Return ONLY JSON: {"results": [{"id": "...", "response": "...", "score": number, "feedback": "..."}], '
        '"overallFeedback": "..."}\n\n'
        f"EXAM:\n{json.dumps(qpayload, ensure_ascii=False)}"
    )
    try:
        data = gemini.generate_json(prompt, files=files, temperature=0.1)
    except Exception as exc:  # noqa: BLE001
        print(f"[grading] offline Gemini grading failed: {exc}")
        return blank_answers, True, "Your answer sheet was received and is waiting to be graded by your teacher."
    results = {str(r.get("id")): r for r in data.get("results", [])}
    for a, q in zip(blank_answers, questions):
        r = results.get(str(q["_id"]))
        if r:
            score = _clamp(r.get("score"), q.get("marks", 1))
            a.update({"response": r.get("response", ""), "score": score,
                      "isCorrect": score >= float(q.get("marks", 1)) * 0.6,
                      "feedback": str(r.get("feedback") or ""), "gradedBy": "ai"})
    return blank_answers, False, str(data.get("overallFeedback") or "")


def summarize(answers, questions):
    total = round(sum(float(a.get("score", 0)) for a in answers), 2)
    max_score = round(sum(float(q.get("marks", 1)) for q in questions), 2)
    return total, max_score


def overall_feedback(answers, questions):
    qmap = {str(q["_id"]): q for q in questions}
    concepts = {}
    for a in answers:
        q = qmap.get(str(a["questionId"]))
        if not q:
            continue
        c = concepts.setdefault(q.get("concept") or "General", [0.0, 0.0])
        c[0] += float(a.get("score", 0))
        c[1] += float(a.get("maxScore", 0))
    total, mx = summarize(answers, questions)
    pct = round(100 * total / mx) if mx else 0
    ranked = sorted(((s / m if m else 0, name) for name, (s, m) in concepts.items()))
    weak = [n for r, n in ranked if r < 0.5][:3]
    strong = [n for r, n in reversed(ranked) if r >= 0.75][:3]
    msg = f"You scored {total}/{mx} ({pct}%)."
    if strong:
        msg += f" Strong areas: {', '.join(strong)}."
    if weak:
        msg += f" Focus on: {', '.join(weak)}."
    if pct >= 85:
        msg += " Excellent work!"
    elif pct < 40:
        msg += " Review the material and the explanations below, then try a practice test."
    return msg
