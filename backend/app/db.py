"""MongoDB connection. Falls back to an in-memory mongomock database when no server is reachable."""
from pymongo import ASCENDING, MongoClient

from . import config

_client = None
_db = None
mode = "disconnected"


def connect():
    global _client, _db, mode
    try:
        client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=3000, maxPoolSize=20)
        client.admin.command("ping")
        db_name = client.get_default_database(default=config.MONGO_DB_NAME).name
        _client, _db, mode = client, client[db_name], "mongodb"
        print(f"[db] Connected to MongoDB at {config.MONGO_URI}")
    except Exception as exc:  # noqa: BLE001
        if not config.MONGO_MEMORY_FALLBACK:
            raise
        import mongomock

        print(f"[db] Could not reach MongoDB at {config.MONGO_URI} ({exc.__class__.__name__}).")
        print("[db] Using IN-MEMORY database: data is lost when the server restarts. Install MongoDB to persist data.")
        _client = mongomock.MongoClient()
        _db = _client[config.MONGO_DB_NAME]
        mode = "memory"
    _ensure_indexes()
    return _db


def _ensure_indexes():
    _db.users.create_index([("email", ASCENDING)], unique=True)
    _db.submissions.create_index([("testId", ASCENDING), ("studentId", ASCENDING)], unique=True)
    _db.questions.create_index([("testId", ASCENDING)])
    _db.teams.create_index([("invites.token", ASCENDING)])


def get_db():
    if _db is None:
        connect()
    return _db
