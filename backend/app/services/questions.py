"""Question normalisation, mark allocation, and AI / mock question generation."""
import random
import re

from . import gemini, mock_gen

TYPES = ["mcq", "fill_blank", "match", "short", "long"]
TYPE_LABELS = {
    "mcq": "Multiple choice",
    "fill_blank": "Fill in the blank",
    "match": "Match the following",
    "short": "Short answer",
    "long": "Long answer",
}
DEFAULT_WEIGHT = {"mcq": 1, "fill_blank": 1, "match": 2, "short": 3, "long": 5}
BLANK = "_____"


def _as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def normalize_question(q: dict, default_section: str = "Section A"):
    """Coerce an arbitrary question dict (from AI or the editor) into the canonical shape. Returns None if unusable."""
    qtype = str(q.get("type", "")).strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {"multiple_choice": "mcq", "fill_in_the_blank": "fill_blank", "fill_in_the_blanks": "fill_blank",
               "fill": "fill_blank", "matching": "match", "match_the_following": "match",
               "short_answer": "short", "long_answer": "long", "written": "long", "essay": "long"}
    qtype = aliases.get(qtype, qtype)
    if qtype not in TYPES:
        return None
    text = str(q.get("text") or q.get("question") or "").strip()
    if not text:
        return None

    out = {
        "section": str(q.get("section") or default_section).strip() or default_section,
        "type": qtype,
        "text": text,
        "options": [],
        "pairs": [],
        "correctAnswer": None,
        "marks": _num(q.get("marks"), DEFAULT_WEIGHT[qtype]),
        "concept": str(q.get("concept") or "General").strip()[:80] or "General",
        "difficulty": str(q.get("difficulty") or "medium").lower(),
        "explanation": str(q.get("explanation") or "").strip(),
    }

    if qtype == "mcq":
        options = [str(o).strip() for o in _as_list(q.get("options")) if str(o).strip()]
        # Strip "A) " / "a. " style prefixes
        options = [re.sub(r"^\(?[A-Ha-h][\).:]\s+", "", o) for o in options]
        if len(options) < 2:
            return None
        out["options"] = options[:6]
        out["correctAnswer"] = _mcq_index(q.get("correctAnswer", q.get("answer")), out["options"])
    elif qtype == "fill_blank":
        answers = [str(a).strip() for a in _as_list(q.get("correctAnswer", q.get("answer"))) if str(a).strip()]
        if not answers:
            return None
        if "___" not in text:
            out["text"] = text.rstrip() + f" {BLANK}"
        else:
            out["text"] = re.sub(r"_{3,}", BLANK, text)
        out["correctAnswer"] = answers
    elif qtype == "match":
        pairs = []
        for p in _as_list(q.get("pairs")):
            if isinstance(p, dict) and str(p.get("left", "")).strip() and str(p.get("right", "")).strip():
                pairs.append({"left": str(p["left"]).strip(), "right": str(p["right"]).strip()})
        if len(pairs) < 2:
            return None
        out["pairs"] = pairs[:8]
        out["correctAnswer"] = None
    else:  # short / long
        ans = q.get("correctAnswer", q.get("modelAnswer", q.get("answer")))
        if isinstance(ans, list):
            ans = " ".join(str(a) for a in ans)
        out["correctAnswer"] = str(ans or "").strip()
    return out


def _num(v, default):
    try:
        n = float(v)
        return n if n > 0 else float(default)
    except (TypeError, ValueError):
        return float(default)


def _mcq_index(ans, options):
    if isinstance(ans, bool):
        return 0
    if isinstance(ans, (int, float)):
        i = int(ans)
        return i if 0 <= i < len(options) else 0
    s = str(ans or "").strip()
    if s.isdigit():
        i = int(s)
        return i if 0 <= i < len(options) else 0
    m = re.match(r"^\(?([A-Ha-h])[\).:]?(\s|$)", s)
    if m and len(s) <= 3:
        i = ord(m.group(1).upper()) - 65
        if 0 <= i < len(options):
            return i
    low = s.lower()
    for i, o in enumerate(options):
        if o.lower() == low:
            return i
    for i, o in enumerate(options):
        if low and (low in o.lower() or o.lower() in low):
            return i
    return 0


def allocate_marks(questions: list[dict], total: float):
    """Scale question weights so marks sum exactly to `total`, in steps of 0.5 (min 0.5 each)."""
    n = len(questions)
    if not n:
        return questions
    weights = [q.get("marks") or DEFAULT_WEIGHT[q["type"]] for q in questions]
    units = max(n, int(round(float(total) * 2)))
    s = sum(weights)
    raw = [w / s * units for w in weights]
    base = [max(1, int(r)) for r in raw]
    diff = units - sum(base)
    order = sorted(range(n), key=lambda i: raw[i] - int(raw[i]), reverse=diff > 0)
    guard = 0
    while diff != 0 and guard < 10 * (n + units):
        j = order[guard % n]
        if diff > 0:
            base[j] += 1
            diff -= 1
        elif base[j] > 1:
            base[j] -= 1
            diff += 1
        guard += 1
    for q, b in zip(questions, base):
        q["marks"] = b / 2
    return questions


def _requested(test):
    req = []
    for sec in test.get("sections", []):
        counts = sec.get("counts", {})
        for t in TYPES:
            c = int(counts.get(t, 0) or 0)
            if c > 0:
                req.append((sec["name"], t, c))
    return req


