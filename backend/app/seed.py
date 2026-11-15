"""Demo data: an admin, two students, a team, an uploaded note and a published test.

Run manually with:  python -m app.seed      (automatically runs at startup when using the in-memory DB)
"""
from .db import get_db
from .security import hash_password
from .services.mock_gen import SAMPLE_TEXT
from .utils import now

ADMIN_EMAIL = "admin@demo.com"
STUDENT_EMAIL = "student@demo.com"
PASSWORD = "password123"


def seed_demo(quiet=True):
    db = get_db()
    if db.users.find_one({"email": ADMIN_EMAIL}):
        if not quiet:
            print("[seed] demo data already present")
        return
    admin = {"name": "Demo Admin", "email": ADMIN_EMAIL, "password": hash_password(PASSWORD), "role": "admin", "teamIds": [],
             "mustChangePassword": False, "institution": {"name": "Bright Future Academy", "tagline": "Excellence through practice", "logoPath": ""},
             "createdAt": now()}
    admin["_id"] = db.users.insert_one(admin).inserted_id

    team = {"name": "Class 10 - Science", "description": "Demo team", "adminId": admin["_id"], "students": [], "invites": [], "createdAt": now()}
    team["_id"] = db.teams.insert_one(team).inserted_id

    student_ids = []
    for name, email in (("Demo Student", STUDENT_EMAIL), ("Riya Sharma", "riya@demo.com")):
        s = {"name": name, "email": email, "password": hash_password(PASSWORD), "role": "student", "adminId": admin["_id"],
             "teamIds": [team["_id"]], "mustChangePassword": False, "institution": {"name": "", "tagline": "", "logoPath": ""}, "createdAt": now()}
        student_ids.append(db.users.insert_one(s).inserted_id)
    db.teams.update_one({"_id": team["_id"]}, {"$set": {"students": student_ids}})

    from . import config

    (config.UPLOAD_ROOT / "content" / "demo-biology-notes.txt").write_text(SAMPLE_TEXT, encoding="utf-8")
    upload = {"originalName": "biology-notes.txt", "adminId": admin["_id"], "filePath": "content/demo-biology-notes.txt", "mimeType": "text/plain",
              "size": len(SAMPLE_TEXT), "extractedText": SAMPLE_TEXT, "extractionMethod": "text", "extractionWarning": "", "createdAt": now()}
    upload["_id"] = db.uploads.insert_one(upload).inserted_id

    test = {"title": "Plants & the Water Cycle - Unit Test", "description": "Answer all questions. Read each question carefully.",
            "adminId": admin["_id"], "uploadIds": [upload["_id"]], "topicHint": "", "duration": 20, "totalMarks": 20, "difficulty": "medium",
            "sections": [{"name": "Section A - Objective", "instructions": "Choose or write the correct answer.",
                          "counts": {"mcq": 4, "fill_blank": 2, "match": 1, "short": 0, "long": 0}},
                         {"name": "Section B - Written", "instructions": "Answer in your own words.",
                          "counts": {"mcq": 0, "fill_blank": 0, "match": 0, "short": 2, "long": 1}}],
            "assignedTeams": [team["_id"]], "assignedStudents": [], "status": "published", "allowOffline": True, "dueDate": None,
            "generatedWith": "mock", "createdAt": now(), "updatedAt": now()}
    test["_id"] = db.tests.insert_one(test).inserted_id
    # Seed always uses the offline generator so startup never depends on network access
    from .services import questions as qmod

    qs = qmod._fit_to_request(test, qmod._mock(test, SAMPLE_TEXT))
    qs = qmod.allocate_marks(qmod._order(test, qs), test["totalMarks"])
    for q in qs:
        q["testId"] = test["_id"]
        q["createdAt"] = now()
    db.questions.insert_many(qs)
    if not quiet:
        print(f"[seed] demo data created -> admin: {ADMIN_EMAIL} / {PASSWORD}   student: {STUDENT_EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    from .db import connect

    connect()
    seed_demo(quiet=False)
