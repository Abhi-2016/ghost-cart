"""
request_id.py

Concept: Correlation IDs
-------------------------
A single user action (e.g. tapping "enter store") creates a chain:

    Mobile → Gateway → Brain → Claude API

Without a shared ID, you can't join the logs from all three services.
With a correlation ID, you filter any log platform by request_id=abc123
and see the full journey end-to-end.

How it works:
1. Gateway generates a request_id (or reads one forwarded by mobile)
2. Gateway sends it to brain as the X-Request-ID header
3. This middleware reads that header and stores it in a ContextVar
4. ContextVar is like a thread-local but for async — each request has its own value
5. Every log call in any service function can read get_request_id()
   without passing it through every function argument
"""

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

# One ContextVar per process; each async request gets its own isolated value
_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Read the current request's correlation ID from anywhere in the call stack."""
    return _request_id_var.get()


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that:
    1. Reads X-Request-ID from incoming request (forwarded from gateway)
    2. Falls back to a new short UUID if not present
    3. Stores it in the ContextVar so all downstream code can read it
    4. Echoes it back in the response header
    """

    async def dispatch(self, request, call_next):
        request_id = (
            request.headers.get("X-Request-ID") or uuid.uuid4().hex[:8]
        )
        token = _request_id_var.set(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            # Always reset — prevents leaking across requests in the same worker
            _request_id_var.reset(token)
