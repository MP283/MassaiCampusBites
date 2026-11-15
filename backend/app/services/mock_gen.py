"""Offline template-based question generator, used when no Gemini key is configured (or as a fallback).

It builds questions directly from sentences and keywords found in the source text, so the platform
remains fully usable for demos without any API key.
"""
import random
import re
from collections import Counter

SAMPLE_TEXT = """Photosynthesis is the process by which green plants use sunlight to make food from carbon dioxide and water.
Chlorophyll is the green pigment in leaves that absorbs light energy. Oxygen is released as a by-product of photosynthesis.
The stomata are tiny pores on the surface of leaves that allow gases to enter and leave. Glucose produced during
photosynthesis is used by the plant for energy and growth. Respiration is the process in which cells break down glucose
to release energy. The water cycle describes how water evaporates, condenses into clouds and returns as precipitation.
Evaporation happens when the sun heats water in oceans and lakes, turning it into vapour. Condensation forms clouds
when water vapour cools. Transpiration is the loss of water vapour from plant leaves. Ecosystems depend on producers,
consumers and decomposers. Decomposers such as fungi and bacteria break down dead matter and recycle nutrients."""

STOP = set("""a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her here
hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once
only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves
then there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours yourself yourselves called known used using many much often usually within without
another every however therefore thus between among upon while whose shall must might may like such include includes
including example examples also first second third different important""".split())


def _clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _sentences(text):
    parts = re.split(r"(?<=[.!?])\s+", _clean(text))
    return [p.strip() for p in parts if 40 <= len(p.strip()) <= 320]


def _keywords(text):
    words = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", text)
    counts = Counter(w.lower() for w in words if w.lower() not in STOP)
    return [w for w, _ in counts.most_common(200)]


def _find_kw(sentence, keywords, used):
    low = sentence.lower()
    for k in keywords:
        if k not in used and re.search(rf"\b{re.escape(k)}\b", low):
            return k
    return None


def _blank(sentence, kw):
    return re.sub(rf"\b{re.escape(kw)}\b", "_____", sentence, count=1, flags=re.I)


def generate(test, source_text, seed=None):
    text = source_text if len(_clean(source_text)) > 200 else (source_text or "") + " " + SAMPLE_TEXT
    rng = random.Random(seed if seed is not None else str(test.get("_id", "")) + test.get("title", ""))
    sents = _sentences(text) or _sentences(SAMPLE_TEXT)
    kws = _keywords(text) or _keywords(SAMPLE_TEXT)
    rng.shuffle(sents)
    s_idx = 0
    used = set()
    out = []

    def next_sentence_with_kw():
        nonlocal s_idx
        for _ in range(len(sents)):
            s = sents[s_idx % len(sents)]
            s_idx += 1
            k = _find_kw(s, kws, used)
            if k:
                used.add(k)
                return s, k
        # all keywords used: allow reuse
        s = sents[s_idx % len(sents)]
        s_idx += 1
        return s, (_find_kw(s, kws, set()) or kws[0])

    difficulty = test.get("difficulty", "medium")
    for sec in test.get("sections", []):
        counts = sec.get("counts", {})
        name = sec["name"]
        for _ in range(int(counts.get("mcq", 0) or 0)):
            s, k = next_sentence_with_kw()
            distract = [w for w in kws if w != k and abs(len(w) - len(k)) <= 6]
            rng.shuffle(distract)
            opts = [k] + distract[:3]
            while len(opts) < 4:
                opts.append(f"none of these ({len(opts)})")
            rng.shuffle(opts)
            out.append({"section": name, "type": "mcq", "text": f"Choose the word that correctly completes the statement: \"{_blank(s, k)}\"",
                        "options": [o.capitalize() for o in opts], "correctAnswer": opts.index(k), "marks": 1,
                        "concept": k.capitalize(), "difficulty": difficulty if difficulty != "mixed" else "easy",
                        "explanation": f"The source states: \"{s}\""})
        for _ in range(int(counts.get("fill_blank", 0) or 0)):
            s, k = next_sentence_with_kw()
            out.append({"section": name, "type": "fill_blank", "text": _blank(s, k), "correctAnswer": [k], "marks": 1,
                        "concept": k.capitalize(), "difficulty": difficulty if difficulty != "mixed" else "medium",
                        "explanation": f"The complete sentence is: \"{s}\""})
        for _ in range(int(counts.get("match", 0) or 0)):
            pairs = []
            for _ in range(4):
                s, k = next_sentence_with_kw()
                desc = _blank(s, k).replace("_____", "…")
                pairs.append({"left": k.capitalize(), "right": desc[:110] + ("…" if len(desc) > 110 else "")})
            out.append({"section": name, "type": "match", "text": "Match each term on the left with the statement it completes on the right.",
                        "pairs": pairs, "marks": 2, "concept": pairs[0]["left"], "difficulty": "medium",
                        "explanation": "Each term fills the gap marked … in its statement."})
        for _ in range(int(counts.get("short", 0) or 0)):
            s, k = next_sentence_with_kw()
            related = [x for x in sents if k in x.lower()][:2] or [s]
            out.append({"section": name, "type": "short", "text": f"In 2-3 sentences, explain what the material says about \"{k}\".",
                        "correctAnswer": " ".join(related), "marks": 3, "concept": k.capitalize(), "difficulty": "medium",
                        "explanation": "Key points come directly from the uploaded material."})
        for _ in range(int(counts.get("long", 0) or 0)):
            s, k = next_sentence_with_kw()
            s2, k2 = next_sentence_with_kw()
            related = [x for x in sents if k in x.lower() or k2 in x.lower()][:5] or [s, s2]
            out.append({"section": name, "type": "long", "text": f"Write a detailed answer discussing \"{k}\" and \"{k2}\". Explain each and how they relate, using examples from the material.",
                        "correctAnswer": " ".join(related), "marks": 5, "concept": k.capitalize(), "difficulty": "hard",
                        "explanation": "A strong answer defines both ideas and links them."})
    return out
