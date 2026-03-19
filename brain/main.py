import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging_config import setup_logging
from app.middleware.auth import InternalSecretMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.routers import recommend, intent, restock, nudge

# Configure JSON logging before anything else runs
setup_logging()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown hooks."""
    log.info("brain.startup", extra={"event": "brain.startup", "env": settings.env, "model": settings.claude_model})
    yield
    log.info("brain.shutdown", extra={"event": "brain.shutdown"})


app = FastAPI(
    title="Ghost-Cart Brain",
    version="0.1.0",
    description="AI reasoning engine for location-aware grocery recommendations",
    lifespan=lifespan,
    # Disable docs in production
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url=None,
)

# Correlation IDs — reads X-Request-ID from gateway, stores in ContextVar
app.add_middleware(RequestIdMiddleware)

# Only the gateway (same host in prod) should reach this service
app.add_middleware(InternalSecretMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "brain"}


app.include_router(recommend.router, prefix="/v1")
app.include_router(intent.router, prefix="/v1")
app.include_router(restock.router, prefix="/v1")
app.include_router(nudge.router, prefix="/v1")
