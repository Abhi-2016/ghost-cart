# Ghost-Cart — Claude Code Guide

## Project Overview

Ghost-Cart is a **location-aware grocery agent** that combines a Node.js orchestration layer, a Python AI reasoning engine, and a React Native mobile app. The services are intentionally split to isolate concerns, protect secrets, and minimise cost.

---

## Services

### `/gateway` — Orchestrator (Node.js / Express)

| Property | Value |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework | Express 4 |
| Port | `3000` (env: `PORT`) |
| Entry point | `gateway/src/index.js` |
| Start (dev) | `npm run dev` inside `/gateway` |

**Responsibilities**
- Receive and validate all client requests (Zod schemas).
- Apply rate limiting, security headers (Helmet), and structured JSON request logging.
- Maintain an in-process response cache (`node-cache`, 10 min TTL).
- Forward cache misses to the Brain over HTTP with a shared internal secret.
- Return structured JSON to clients; never expose the Anthropic API key.

**Key files**
```
gateway/
  src/
    app.js                    # Express app setup
    index.js                  # HTTP server bootstrap
    routes/
      cart.js                 # POST /api/v1/cart/recommend
      intent.js               # POST /api/v1/intent/process-intent
      stores.js               # POST /api/v1/stores/locate
      restock.js              # POST /api/v1/restock/check
      nudge.js                # POST /api/v1/nudge/check
    services/
      brainClient.js          # Axios client → brain (logs latency, forwards X-Request-ID)
      cache.js                # node-cache singleton
      placesClient.js         # Google Places Nearby Search
    middleware/
      errorHandler.js         # Central error handling
      requestLogger.js        # Structured JSON request logging (replaces morgan)
    lib/
      logger.js               # JSON logger writing to stdout, respects LOG_LEVEL
      requestContext.js       # AsyncLocalStorage for per-request correlation IDs
  .env.example
  package.json
```

---

### `/brain` — AI Reasoning Engine (Python / FastAPI)

| Property | Value |
|---|---|
| Runtime | Python ≥ 3.11 |
| Framework | FastAPI + Uvicorn |
| Port | `8000` |
| Entry point | `brain/main.py` |
| Start (dev) | `uvicorn main:app --reload` inside `/brain` |

**Responsibilities**
- Accept validated recommendation requests from the gateway only.
- Hold the `ANTHROPIC_API_KEY` — it must never leave this process.
- Build prompts, call `claude-sonnet-4-6`, and parse responses.
- Run agentic tool-use loops (`tool_choice="auto"`) for Restock and Nudge agents.
- Maintain a second in-process TTL cache (`cachetools`) to avoid duplicate AI calls.
- Emit structured JSON logs with correlation IDs for every Claude call and tool decision.

**Key files**
```
brain/
  main.py                        # FastAPI app setup + lifespan + logging init
  app/
    config.py                    # pydantic-settings — reads .env (incl. ALLOWED_ORIGINS)
    logging_config.py            # JSON log formatter via python-json-logger
    middleware/
      auth.py                    # X-Internal-Secret gate
      request_id.py              # ContextVar-based correlation ID middleware
    routers/
      recommend.py               # POST /v1/recommend
      intent.py                  # POST /v1/process-intent
      restock.py                 # POST /v1/restock
      nudge.py                   # POST /v1/nudge
    services/
      ai.py                      # Anthropic client + TTL cache (recommend)
      intent.py                  # Intent filter service (forced tool_choice)
      restock_agent.py           # Agentic restock loop (tool_choice=auto)
      nudge_agent.py             # Agentic nudge loop (tool_choice=auto)
  requirements.txt
  .env.example
```

---

### `/mobile` — React Native App (Expo)

| Property | Value |
|---|---|
| Runtime | Node.js ≥ 20 + Expo CLI |
| Framework | React Native, Expo SDK 54, Expo Router |
| Port | `8081` (Metro bundler) |
| Entry point | `mobile/app/_layout.tsx` |
| Start (dev) | `npx expo start` inside `/mobile` |

**Responsibilities**
- Provide the chat bot UI and shopping list UI.
- Poll GPS every 30s; detect when user enters a known store.
- Trigger Restock Agent and Intent Filter automatically on store entry.
- Trigger Nudge Agent when app returns to foreground after 12+ hours.
- Persist shopping list and purchase history to AsyncStorage.

**Key files**
```
mobile/
  app/
    _layout.tsx               # Root layout — mounts LocationWatcher, NudgeAgent
    (tabs)/
      chat.tsx                # AI chat bot screen
      list.tsx                # Shopping list screen
  hooks/
    useLocationWatcher.ts     # GPS polling, store detection, triggers restock + intent
    useNudgeAgent.ts          # AppState listener — fires nudge check after 12h background
  services/
    api.ts                    # All gateway API calls (processIntent, checkRestock, checkNudge, getRecommendations)
    storeLookup.ts            # lookupStoreLocations via gateway → Google Places
    location.ts               # GPS helpers, Haversine distance, findNearbyStore
  store/
    useCartStore.ts           # Zustand store — items, purchase history, store list
  .env.example
```

