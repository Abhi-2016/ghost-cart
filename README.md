# Ghost-Cart

A **location-aware AI shopping assistant** built on a hybrid Node.js + Python stack with a React Native mobile app. Ghost-Cart uses Claude to power both reactive and proactive agentic features — from filtering your list when you walk into a store, to autonomously deciding when to nudge you to go shopping.

---

## Architecture

```
Mobile App (React Native / Expo)
        │
        │  HTTP
        ▼
Gateway  (Node.js / Express  :3000)
  • Zod validation          • Rate limiting
  • Response caching         • Secret forwarding
        │
        │  POST + X-Internal-Secret
        ▼
Brain    (Python / FastAPI    :8000)
  • Anthropic Claude API     • TTL cache
  • Agentic tool-use loops   • Pydantic models
```

### Why a Hybrid Stack?

The gateway is the **only service exposed to the internet**. The brain is not publicly routable — it only accepts requests carrying the correct `X-Internal-Secret` header. This means the `ANTHROPIC_API_KEY` never leaves the brain process, even if the gateway is compromised.

The gateway also holds a `node-cache` response cache (10-min TTL). Cache hits never reach the brain — this is the primary cost-control lever. At a 60% hit rate on 100k monthly requests, that's ~60% fewer AI calls.

```
Internet → [Gateway] — validated, rate-limited — → [Brain] — secret-gated — → Claude
                ↑                                        ↑
           No AI keys                            No public route
```

---

## Features

### Current

| # | Feature | What it does | Agentic? | Trigger |
|---|---|---|---|---|
| 1 | **AI Chat Bot** | Type what you need in plain English — Claude builds your shopping list | No | Manual |
| 2 | **GPS Store Detection** | Polls GPS every 30s, detects when you walk into a known store | No | Timer loop |
| 3 | **Google Places Auto-Locate** | Automatically maps GPS coordinates for all your stores on first launch | No | First GPS fix |
| 4 | **Store-Aware Intent Filter** | Hides items the current store doesn't carry (e.g. wrench at FreshCo → hidden) | No | Store entry |
| 5 | **Restock Agent** | Autonomously decides which past purchases to re-add to your list | **Yes** | Store entry |
| 6 | **Nudge Agent** | Proactively decides whether to send a push notification to go shopping | **Yes** | App foreground after 12h |
| 7 | **Smart List Management** | Add, check off, clear items; purchase history recorded automatically | No | Manual |
| 8 | **Live GPS Status Banner** | Shows "Waiting / Scanning / Near [Store]" in real time | No | Continuous |

### Agentic vs Non-Agentic

| | Non-Agentic (features 1–4, 7–8) | Restock Agent | Nudge Agent |
|---|---|---|---|
| Who decides? | Your code | Claude | Claude |
| Claude calls | 0 or 1 forced | 1–N in a while-loop | 1–N in a while-loop |
| Tool choice | `tool_choice="tool"` or none | `tool_choice="auto"` | `tool_choice="auto"` |
| Tools available | Prescribed by code | `add_to_list`, `skip_item`, `set_agent_note` | `send_nudge`, `skip_nudge` |
| Threshold logic | Hard-coded in code | Claude decides | Claude decides |
| Output copy | Templated | Claude writes the note | Claude writes the notification |

---

## Roadmap

| # | Feature | What it does | Why it's agentic |
|---|---|---|---|
| 1 | **Multi-Store Trip Planner** | Claude plans the most efficient route across multiple stores to cover your full list | Claude decides which store covers which items and optimises the order — no code sets the rules |
| 2 | **Meal Planning Agent** | Say "plan dinners for this week" → Claude builds a full meal plan and populates your list | Multi-step loop: Claude picks meals, checks pantry gaps, adds ingredients, balances nutrition |
| 3 | **Budget Agent** | Set a spend limit; Claude autonomously swaps expensive items for cheaper alternatives | Claude evaluates trade-offs per item across loop rounds — not a single rule-based swap |
| 4 | **Receipt Scanner** | Photo of a receipt → Claude extracts purchases and updates your history automatically | Claude reads unstructured data and maps it to structured purchase records without templates |
| 5 | **Pantry Memory** | Tracks what you have at home; Claude avoids adding items you don't need yet | Claude reasons across pantry state + history + list simultaneously each run |
| 6 | **PostgreSQL persistence** | Persist lists, purchase history, and preferences across devices | — |
| 7 | **Redis cache** | Multi-instance cache layer to replace in-process node-cache | — |
| 8 | **Docker Compose** | One-command local setup for all three services | — |

