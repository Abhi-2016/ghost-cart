import hashlib
import json

import anthropic
from cachetools import TTLCache

from app.config import settings

_cache: TTLCache = TTLCache(maxsize=settings.cache_maxsize, ttl=settings.cache_ttl)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """\
You are Ghost-Cart, a location-aware grocery assistant.
Given a user's grocery query and their GPS coordinates, return:
1. A JSON array called "items" — each item has: name, category, estimated_price_usd, why_suggested.
2. A brief "reasoning" string (1-2 sentences) explaining the selection.

Always respond with valid JSON matching this exact schema:
{
  "items": [
    {
      "name": "string",
      "category": "string",
      "estimated_price_usd": number,
      "why_suggested": "string"
    }
  ],
  "reasoning": "string"
}
"""


def _cache_key(query: str, lat: float, lng: float, radius_km: float) -> str:
    raw = f"{query}|{round(lat, 2)}|{round(lng, 2)}|{radius_km}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def get_recommendations(
    query: str, lat: float, lng: float, radius_km: float
) -> dict:
    key = _cache_key(query, lat, lng, radius_km)
    if key in _cache:
        return _cache[key]

    user_message = (
        f"Grocery query: {query}\n"
        f"User location: ({lat}, {lng}), search radius: {radius_km} km\n"
        "Please suggest the most relevant grocery items."
    )

    message = await _client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw_text = message.content[0].text
    parsed = json.loads(raw_text)

    result = {
        "items": parsed["items"],
        "reasoning": parsed["reasoning"],
        "query_echo": query,
    }
    _cache[key] = result
    return result