---

## Communication Protocol

```
Mobile App (React Native)
  │
  │  HTTP — EXPO_PUBLIC_GATEWAY_URL
  ▼
┌─────────────────────────────────────────┐
│  Gateway  (Node.js :3000)               │
│  • Zod validation    • Rate limiting    │
│  • JSON logging      • node-cache       │
│  • X-Request-ID forwarding              │
└──────────────────┬──────────────────────┘
                   │  POST /v1/*
                   │  X-Internal-Secret + X-Request-ID
                   ▼
┌─────────────────────────────────────────┐
│  Brain    (Python  :8000)               │
│  • X-Internal-Secret gate               │
│  • RequestIdMiddleware (ContextVar)      │
│  • Structured JSON logs (tokens+latency)│
│  • cachetools TTLCache                  │
│  • Claude API (tool_choice=auto loops)  │
└─────────────────────────────────────────┘
```

### API Endpoints

| Method | Path | Service | Cached | Description |
|---|---|---|---|---|
| POST | `/api/v1/cart/recommend` | ai.py | Yes (10 min) | Chat bot grocery recommendations |
| POST | `/api/v1/intent/process-intent` | intent.py | Yes (10 min) | Store-aware item filtering |
| POST | `/api/v1/stores/locate` | placesClient.js | Yes (24 hr) | Google Places store lookup |
| POST | `/api/v1/restock/check` | restock_agent.py | No | Agentic restock loop |
| POST | `/api/v1/nudge/check` | nudge_agent.py | No | Agentic nudge decision |

---

## Agentic Features

### Restock Agent (`brain/app/services/restock_agent.py`)
- Triggered when user enters a store (GPS detection in `useLocationWatcher.ts`)
- `tool_choice="auto"` — Claude freely decides which tools to call
- Tools: `add_to_list`, `skip_item`, `set_agent_note`
- Loop continues until Claude stops calling tools (max 10 iterations)
- Logs every tool call with item name, reason, and token usage

### Nudge Agent (`brain/app/services/nudge_agent.py`)
- Triggered when app returns to foreground after 12+ hours (`useNudgeAgent.ts`)
- `tool_choice="auto"` — Claude decides whether to send or skip
- Tools: `send_nudge(title, body, urgency, suggested_items)`, `skip_nudge(reason)`
- Claude writes the notification copy — no templates
- Logs the decision with urgency and suggested items

---

## Logging

### Architecture
All logs are structured JSON written to stdout. In production (Railway/Render) stdout is captured automatically — no additional setup needed.

```
LOG_LEVEL=DEBUG   → all logs including per-iteration Claude calls
LOG_LEVEL=INFO    → normal operations (default, recommended for production)
LOG_LEVEL=WARN    → only unexpected events
LOG_LEVEL=ERROR   → only failures
```

### Correlation IDs
Every request gets an `X-Request-ID` header. The gateway generates it (or reads it from the mobile client) and forwards it to the brain. Both services log with the same ID, so you can trace any user action end-to-end:

```bash
# Filter all logs for one request across both services
grep "verify-001" gateway.log brain.log
```

### Key log events

| Event | Service | Fields |
|---|---|---|
| `request` | gateway | method, path, status, latency_ms, request_id |
| `brain.call` | gateway | endpoint, latency_ms, request_id |
| `brain.call_failed` | gateway | endpoint, status, error, latency_ms |
| `agent.start` | brain | agent, store/days_since_trip, history_count |
| `agent.claude_response` | brain | iteration, input_tokens, output_tokens, latency_ms |
| `agent.tool_call` | brain | agent, tool, item/urgency/reason |
| `agent.complete` | brain | agent, action, iterations, total_latency_ms |
| `agent.fallback` | brain | agent, iterations (WARNING level) |

### Sample output (one nudge request, filtered by request_id)
```json
{"ts":"...","level":"info","service":"gateway","event":"brain.call","endpoint":"/v1/nudge","latency_ms":3813,"request_id":"abc123"}
{"ts":"...","level":"INFO","event":"agent.start","agent":"nudge","days_since_last_trip":14.0,"history_count":2,"request_id":"abc123"}
{"ts":"...","level":"INFO","event":"agent.claude_response","iteration":1,"input_tokens":1263,"output_tokens":198,"latency_ms":3797,"request_id":"abc123"}
{"ts":"...","level":"INFO","event":"agent.tool_call","tool":"send_nudge","urgency":"high","suggested_items":["Milk","Eggs"],"request_id":"abc123"}
{"ts":"...","level":"INFO","event":"agent.complete","action":"send","iterations":1,"total_latency_ms":3798,"request_id":"abc123"}
{"ts":"...","level":"info","service":"gateway","event":"request","method":"POST","status":200,"latency_ms":3822,"request_id":"abc123"}
```

