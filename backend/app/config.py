import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

PORT = int(os.getenv("PORT", "5000"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/ai_test_platform")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "ai_test_platform")
MONGO_MEMORY_FALLBACK = os.getenv("MONGO_MEMORY_FALLBACK", "true").lower() != "false"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "AI Test Platform <no-reply@example.com>").strip().strip('"')

TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()

UPLOAD_ROOT = BASE_DIR / "uploads"
for sub in ("content", "submissions", "logos"):
    (UPLOAD_ROOT / sub).mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp", ".bmp"}
