import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# backend/.env is the single source of truth locally (overrides stray system variables).
# Inside Docker the file isn't copied into the image; compose injects the variables instead.
load_dotenv(BASE_DIR / ".env", override=True)

# SQLite is used when DATABASE_URL is not set (local runs without Docker).
# Docker Compose sets DATABASE_URL to the PostgreSQL container.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{(BASE_DIR / 'campusbite.db').as_posix()}"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24)))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
AI_RATE_LIMIT_PER_MINUTE = int(os.getenv("AI_RATE_LIMIT_PER_MINUTE", "5"))

REMINDER_MINUTES = int(os.getenv("REMINDER_MINUTES", "15"))
REMINDER_CHECK_SECONDS = int(os.getenv("REMINDER_CHECK_SECONDS", "60"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
# Also allow any localhost port in development (Vite moves to 5174, 5175... if 5173 is busy). Set empty to disable.
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$").strip() or None
SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "true").lower() != "false"