---

## Environment Variables

### Gateway (`gateway/.env`)
| Variable | Description |
|---|---|
| `PORT` | Express listen port (default `3000`) |
| `NODE_ENV` | `development` \| `production` |
| `BRAIN_BASE_URL` | Full URL of the brain service |
| `BRAIN_INTERNAL_SECRET` | Shared secret for gateway→brain auth — generate with `openssl rand -hex 32` |
| `GOOGLE_PLACES_API_KEY` | Google Places Nearby Search API key |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default `info`) |

### Brain (`brain/.env`)
| Variable | Description |
|---|---|
| `ENV` | `development` \| `production` |
| `ANTHROPIC_API_KEY` | Anthropic secret key — never forwarded |
| `CLAUDE_MODEL` | Model ID (default `claude-sonnet-4-6`) |
| `BRAIN_INTERNAL_SECRET` | Must match gateway value |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins, e.g. `https://gateway.railway.app,http://localhost:3000` |
| `CACHE_MAXSIZE` | Max entries in AI response cache |
| `CACHE_TTL` | Seconds before cached AI response expires |
| `LOG_LEVEL` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` (default `INFO`) |

### Mobile (`mobile/.env`)
| Variable | Description |
|---|---|
| `EXPO_PUBLIC_GATEWAY_URL` | Gateway URL — `http://localhost:3000` (sim), `http://192.168.x.x:3000` (real device), `https://your-gateway.railway.app` (prod) |

---

## Coding Standards

### General
- **No secrets in source code.** All credentials live in `.env` files (gitignored).
- `.env.example` files are committed and kept up to date for all three services.
- All public-facing inputs are validated at the boundary (Zod in gateway, Pydantic in brain).
- Errors are caught centrally; stack traces are omitted in production.

### Gateway (JavaScript)
- CommonJS modules (`require` / `module.exports`).
- `async/await` with explicit `try/catch`; never swallow errors.
- Validate request bodies with Zod before any business logic.
- Cache keys must be deterministic and collision-resistant (include all query dimensions).
- No business logic in route handlers — delegate to service modules.
- Use `logger` from `lib/logger.js` — never `console.log` in production paths.

### Brain (Python)
- Python 3.11+ type hints everywhere.
- Pydantic models for all request/response shapes.
- `async def` for all FastAPI route handlers and I/O-bound functions.
- AI service layer is the single place that instantiates the Anthropic client.
- Never log the full API key, even partially.
- Use `logging.getLogger(__name__)` — never `print()`.
- Always include `request_id: get_request_id()` in log `extra` dicts.

### Git
- Branch naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- PRs require a description explaining *why*, not just *what*.
- Every commit: author Abhishek Venkatesh, co-author Claude Sonnet 4.6.

---

## Local Development Quick-start

```bash
# 1. Brain
cd brain
cp .env.example .env        # fill in ANTHROPIC_API_KEY, BRAIN_INTERNAL_SECRET
pip install -r requirements.txt
uvicorn main:app --reload

# 2. Gateway (new terminal)
cd gateway
cp .env.example .env        # fill in BRAIN_INTERNAL_SECRET, GOOGLE_PLACES_API_KEY
npm install
npm run dev

# 3. Mobile (new terminal)
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_GATEWAY_URL (localhost or local IP)
npm install
npx expo start
```

Health checks:
- Brain:    `curl http://localhost:8000/health`
- Gateway:  `curl http://localhost:3000/health`

Example requests:
```bash
# Chat bot
curl -s -X POST http://localhost:3000/api/v1/cart/recommend \
  -H 'Content-Type: application/json' \
  -d '{"query":"high-protein breakfast","location":{"lat":37.77,"lng":-122.41}}'

# Nudge Agent (agentic)
curl -s -X POST http://localhost:3000/api/v1/nudge/check \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: my-trace-id' \
  -d '{"purchase_history":[{"name":"Milk","last_bought_at_ms":1771737345126,"store_where":"FreshCo","count":10}],"current_list":[],"days_since_last_trip":14.0}'

# Restock Agent (agentic)
curl -s -X POST http://localhost:3000/api/v1/restock/check \
  -H 'Content-Type: application/json' \
  -d '{"store":{"name":"FreshCo","type":"grocery_only"},"current_list":[],"purchase_history":[{"name":"Milk","last_bought_at_ms":1771737345126,"store_where":"FreshCo","count":5}]}'
```
