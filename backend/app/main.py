import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import config
from .database import Base, SessionLocal, engine
from .middleware import RequestLoggingMiddleware
from .routers import ai, auth, delivery, orders, owner, restaurants
from .services.reminders import reminder_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("campusbite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)  # creates tables if they don't exist
    log.info("Database: %s", engine.url.render_as_string(hide_password=True))
    if config.SEED_DEMO_DATA:
        from .seed import seed

        with SessionLocal() as db:
            seed(db)
    log.info("OpenAI: %s", f"enabled ({config.OPENAI_MODEL})" if config.OPENAI_API_KEY else "not configured - offline insights")
    stop = asyncio.Event()
    task = asyncio.create_task(reminder_loop(stop))
    yield
    stop.set()
    await task


app = FastAPI(
    title="CampusBite API",
    version="1.0.0",
    description="Restaurant ordering & delivery platform. Authenticate with **POST /api/auth/login**, then click "
                "**Authorize** and paste the `access_token`.",
    lifespan=lifespan,
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["X-Process-Time", "X-Request-ID"])


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errs = exc.errors()
    first = errs[0] if errs else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    msg = f"{field}: {first.get('msg')}" if field else first.get("msg", "Invalid request")
    return JSONResponse(status_code=422, content={"detail": msg, "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in errs]})


for r in (auth.router, restaurants.router, orders.router, owner.router, delivery.router, ai.router):
    app.include_router(r)


@app.get("/api/health", tags=["Health"])
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": engine.dialect.name, "openai": bool(config.OPENAI_API_KEY)}


@app.get("/", include_in_schema=False)
def root():
    return {"name": "CampusBite API", "docs": "/docs", "health": "/api/health"}
