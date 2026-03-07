from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.auth import InternalSecretMiddleware
from app.routers import recommend, intent, restock


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown hooks."""
    print(f"[brain] Ghost-Cart AI engine starting — env={settings.env}")
    yield
    print("[brain] Ghost-Cart AI engine shutting down")


app = FastAPI(
    title="Ghost-Cart Brain",
    version="0.1.0",
    description="AI reasoning engine for location-aware grocery recommendations",
    lifespan=lifespan,
    # Disable docs in production
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url=None,
)

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
