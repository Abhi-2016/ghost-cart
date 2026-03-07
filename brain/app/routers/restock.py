from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.restock_agent import run_restock_agent

router = APIRouter()


# ── Request shape ─────────────────────────────────────────────────────────────

class StoreContext(BaseModel):
    name: str
    type: str


class PurchaseRecord(BaseModel):
    name: str
    last_bought_at_ms: int   # Unix timestamp in milliseconds
    store_where: str
    count: int


class RestockRequest(BaseModel):
    store: StoreContext
    current_list: list[str] = []
    purchase_history: list[PurchaseRecord] = []


# ── Response shape ────────────────────────────────────────────────────────────

class RestockItem(BaseModel):
    name: str
    reason: str   # Shown to the user, e.g. "Last bought 12 days ago"


class RestockResponse(BaseModel):
    items_to_add: list[RestockItem]
    agent_note: Optional[str] = None


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/restock", response_model=RestockResponse)
async def restock_endpoint(body: RestockRequest):
    """
    Run the agentic restock loop for the given store and purchase history.
    Claude autonomously decides which items to add back and when to stop.
    """
    try:
        result = await run_restock_agent(
            store_name=body.store.name,
            store_type=body.store.type,
            current_list=body.current_list,
            purchase_history=[r.model_dump() for r in body.purchase_history],
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