---

## Quick Start

### Brain (Python / FastAPI)

```bash
cd brain
cp .env.example .env        # fill in ANTHROPIC_API_KEY and BRAIN_INTERNAL_SECRET
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000/health
```

### Gateway (Node.js / Express)

```bash
cd gateway
cp .env.example .env        # fill in BRAIN_BASE_URL and BRAIN_INTERNAL_SECRET
npm install
npm run dev
# → http://localhost:3000/health
```

### Mobile (React Native / Expo)

```bash
cd mobile
npm install
npx expo start
# Scan QR code with Expo Go on your device
# Update BASE_URL in mobile/services/api.ts to your machine's local IP
```

---

## Example Requests

### Grocery recommendations (chat bot)
```bash
curl -s -X POST http://localhost:3000/api/v1/cart/recommend \
  -H 'Content-Type: application/json' \
  -d '{"query":"high-protein breakfast","location":{"lat":37.77,"lng":-122.41}}'
```

### Nudge Agent (agentic)
```bash
curl -s -X POST http://localhost:3000/api/v1/nudge/check \
  -H 'Content-Type: application/json' \
  -d '{
    "purchase_history": [
      {"name":"Milk","last_bought_at_ms":1771737345126,"store_where":"FreshCo","count":10},
      {"name":"Eggs","last_bought_at_ms":1771737345126,"store_where":"FreshCo","count":8}
    ],
    "current_list": [],
    "days_since_last_trip": 14.0
  }'
# → {"action":"send","title":"Time to restock! 🛒","urgency":"high","suggested_items":["Milk","Eggs"]}
```

---

## Environment Variables

### `gateway/.env`

| Variable | Description |
|---|---|
| `PORT` | Express listen port (default `3000`) |
| `NODE_ENV` | `development` \| `production` |
| `BRAIN_BASE_URL` | Full URL of the brain service |
| `BRAIN_INTERNAL_SECRET` | Shared secret for gateway → brain auth |
| `GOOGLE_PLACES_API_KEY` | Google Places Nearby Search key |

### `brain/.env`

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic secret key — never forwarded to clients |
| `CLAUDE_MODEL` | Model ID (default `claude-sonnet-4-6`) |
| `BRAIN_INTERNAL_SECRET` | Must match gateway value |
| `CACHE_MAXSIZE` | Max entries in AI response cache |
| `CACHE_TTL` | Seconds before cached AI response expires |

---

## Project Structure

```
Ghost-Cart/
├── gateway/                  # Node.js Orchestrator (:3000)
│   └── src/
│       ├── routes/           # cart, intent, stores, restock, nudge
│       ├── services/         # brainClient, cache
│       └── middleware/       # errorHandler
│
├── brain/                    # Python AI Engine (:8000)
│   └── app/
│       ├── routers/          # recommend, intent, restock, nudge
│       ├── services/         # ai, restock_agent, nudge_agent
│       └── middleware/       # auth
│
├── mobile/                   # React Native / Expo App
│   ├── app/                  # Expo Router screens + layout
│   ├── hooks/                # useLocationWatcher, useNudgeAgent
│   ├── services/             # api, storeLookup
│   └── store/                # useCartStore (Zustand)
│
├── test_cases.json           # Agent behaviour test cases (v0.3.0, 12 cases)
├── CLAUDE.md                 # Architecture contract + coding standards
└── README.md
```

---

## Test Cases

Agent behaviour is documented and regression-tested in [`test_cases.json`](./test_cases.json).

| Agent | Cases | Tested |
|---|---|---|
| Intent Filter | TC-01 → TC-04 | Documented |
| Restock Agent | TC-05 → TC-08 | Documented |
| Nudge Agent | TC-09 → TC-12 | Live-tested ✅ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo SDK 54, Expo Router, Zustand, AsyncStorage |
| Gateway | Node.js 20+, Express 4, Zod, node-cache, Helmet, Axios |
| Brain | Python 3.11+, FastAPI, Uvicorn, Pydantic, cachetools, Anthropic SDK |
| AI Model | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Location | Expo Location, Google Places Nearby Search API |
| Notifications | expo-notifications (local push) |
