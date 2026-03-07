import anthropic
from app.config import settings

# Use the model configured in .env (defaults to claude-sonnet-4-6)
INTENT_MODEL = settings.claude_model

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# This is the "tool" we hand to Claude. It describes the exact JSON shape
# we want back. Claude is forced to fill every field — it cannot reply in
# free text. Think of it as a form Claude must complete.
INTENT_TOOL = {
    "name": "process_shopping_intent",
    "description": (
        "Given the user's current store and shopping list, decide which items "
        "are relevant here, which to hide, and what kind of notification to send."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["notify", "delay_notify", "predictive_notify"],
                "description": (
                    "notify: show relevant items now. "
                    "delay_notify: user is likely just passing through (e.g. gas station) — wait. "
                    "predictive_notify: list is empty but purchase history suggests restocking."
                ),
            },
            "items_to_surface": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Items from the user's list that this store carries. Show these.",
            },
            "items_to_hide": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Items this store does NOT carry. Hide these from the notification.",
            },
            "dwell_threshold_seconds": {
                "type": "integer",
                "description": "delay_notify only. Seconds the user must be present before we notify.",
            },
            "items_to_surface_after_threshold": {
                "type": "array",
                "items": {"type": "string"},
                "description": "delay_notify only. Items to show once the dwell threshold is met.",
            },
            "suggested_items": {
                "type": "array",
                "items": {"type": "string"},
                "description": "predictive_notify only. Items suggested based on purchase history.",
            },
            "notification_copy": {
                "type": "string",
                "description": "predictive_notify only. The exact message text to show the user.",
            },
            "reasoning": {
                "type": "string",
                "description": "One or two plain-English sentences explaining the decision.",
            },
        },
        "required": ["action", "reasoning"],
    },
}


def _build_prompt(
    store_name: str,
    store_type: str,
    user_list: list[str],
    purchase_history: list[dict],
) -> str:
    """Assemble the message we send to Claude describing the user's situation."""
    lines = [f"The user is currently at: {store_name} (type: {store_type})."]

    if user_list:
        lines.append(f"Their shopping list: {', '.join(user_list)}.")
    else:
        lines.append("Their shopping list is empty.")

    if purchase_history:
        history = "\n".join(
            f"  - {h['item']}: last bought {h['last_purchased_days_ago']} days ago"
            for h in purchase_history
        )
        lines.append(f"Purchase history:\n{history}")

    lines.append(
        "Using the tool, decide which items to surface, which to hide, "
        "and what action to take."
    )
    return "\n".join(lines)


async def process_intent(
    store_name: str,
    store_type: str,
    user_list: list[str],
    purchase_history: list[dict],
) -> dict:
    prompt = _build_prompt(store_name, store_type, user_list, purchase_history)

    response = await _client.messages.create(
        model=INTENT_MODEL,
        max_tokens=1024,
        tools=[INTENT_TOOL],
        # Force Claude to use our specific tool — guarantees structured output.
        tool_choice={"type": "tool", "name": "process_shopping_intent"},
        messages=[{"role": "user", "content": prompt}],
    )

    # Pull the tool result out of Claude's response blocks.
    for block in response.content:
        if block.type == "tool_use":
            return block.input

    raise ValueError("Claude did not return a structured tool result.")
