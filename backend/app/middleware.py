"""Request logging + response-time middleware."""
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("campusbite.requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs method + path + status, measures response time and adds X-Process-Time / X-Request-ID headers."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed = (time.perf_counter() - start) * 1000
            logger.exception("%s %s -> 500 (%.1f ms) id=%s", request.method, request.url.path, elapsed, request_id)
            raise
        elapsed = (time.perf_counter() - start) * 1000
        response.headers["X-Process-Time"] = f"{elapsed:.1f}ms"
        response.headers["X-Request-ID"] = request_id
        logger.info("%s %s -> %s (%.1f ms) id=%s", request.method, request.url.path, response.status_code, elapsed, request_id)
        return response
