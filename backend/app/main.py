from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, db
from .routers import analytics, auth, submissions, teams, tests, uploads
from .services import gemini, mailer, ocr


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.connect()
    if db.get_db().users.count_documents({}) == 0:
        from .seed import seed_demo

        seed_demo(quiet=False)
    print(f"[ai] Gemini: {'enabled (' + config.GEMINI_MODEL + ')' if gemini.available() else 'not configured - using offline template generator'}")
    print(f"[ocr] Tesseract: {'found' if ocr.tesseract_available() else 'not found'}")
    print(f"[mail] {'SMTP ' + config.SMTP_HOST if mailer.configured() else 'console mode (emails are printed here)'}")
    yield


app = FastAPI(title="AI Test Platform API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errs = exc.errors()
    first = errs[0] if errs else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    msg = f"{field}: {first.get('msg')}" if field else first.get("msg", "Invalid request")
    return JSONResponse(status_code=422, content={"detail": msg, "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in errs]})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    print(f"[error] {request.method} {request.url.path}: {exc!r}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for r in (auth.router, uploads.router, tests.router, submissions.router, teams.router, teams.students_router, analytics.router):
    app.include_router(r)

app.mount("/uploads", StaticFiles(directory=str(config.UPLOAD_ROOT)), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "database": db.mode, "gemini": gemini.available(), "tesseract": ocr.tesseract_available(),
            "email": "smtp" if mailer.configured() else "console"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=config.PORT, reload=True)
