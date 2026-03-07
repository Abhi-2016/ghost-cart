# Ghost-Cart — Claude Code Guide

## Project Overview

Ghost-Cart is a **location-aware grocery agent** that combines a Node.js orchestration layer with a Python AI reasoning engine. The two services are intentionally split to isolate concerns, protect secrets, and minimise cost.

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
- Apply rate limiting, security headers (Helmet), and request logging.
- Maintain an in-process response cache (`node-cache`, 10 min TTL).
- Forward cache misses to the Brain over HTTP with a shared internal secret.
- Return structured JSON to clients; never expose the Anthropic API key.

**Key files**
```
gateway/
  src/
    app.js              # Express app setup
    index.js            # HTTP server bootstrap
    routes/cart.js      # POST /api/v1/cart/recommend
    services/
      brainClient.js    # Axios client → brain
      cache.js          # node-cache singleton
    middleware/
      errorHandler.js   # Central error handling
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
- Maintain a second in-process TTL cache (`cachetools`) to avoid duplicate AI calls.
- Return structured JSON: `{ items, reasoning, query_echo }`.

**Key files**
```
brain/
  main.py                        # FastAPI app setup + lifespan
  app/
    config.py                    # pydantic-settings — reads .env
    middleware/auth.py           # X-Internal-Secret gate
    routers/recommend.py         # POST /v1/recommend
    services/ai.py               # Anthropic client + TTL cache
  requirements.txt
  .env.example
```

---

## Communication Protocol

```
Client (browser / mobile)
  │
  │  POST /api/v1/cart/recommend
  │  { query, location: { lat, lng }, radius_km }
  ▼
┌─────────────────────────────┐
│  Gateway  (Node.js :3000)   │
│  • Validate with Zod        │
│  • Check node-cache         │
│  • If MISS →                │
└────────────┬────────────────┘
             │  POST /v1/recommend
             │  Header: X-Internal-Secret: <shared>
             │  Body: { query, location, radius_km }
             ▼
┌─────────────────────────────┐
│  Brain    (Python  :8000)   │
│  • Verify X-Internal-Secret │
│  • Check cachetools TTLCache│
│  • If MISS → Claude API     │
│  • Return JSON              │
└─────────────────────────────┘
```

### Contract

**Request (gateway → brain)**
```json
{
  "query": "high-protein breakfast items",
  "location": { "lat": 37.7749, "lng": -122.4194 },
  "radius_km": 5
}
```

**Response (brain → gateway → client)**
```json
{
  "items": [
    {
      "name": "Greek Yogurt",
      "category": "Dairy",
      "estimated_price_usd": 1.99,
      "why_suggested": "High protein, widely available, fits budget."
    }
  ],
  "reasoning": "Selected items balance protein density with local availability.",
  "query_echo": "high-protein breakfast items",
  "_cache": "MISS"
}
```

The `_cache` field (`"HIT"` | `"MISS"`) is added by the gateway and indicates whether the response was served from the node-cache layer.

---

## Environment Variables

### Gateway (`gateway/.env`)
| Variable | Description |
|---|---|
| `PORT` | Express listen port (default `3000`) |
| `NODE_ENV` | `development` \| `production` |
| `BRAIN_BASE_URL` | Full URL of the brain service |
| `BRAIN_INTERNAL_SECRET` | Shared secret for gateway→brain auth |

### Brain (`brain/.env`)
| Variable | Description |
|---|---|
| `ENV` | `development` \| `production` |
| `ANTHROPIC_API_KEY` | Anthropic secret key — never forwarded |
| `CLAUDE_MODEL` | Model ID (default `claude-sonnet-4-6`) |
| `BRAIN_INTERNAL_SECRET` | Must match gateway value |
| `CACHE_MAXSIZE` | Max entries in AI response cache |
| `CACHE_TTL` | Seconds before cached AI response expires |

---

## Coding Standards

### General
- **No secrets in source code.** All credentials live in `.env` files (gitignored).
- `.env.example` files are committed and kept up to date.
- All public-facing inputs are validated at the boundary (Zod in gateway, Pydantic in brain).
- Errors are caught centrally; stack traces are omitted in production.

### Gateway (JavaScript)
- CommonJS modules (`require` / `module.exports`).
- `async/await` with explicit `try/catch`; never swallow errors.
- Validate request bodies with Zod before any business logic.
- Cache keys must be deterministic and collision-resistant (include all query dimensions).
- No business logic in route handlers — delegate to service modules.

### Brain (Python)
- Python 3.11+ type hints everywhere.
- Pydantic models for all request/response shapes.
- `async def` for all FastAPI route handlers and I/O-bound functions.
- AI service layer is the single place that instantiates the Anthropic client.
- Never log the full API key, even partially.

### Git
- Branch naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- PRs require a description explaining *why*, not just *what*.

---

## Local Development Quick-start

```bash
# 1. Brain
cd brain
cp .env.example .env        # fill in ANTHROPIC_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload

# 2. Gateway (new terminal)
cd gateway
cp .env.example .env
npm install
npm run dev
```

Health checks:
- Gateway: `curl http://localhost:3000/health`
- Brain:   `curl http://localhost:8000/health`

Example request:
```bash
curl -s -X POST http://localhost:3000/api/v1/cart/recommend \
  -H 'Content-Type: application/json' \
  -d '{"query":"high-protein breakfast","location":{"lat":37.77,"lng":-122.41}}'
```
