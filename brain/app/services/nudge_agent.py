"""
nudge_agent.py

Agentic push-notification decision engine.

Unlike the forced tool_choice="tool" calls elsewhere in Ghost-Cart, this
service runs a while-loop where Claude autonomously decides:
  - Whether the user needs a nudge to go grocery shopping at all
  - What the title and body of the notification should be
  - How urgent the situation is
  - Which items to call out specifically

The two tools are deliberate opposites:
  send_nudge  → Claude is convinced a nudge is warranted
  skip_nudge  → Claude decides it is too soon, the list is fine, or there
                is not enough data to make a useful recommendation

Both require Claude to provide a reason — this keeps the loop deliberate
and leaves a clean audit trail in the logs.
"""

from datetime import datetime, timezone

import anthropic

from app.config import settings

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# Safety cap on agentic loop iterations
MAX_ITERATIONS = 10

# ── Tool definitions ──────────────────────────────────────────────────────────

NUDGE_TOOLS = [
    {
        "name": "send_nudge",
        "description": (
            "Send a push notification nudging the user to go grocery shopping. "
            "Call this when the evidence — days elapsed since last trip, items "
            "likely depleted based on purchase frequency, current list contents — "
            "justifies the interruption. Be specific and friendly; the user sees "
            "the title and body directly on their lock screen."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": (
                        "Short notification title, max 60 characters. "
                        "Examples: 'Time to restock!', 'Shopping reminder 🛒'"
                    ),
                },
                "body": {
                    "type": "string",
                    "description": (
                        "One or two sentences shown below the title. "
                        "Mention specific items where helpful. Max 140 characters."
                    ),
                },
                "urgency": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": (
                        "low: gentle reminder (5-9 days since last trip). "
                        "medium: clearly overdue (10-13 days). "
                        "high: staples very likely exhausted (14+ days)."
                    ),
                },
                "suggested_items": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Up to 5 specific item names the user is most likely "
                        "running low on, based on purchase history and days elapsed. "
                        "Can be empty if history is sparse."
                    ),
                },
            },
            "required": ["title", "body", "urgency", "suggested_items"],
        },
    },
    {
        "name": "skip_nudge",
        "description": (
            "Decide NOT to send a push notification. Use this when: the user "
            "went shopping recently (< 5 days ago), the current shopping list "
            "already has plenty of items, or there is insufficient purchase "
            "history to make a useful recommendation. Do not over-notify."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": (
                        "Internal reasoning note — not shown to the user. "
                        "Max 200 characters. "
                        "Example: 'User shopped 3 days ago, milk and eggs are fresh.'"
                    ),
                }
            },
            "required": ["reason"],
        },
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _days_since(last_bought_at_ms: int) -> float:
    """Convert a Unix millisecond timestamp to days elapsed since then."""
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    return (now_ms - last_bought_at_ms) / (1000 * 60 * 60 * 24)


def _build_prompt(
    purchase_history: list[dict],
    current_list: list[str],
    days_since_last_trip: float,
) -> str:
    today = datetime.now(timezone.utc).strftime("%A, %B %-d %Y")

    lines = [
        f"Today is {today}.",
        f"The user's last grocery trip was approximately {days_since_last_trip:.1f} days ago.",
        "",
    ]

    if current_list:
        lines.append(
            f"Items currently on their shopping list: {', '.join(current_list)}."
        )
    else:
        lines.append("Their shopping list is currently empty.")

    lines.append("")

    if purchase_history:
        lines.append("Purchase history (items they have bought before):")
        for record in purchase_history:
            days = _days_since(record["last_bought_at_ms"])
            lines.append(
                f"  - {record['name']}: last bought {days:.0f} days ago "
                f"at {record['store_where']} ({record['count']} purchase(s) total)"
            )
    else:
        lines.append("No purchase history available yet.")

    lines += [
        "",
        "Your job: decide whether to nudge this user to go grocery shopping.",
        "",
        "Nudge guidelines:",
        "  - < 5 days since last trip: strongly prefer skip_nudge",
        "  - 5-9 days: consider send_nudge if multiple staples look depleted",
        "  - 10-13 days: send_nudge is likely warranted — calibrate urgency",
        "  - 14+ days: send_nudge with high urgency is almost always correct",
        "  - Empty purchase history: skip_nudge (no basis for a recommendation)",
        "  - Current list already very long: may skip_nudge (user is on top of it)",
        "  - Be specific in the notification body — mention actual item names",
        "  - Urgency reflects how long it has been, not how insistently you phrase things",
        "  - Call either send_nudge OR skip_nudge exactly once, then stop",
    ]

    return "\n".join(lines)


# ── Main agent function ───────────────────────────────────────────────────────

async def run_nudge_agent(
    purchase_history: list[dict],
    current_list: list[str],
    days_since_last_trip: float,
) -> dict:
    """
    Run the agentic nudge decision loop.

    Claude freely calls either send_nudge or skip_nudge based on the
    user's purchase history and days since their last shopping trip.
    The loop ends as soon as Claude makes its decision.

    Args:
        purchase_history: list of {name, last_bought_at_ms, store_where, count}
        current_list: item names currently on the shopping list
        days_since_last_trip: precomputed by mobile from max(lastBoughtAt)

    Returns one of:
        { "action": "send", "title": str, "body": str,
          "urgency": "low"|"medium"|"high", "suggested_items": [str] }
        { "action": "skip", "reason": str }
    """
    prompt = _build_prompt(purchase_history, current_list, days_since_last_trip)
    messages: list[dict] = [{"role": "user", "content": prompt}]

    result: dict | None = None
    iterations = 0

    while iterations < MAX_ITERATIONS:
        iterations += 1

        response = await _client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            tools=NUDGE_TOOLS,
            tool_choice={"type": "auto"},  # ← Claude decides freely; not forced
            messages=messages,
        )

        # Find every tool call Claude made this round
        tool_calls = [b for b in response.content if b.type == "tool_use"]

        # Claude is done when it stops calling tools
        if not tool_calls:
            break

        tool_results = []
        for call in tool_calls:
            if call.name == "send_nudge":
                result = {
                    "action": "send",
                    "title": call.input["title"],
                    "body": call.input["body"],
                    "urgency": call.input["urgency"],
                    "suggested_items": call.input["suggested_items"],
                }
                print(
                    f"[NudgeAgent] send_nudge: \"{call.input['title']}\" "
                    f"(urgency={call.input['urgency']})"
                )
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": "Nudge queued for delivery.",
                })

            elif call.name == "skip_nudge":
                result = {
                    "action": "skip",
                    "reason": call.input["reason"],
                }
                print(f"[NudgeAgent] skip_nudge: {call.input['reason']}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": "Nudge suppressed.",
                })

        # Feed Claude's response + tool results back — it continues reasoning
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        # Once Claude has called a terminal tool, break after feeding results back
        if result is not None:
            break

    # Safety fallback: if Claude never called a tool (e.g. context was empty)
    if result is None:
        result = {
            "action": "skip",
            "reason": "Agent produced no decision — safety fallback (no tool called).",
        }

    print(
        f"[NudgeAgent] Done in {iterations} round(s). "
        f"Action={result['action']}"
    )
    return result
