from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai import get_recommendations

router = APIRouter()


class Location(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RecommendRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    location: Location
    radius_km: float = Field(default=5.0, ge=0.5, le=50)


class RecommendResponse(BaseModel):
    items: list[dict]
    reasoning: str
    query_echo: str


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(body: RecommendRequest):
    """
    Accept a grocery query + GPS location and return AI-ranked item suggestions.
    The heavy lifting (Claude call, location context enrichment) happens in the
    ai service layer.
    """
    try:
        result = await get_recommendations(
            query=body.query,
            lat=body.location.lat,
            lng=body.location.lng,
            radius_km=body.radius_km,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
