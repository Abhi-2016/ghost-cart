"""
restock_agent.py

The agentic core of Ghost-Cart.

Unlike the other AI services (which force Claude to use one specific tool once),
this service runs a while-loop where Claude autonomously decides:
  - Which items from the user's purchase history to add back
  - Which items to skip (bought recently, wrong store type, already on list)
  - When it's done (it stops calling tools)

The key distinction:
  process_intent  → tool_choice="tool"  → forced, single call, Claude fills a form
  restock_agent   → tool_choice="auto"  → Claude picks tools freely, loop until done
"""

from datetime import datetime, timezone

import anthropic

from app.config import settings

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# Safety cap: prevents runaway loops if Claude misbehaves
MAX_ITERATIONS = 10

# ── Tool definitions ──────────────────────────────────────────────────────────
# These are the actions Claude can take. It decides which ones to call,
# in what order, and how many times — we don't tell it.

RESTOCK_TOOLS = [
    {
        "name": "add_to_list",
        "description": (
            "Add an item to the user's shopping list because it is likely running low "
            "based on their purchase history and the time elapsed since last purchase."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "item_name": {
                    "type": "string",
                    "description": "The exact item name to add to the list.",
                },
                "reason": {
                    "type": "string",
                    "description": (
                        "Short plain-English note shown to the user. "
                        "Examples: 'Last bought 12 days ago', 'Usually restocked weekly'."
                    ),
                },
            },
            "required": ["item_name", "reason"],
        },
    },
    {
        "name": "skip_item",
        "description": (
            "Explicitly decide NOT to add an item. Use this when the item was bought "
            "recently, is already on the list, or this store type does not carry it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "item_name": {"type": "string"},
                "reason": {
                    "type": "string",
                    "description": "Why this item is being skipped (for internal logging).",
                },
            },
            "required": ["item_name", "reason"],
        },
    },
    {
        "name": "set_agent_note",
        "description": (
            "Set a short summary message shown to the user on the list screen "
            "after the agent finishes. Call this exactly once at the end."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Friendly summary under 120 characters.",
                }
            },
            "required": ["message"],
        },
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _days_since(last_bought_at_ms: int) -> float:
    """Convert a Unix millisecond timestamp to days elapsed since then."""
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    return (now_ms - last_bought_at_ms) / (1000 * 60 * 60 * 24)


_STORE_TYPE_DESCRIPTIONS = {
    "general_superstore": "carries groceries, household goods, and general merchandise",
    "grocery_only": "carries groceries and fresh produce only",
    "hardware_only": "carries hardware and home improvement items — no groceries",
    "fuel_station": "carries fuel, snacks, and basic convenience items only",
}


def _build_prompt(
    store_name: str,
    store_type: str,
    current_list: list[str],
    purchase_history: list[dict],
) -> str:
    today = datetime.now(timezone.utc).strftime("%A, %B %-d %Y")
    store_desc = _STORE_TYPE_DESCRIPTIONS.get(store_type, store_type)

    lines = [
        f"Today is {today}.",
        f"The user has just entered: {store_name} ({store_desc}).",
        "",
    ]

    if current_list:
        lines.append(
            f"Items ALREADY on their list — do NOT add these again: {', '.join(current_list)}."
        )
    else:
        lines.append("Their shopping list is currently empty.")

    lines.append("")

    if purchase_history:
        lines.append("Purchase history:")
        for record in purchase_history:
            days = _days_since(record["last_bought_at_ms"])
            lines.append(
                f"  - {record['name']}: last bought {days:.0f} days ago "
                f"at {record['store_where']} (purchased {record['count']} time(s) total)"
            )
    else:
        lines.append("No purchase history available yet.")

    lines += [
        "",
        "Your job: decide which items from the history are likely running low",
        "and should be added back to the shopping list.",
        "",
        "Restock guidelines:",
        "  - Dairy (milk, yogurt, cheese): every 5–10 days",
        "  - Eggs, bread: every 5–10 days",
        "  - Fresh produce: every 3–7 days",
        "  - Meat, fish: every 5–14 days",
        "  - Cleaning supplies, toiletries: every 30–60 days",
        "  - Only suggest items this store type would carry",
        "  - Skip items bought fewer than 3 days ago",
        "  - Skip items already on the list",
        "  - Call set_agent_note once at the very end with a brief friendly summary",
    ]

    return "\n".join(lines)


# ── Main agent function ───────────────────────────────────────────────────────

async def run_restock_agent(
    store_name: str,
    store_type: str,
    current_list: list[str],
    purchase_history: list[dict],
) -> dict:
    """
    Run the agentic restock loop.

    Claude calls tools freely (add_to_list, skip_item, set_agent_note) across
    multiple rounds until it decides it has nothing left to do. Each round's
    tool results are fed back so Claude can reason across steps.

    Returns:
        {
            "items_to_add": [{"name": str, "reason": str}, ...],
            "agent_note": str | None
        }
    """
    prompt = _build_prompt(store_name, store_type, current_list, purchase_history)
    messages: list[dict] = [{"role": "user", "content": prompt}]

    items_to_add: list[dict] = []
    agent_note: str | None = None
    iterations = 0

    while iterations < MAX_ITERATIONS:
        iterations += 1

        response = await _client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            tools=RESTOCK_TOOLS,
            tool_choice={"type": "auto"},  # ← Claude decides; not forced
            messages=messages,
        )

        # Find every tool call Claude made this round
        tool_calls = [b for b in response.content if b.type == "tool_use"]

        # Claude is done when it stops calling tools
        if not tool_calls:
            break

        # Execute each tool and collect results to feed back next round
        tool_results = []
        for call in tool_calls:
            if call.name == "add_to_list":
                name = call.input["item_name"]
                reason = call.input["reason"]
                items_to_add.append({"name": name, "reason": reason})
                print(f"[RestockAgent] add_to_list: {name} — {reason}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": f"Added '{name}' to the list.",
                })

            elif call.name == "skip_item":
                name = call.input["item_name"]
                print(f"[RestockAgent] skip_item: {name} — {call.input['reason']}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": f"Skipped '{name}'.",
                })

            elif call.name == "set_agent_note":
                agent_note = call.input["message"]
                print(f"[RestockAgent] set_agent_note: {agent_note}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": "Note set.",
                })

        # Feed Claude's response + tool results back — it continues reasoning
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    print(f"[RestockAgent] Done in {iterations} round(s). Adding {len(items_to_add)} item(s).")
    return {"items_to_add": items_to_add, "agent_note": agent_note}
