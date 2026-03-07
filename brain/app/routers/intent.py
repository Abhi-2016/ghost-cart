from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.intent import process_intent

router = APIRouter()


# --- Request shape ---

class StoreContext(BaseModel):
    name: str
    type: str  # e.g. general_superstore, grocery_only, hardware_only, fuel_station


class PurchaseHistoryItem(BaseModel):
    item: str
    last_purchased_days_ago: int


class ProcessIntentRequest(BaseModel):
    store: StoreContext
    user_list: list[str] = []
    purchase_history: list[PurchaseHistoryItem] = []


# --- Response shape ---
# Fields are optional because not every action type uses every field.
# e.g. delay_notify uses dwell_threshold_seconds; notify does not.

class ProcessIntentResponse(BaseModel):
    action: str
    items_to_surface: list[str] = []
    items_to_hide: list[str] = []
    dwell_threshold_seconds: Optional[int] = None
    items_to_surface_after_threshold: list[str] = []
    suggested_items: list[str] = []
    notification_copy: Optional[str] = None
    reasoning: str


@router.post("/process-intent", response_model=ProcessIntentResponse)
async def process_intent_endpoint(body: ProcessIntentRequest):
    """
    Core Ghost-Cart endpoint.
    Accepts a store context + shopping list, returns a filtered,
    action-tagged notification payload ready for the client to render.
    """
    try:
        result = await process_intent(
            store_name=body.store.name,
            store_type=body.store.type,
            user_list=body.user_list,
            purchase_history=[h.model_dump() for h in body.purchase_history],
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
