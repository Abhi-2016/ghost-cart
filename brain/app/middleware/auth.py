from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings


class InternalSecretMiddleware(BaseHTTPMiddleware):
    """
    Reject requests that don't carry the correct X-Internal-Secret header.
    Skipped when brain_internal_secret is empty (local dev without a secret).
    """

    async def dispatch(self, request: Request, call_next):
        if not settings.brain_internal_secret:
            return await call_next(request)

        # Health check is always open
        if request.url.path == "/health":
            return await call_next(request)

        secret = request.headers.get("X-Internal-Secret", "")
        if secret != settings.brain_internal_secret:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        return await call_next(request)
