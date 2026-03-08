"""
nudge.py — POST /v1/nudge

Agentic push-notification decision endpoint.

The brain runs a multi-turn tool-use loop (nudge_agent.py) where Claude
freely decides whether to send a notification and exactly what to say.
No caching — the decision is time-sensitive and personal.
"""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.nudge_agent import run_nudge_agent

router = APIRouter()


# ── Request shapes ─────────────────────────────────────────────────────────────

class PurchaseRecord(BaseModel):
    name: str
    last_bought_at_ms: int    # Unix timestamp in milliseconds
    store_where: str
    count: int


class NudgeRequest(BaseModel):
    purchase_history: list[PurchaseRecord] = []
    current_list: list[str] = []
    # Precomputed by the mobile layer from max(lastBoughtAt) across all records.
    # Sending it explicitly keeps the prompt clean and avoids clock drift.
    days_since_last_trip: float = 0.0


# ── Response shapes ────────────────────────────────────────────────────────────

class NudgeResponse(BaseModel):
    action: Literal["send", "skip"]
    # send_nudge fields — present when action == "send"
    title: Optional[str] = None
    body: Optional[str] = None
    urgency: Optional[Literal["low", "medium", "high"]] = None
    suggested_items: Optional[list[str]] = None
    # skip_nudge field — present when action == "skip"
    reason: Optional[str] = None


# ── Route ──────────────────────────────────────────────────────────────────────

@router.post("/nudge", response_model=NudgeResponse)
async def nudge_endpoint(body: NudgeRequest) -> NudgeResponse:
    """
    Run the agentic nudge decision loop.

    Claude receives the user's purchase history, current list, and days
    since their last trip. It autonomously calls either send_nudge or
    skip_nudge — no code enforces a threshold or dictates the message.

    Deliberately uncached: the decision encodes "right now, after N hours
    away from the app" and a stale cached response would be meaningless.
    """
    try:
        result = await run_nudge_agent(
            purchase_history=[r.model_dump() for r in body.purchase_history],
            current_list=body.current_list,
            days_since_last_trip=body.days_since_last_trip,
        )
        return NudgeResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
