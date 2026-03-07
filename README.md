# Ghost-Cart

> A location-aware grocery agent that tells you *what* to buy and *where* to find it nearby.

---

## What It Does

Ghost-Cart accepts a natural-language grocery query (e.g. *"high-protein breakfast for two"*) plus the user's GPS coordinates and returns a ranked list of grocery items with price estimates and context-aware reasoning — ready to feed a shopping list or a store-routing UI.

---

## Why a Hybrid Stack? (PM Rationale)

### The Problem With a Single-Service Approach

A naive implementation would put everything — API routing, AI calls, caching — inside one server. That creates two serious problems at scale:

| Problem | Impact |
|---|---|
| **API key exposure** | A single-service server that also serves a browser client must either expose the Anthropic key in the bundle or add auth middleware that's easy to misconfigure. |
| **Cost at scale** | Every user query hitting Claude directly costs money. Identical queries from users near the same neighbourhood would each trigger a full API round-trip. |

### The Solution: A Two-Layer Architecture

```
Browser / Mobile  →  Gateway (Node.js)  →  Brain (Python)  →  Claude API
```

#### Layer 1 — Gateway (Node.js / Express)

Node.js is the industry standard for API gateways. It excels at:

- **I/O-bound fan-out** — proxying requests, checking caches, validating payloads.
- **Ecosystem** — Helmet, rate-limit, Zod, and node-cache are all production-grade and trivial to wire together.
- **Operational familiarity** — most front-end and full-stack engineers can read and maintain Express without context-switching.

The gateway is the **only service exposed to the internet**. It enforces:
- Input validation (Zod) before any data touches the AI layer.
- Rate limiting (60 req / min / IP) to prevent abuse.
- A response cache (`node-cache`, 10-min TTL) keyed on `(query, rounded-lat, rounded-lng)`. Cache hits never reach the brain — this is the primary cost-control lever.

#### Layer 2 — Brain (Python / FastAPI)

Python is the lingua franca of AI/ML. It gives us:

- **First-class Anthropic SDK** — async client, typed responses, streaming support.
- **FastAPI + Pydantic** — automatic schema validation and OpenAPI docs with zero boilerplate.
- **Isolation** — the `ANTHROPIC_API_KEY` lives only inside this process. It is never forwarded to the gateway, never logged, never serialised into a response.

The brain is **not publicly routable**. It only accepts requests that carry the correct `X-Internal-Secret` header, which is shared exclusively with the gateway via environment variables.

A second, in-process `cachetools.TTLCache` sits inside the brain as a backstop — if the gateway cache is cold (e.g. after a restart) but the brain has seen the same query recently, the AI call is still skipped.

### Security Model

```
Internet → [Gateway] — validated, rate-limited — → [Brain] — secret-gated — → Claude
                ↑                                        ↑
           No AI keys                            No public route
```

- **API key never leaves the brain process.** Even if the gateway is fully compromised, the attacker cannot extract the Anthropic key.
- **Internal secret** prevents anyone who discovers the brain's port from calling it directly.
- **Helmet + rate-limit** on the gateway handle the standard OWASP surface.

### Cost Model

```
Monthly Claude cost ≈ (total_requests × (1 − cache_hit_rate)) × cost_per_call
```

In a dense urban area, many users within ~1 km will make semantically identical queries (e.g. *"cheap fruit"*). The gateway cache collapses those into a single upstream call. At a 60 % hit rate on 100 k monthly requests, that's 60 k fewer AI calls — roughly **60 % cost reduction** before any other optimisation.

---

## Project Structure

```
Ghost-Cart/
├── gateway/            # Node.js Orchestrator
│   ├── src/
│   │   ├── app.js
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── services/
│   │   └── middleware/
│   ├── package.json
│   └── .env.example
│
├── brain/              # Python AI Engine
│   ├── main.py
│   ├── app/
│   │   ├── config.py
│   │   ├── middleware/
│   │   ├── routers/
│   │   └── services/
│   ├── requirements.txt
│   └── .env.example
│
├── CLAUDE.md           # Architecture contract + coding standards
└── README.md           # This file
```

---

## Quick Start

```bash
# Terminal 1 — Brain
cd brain && cp .env.example .env   # add ANTHROPIC_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 — Gateway
cd gateway && cp .env.example .env
npm install && npm run dev

# Test
curl -s -X POST http://localhost:3000/api/v1/cart/recommend \
  -H 'Content-Type: application/json' \
  -d '{"query":"cheap fruit","location":{"lat":37.77,"lng":-122.41}}'
```

---

## Roadmap

### In Progress
- [ ] Mobile app (React Native / Expo) — chat bot + smart list UI

### Planned
- [ ] **Photo-to-list** — user takes a photo of a handwritten or printed grocery list; AI reads it and converts it into items in the app automatically
- [ ] **PostgreSQL database** — persist user lists, purchase history, and preferences across devices and sessions; replaces in-memory/local storage
- [ ] Store lookup integration (Google Places / Foursquare)
- [ ] User preference profiles (dietary restrictions, budget)
- [ ] Streaming responses via SSE
- [ ] Redis cache layer for multi-instance deployments
- [ ] Docker Compose for one-command local setup