def _build_prompt(test, source_text):
    lines = []
    for sec, t, c in _requested(test):
        lines.append(f'- Section "{sec}": {c} x {t} ({TYPE_LABELS[t]})')
    spec = "\n".join(lines)
    difficulty = test.get("difficulty", "medium")
    topic = test.get("topicHint") or ""
    return f"""You are an expert examiner writing a formal exam paper.

TEST TITLE: {test.get('title')}
DIFFICULTY: {difficulty}{' (mix easy, medium and hard)' if difficulty == 'mixed' else ''}
TOTAL MARKS: {test.get('totalMarks')}
{('FOCUS / TOPIC: ' + topic) if topic else ''}

Write EXACTLY these questions:
{spec}

Rules per type:
- mcq: exactly 4 plausible "options"; "correctAnswer" is the 0-based index of the right option.
- fill_blank: the "text" contains exactly one blank written as _____ ; "correctAnswer" is an array of accepted answers (1-3 words each, include common spellings/synonyms).
- match: "text" is an instruction like "Match the following"; "pairs" is an array of 4 objects {{"left": term, "right": its correct match}}; "correctAnswer" is null.
- short: answerable in 2-4 sentences; "correctAnswer" is a concise model answer with the key points.
- long: needs a detailed answer; "correctAnswer" is a thorough model answer listing the key points expected.

Every question must be answerable from the SOURCE MATERIAL. Do not repeat questions.
Give each question a short "concept" (2-4 words naming the topic it tests), a "difficulty" (easy|medium|hard),
suggested "marks" (relative weight), and a one-sentence "explanation" of the answer.

Return ONLY JSON in this form:
{{"questions": [{{"section": "...", "type": "mcq|fill_blank|match|short|long", "text": "...", "options": [], "pairs": [], "correctAnswer": ..., "marks": 1, "concept": "...", "difficulty": "medium", "explanation": "..."}}]}}

SOURCE MATERIAL:
<<<
{source_text[:30000]}
>>>"""


def _fit_to_request(test, questions):
    """Keep at most the requested number of each (section, type); assign unknown sections sensibly."""
    req = _requested(test)
    sections = [s["name"] for s in test.get("sections", [])] or ["Section A"]
    buckets = {(s, t): [] for s, t, _ in req}
    leftovers = []
    for q in questions:
        key = (q["section"], q["type"])
        if key in buckets:
            buckets[key].append(q)
        else:
            leftovers.append(q)
    # Place leftovers (wrong section name) into a section that still needs that type
    for q in leftovers:
        for s, t, c in req:
            if t == q["type"] and len(buckets[(s, t)]) < c:
                q["section"] = s
                buckets[(s, t)].append(q)
                break
    out = []
    for s in sections:
        for t in TYPES:
            for sec, typ, c in req:
                if sec == s and typ == t:
                    out.extend(buckets[(sec, typ)][:c])
    return out


def generate_questions(test, source_text: str):
    """Returns (questions, engine, warning)."""
    if not _requested(test):
        raise ValueError("Add at least one question to a section before generating.")
    source_text = (source_text or "").strip()
    if not source_text and test.get("topicHint"):
        source_text = f"Topic: {test['topicHint']}. Use your general knowledge of this topic at an appropriate level."

    warning = ""
    if gemini.available():
        try:
            data = gemini.generate_json(_build_prompt(test, source_text))
            raw = data.get("questions", []) if isinstance(data, dict) else data
            default_sec = test["sections"][0]["name"]
            qs = [q for q in (normalize_question(r, default_sec) for r in raw if isinstance(r, dict)) if q]
            qs = _fit_to_request(test, qs)
            if qs:
                missing = sum(c for _, _, c in _requested(test)) - len(qs)
                if missing > 0:
                    filler = _fit_to_request(test, _mock(test, source_text, seed=random.random()))
                    have = {(q["section"], q["type"]): 0 for q in qs}
                    for q in qs:
                        have[(q["section"], q["type"])] = have.get((q["section"], q["type"]), 0) + 1
                    for sec, t, c in _requested(test):
                        need = c - have.get((sec, t), 0)
                        qs.extend([f for f in filler if f["section"] == sec and f["type"] == t][:max(0, need)])
                    warning = f"Gemini returned {missing} fewer question(s) than requested; filled with template questions."
                return allocate_marks(_order(test, qs), test["totalMarks"]), "gemini", warning
            warning = "Gemini returned no usable questions; used the offline template generator instead."
        except Exception as exc:  # noqa: BLE001
            print(f"[gemini] generation failed: {exc}")
            warning = f"Gemini request failed ({str(exc)[:160]}); used the offline template generator instead."
    else:
        warning = "No GEMINI_API_KEY configured: questions were made by the offline template generator. Add a key for real AI questions."

    qs = _fit_to_request(test, _mock(test, source_text))
    return allocate_marks(_order(test, qs), test["totalMarks"]), "mock", warning


def _mock(test, source_text, seed=None):
    return [q for q in (normalize_question(r) for r in mock_gen.generate(test, source_text, seed=seed)) if q]


def _order(test, qs):
    sec_index = {s["name"]: i for i, s in enumerate(test.get("sections", []))}
    qs.sort(key=lambda q: (sec_index.get(q["section"], 99), TYPES.index(q["type"])))
    for i, q in enumerate(qs):
        q["order"] = i
    return qs
