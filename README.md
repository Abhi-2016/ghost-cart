# Ghost-Cart

> **Location-aware AI shopping assistant** — Claude autonomously decides what to restock, when to nudge you to go shopping, and what to say. Built on a Node.js gateway + Python FastAPI brain + React Native app.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://python.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2054-0EA5E9?logo=expo&logoColor=white)](https://expo.dev)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-D97706?logo=anthropic&logoColor=white)](https://anthropic.com)
[![Gateway](https://img.shields.io/badge/Gateway-Live%20on%20Railway-0B0D0E?logo=railway&logoColor=white)](https://gateway-production-9495.up.railway.app/health)
[![Brain](https://img.shields.io/badge/Brain-Live%20on%20Railway-0B0D0E?logo=railway&logoColor=white)](https://ghost-cart-production.up.railway.app/health)

---

## What is Ghost-Cart?

Ghost-Cart is a grocery assistant that goes beyond a simple list app — it actively reasons about your shopping needs using Claude AI.

| Capability | How it works |
|---|---|
| **Chat to build your list** | Type naturally ("high-protein breakfast") — Claude suggests items and adds them |
| **Smart store filtering** | Walk into a store and the list automatically hides items that store doesn't carry |
| **Restock Agent** | Claude scans your purchase history and autonomously decides what to add back |
| **Nudge Agent** | After 12h in the background, Claude decides whether to send a push notification and writes the copy itself |
| **GPS store detection** | Polls every 30s; detects when you enter a known store and triggers agents automatically |

The two **agentic** features (Restock + Nudge) use `tool_choice="auto"` with a while-loop — Claude runs freely until it decides it's done, with no hard-coded rules or thresholds.

---

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

### Shipped ✅
| Feature | Notes |
|---|---|
| AI chat bot | Live in production |
| GPS store detection | Haversine distance, 30s polling |
| Store-aware intent filter | `tool_choice="tool"` non-agentic |
| Restock Agent | `tool_choice="auto"` agentic loop |
| Nudge Agent | `tool_choice="auto"` agentic loop + local push notifications |
| Structured JSON logging | Correlation IDs, `X-Request-ID` end-to-end |
| Railway deployment | Gateway + Brain live, health checks passing |
| EAS Android APK | Preview build, internal distribution |

### Up Next
| # | Feature | What it does | Why it's agentic |
|---|---|---|---|
| 1 | **Google Places key** | Enable "locate nearby stores" endpoint | Not agentic — adds missing env var |
| 2 | **Logtail log drain** | Searchable structured logs in production | Not agentic — Railway log drain config |
| 3 | **iOS build** | TestFlight for 2 iOS testers | Requires Apple Developer enrollment |
| 4 | **Multi-Store Trip Planner** | Claude plans the most efficient route across multiple stores | Claude decides store order and item routing — no code rules |
| 5 | **Meal Planning Agent** | "Plan dinners for this week" → full meal plan + list populated | Multi-step loop: meals → pantry gaps → ingredients → nutrition |
| 6 | **Budget Agent** | Set a spend limit; Claude swaps expensive items autonomously | Claude evaluates trade-offs across loop rounds |
| 7 | **Receipt Scanner** | Photo of receipt → Claude extracts purchases, updates history | Claude reads unstructured data, maps to structured records |
| 8 | **Pantry Memory** | Tracks what's at home; Claude avoids re-buying | Claude reasons across pantry + history + list per run |
| 9 | **Langfuse evals** | Score Claude's tool decisions in production | — |
| 10 | **PostgreSQL persistence** | Persist lists and history across devices | — |

---

## Quick Start

### Brain (Python / FastAPI)

```bash
cd brain
cp .env.example .env        # fill in ANTHROPIC_API_KEY, BRAIN_INTERNAL_SECRET, ALLOWED_ORIGINS
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000/health
```

### Gateway (Node.js / Express)

```bash
cd gateway
cp .env.example .env        # fill in BRAIN_INTERNAL_SECRET, GOOGLE_PLACES_API_KEY
npm install
npm run dev
# → http://localhost:3000/health
```

### Mobile (React Native / Expo)

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_GATEWAY_URL (see options below)
npm install
npx expo start
# Scan QR code with Expo Go on your device
```

`EXPO_PUBLIC_GATEWAY_URL` options:
- **Simulator:** `http://localhost:3000`
- **Real device (same WiFi):** `http://192.168.x.x:3000` — your machine's local IP
- **Production:** `https://your-gateway.railway.app`

---

## Example Requests

Use `http://localhost:3000` locally or the live gateway URL in production.

### Grocery recommendations (chat bot)
```bash
curl -s -X POST https://gateway-production-9495.up.railway.app/api/v1/cart/recommend \
  -H 'Content-Type: application/json' \
  -d '{"query":"high-protein breakfast","location":{"lat":37.77,"lng":-122.41}}'
```

### Nudge Agent (agentic)
```bash
curl -s -X POST https://gateway-production-9495.up.railway.app/api/v1/nudge/check \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: my-trace-id' \
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

### Restock Agent (agentic)
```bash
curl -s -X POST https://gateway-production-9495.up.railway.app/api/v1/restock/check \
  -H 'Content-Type: application/json' \
  -d '{
    "store": {"name":"FreshCo","type":"grocery_only"},
    "current_list": [],
    "purchase_history": [
      {"name":"Milk","last_bought_at_ms":1771737345126,"store_where":"FreshCo","count":5}
    ]
  }'
```

---

## Environment Variables

### `gateway/.env`

| Variable | Description |
|---|---|
| `PORT` | Express listen port (default `3000`) |
| `NODE_ENV` | `development` \| `production` |
| `BRAIN_BASE_URL` | Full URL of the brain service |
| `BRAIN_INTERNAL_SECRET` | Shared secret for gateway → brain auth — `openssl rand -hex 32` |
| `GOOGLE_PLACES_API_KEY` | Google Places Nearby Search key |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default `info`) |

### `brain/.env`

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic secret key — never forwarded to clients |
| `CLAUDE_MODEL` | Model ID (default `claude-sonnet-4-6`) |
| `BRAIN_INTERNAL_SECRET` | Must match gateway value |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins — set to your gateway URL in production |
| `CACHE_MAXSIZE` | Max entries in AI response cache |
| `CACHE_TTL` | Seconds before cached AI response expires |
| `LOG_LEVEL` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` (default `INFO`) |

### `mobile/.env`

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_GATEWAY_URL` | Gateway URL baked in at build time — `http://localhost:3000` for local dev |

---

## Logging

All logs are structured JSON written to stdout — captured automatically by Railway/Render in production with no extra setup.

```bash
LOG_LEVEL=INFO    # production (default)
LOG_LEVEL=DEBUG   # shows every Claude loop iteration and tool call
```

Every request gets an `X-Request-ID` correlation ID forwarded from gateway → brain, so you can trace a single user action across both services:

```json
{"event":"brain.call",         "endpoint":"/v1/nudge","latency_ms":3813,"request_id":"abc123"}
{"event":"agent.start",        "agent":"nudge","days_since_last_trip":14.0,"request_id":"abc123"}
{"event":"agent.claude_response","input_tokens":1263,"output_tokens":198,"latency_ms":3797,"request_id":"abc123"}
{"event":"agent.tool_call",    "tool":"send_nudge","urgency":"high","suggested_items":["Milk","Eggs"],"request_id":"abc123"}
{"event":"agent.complete",     "action":"send","iterations":1,"total_latency_ms":3798,"request_id":"abc123"}
{"event":"request",            "method":"POST","status":200,"latency_ms":3822,"request_id":"abc123"}
```

`input_tokens + output_tokens` on every `agent.claude_response` line maps directly to Claude API cost.

---

## Project Structure

```
Ghost-Cart/
├── gateway/                  # Node.js Orchestrator (:3000)
│   └── src/
│       ├── routes/           # cart, intent, stores, restock, nudge
│       ├── services/         # brainClient (with latency logging), cache, placesClient
│       ├── middleware/       # errorHandler, requestLogger (JSON, replaces morgan)
│       └── lib/              # logger.js (JSON writer), requestContext.js (AsyncLocalStorage)
│
├── brain/                    # Python AI Engine (:8000)
│   └── app/
│       ├── routers/          # recommend, intent, restock, nudge
│       ├── services/         # ai, restock_agent, nudge_agent (all with structured logs)
│       ├── middleware/       # auth, request_id (ContextVar correlation ID)
│       ├── logging_config.py # JSON formatter via python-json-logger
│       └── config.py         # pydantic-settings (incl. ALLOWED_ORIGINS, LOG_LEVEL)
│
├── mobile/                   # React Native / Expo App
│   ├── app/                  # Expo Router screens + layout
│   ├── hooks/                # useLocationWatcher, useNudgeAgent
│   ├── services/             # api.ts, storeLookup.ts (both read EXPO_PUBLIC_GATEWAY_URL)
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

## Deployment

### Live Production (Railway)

Both services are deployed and healthy:

| Service | URL | Status |
|---|---|---|
| Gateway | `https://gateway-production-9495.up.railway.app` | ✅ Live |
| Brain | `https://ghost-cart-production.up.railway.app` | ✅ Live |

```bash
# Verify both are up
curl https://gateway-production-9495.up.railway.app/health
curl https://ghost-cart-production.up.railway.app/health
```

---

### Railway — Re-deploying (Monorepo)

This is a monorepo. Both services share one repo. Railway must be told each service's root directory or it sees the whole repo and fails to detect the language.

The root directories are already configured in Railway (`brain` → `brain/`, `gateway` → `gateway/`). To push new code to either service, run from the **repo root**:

```bash
# Re-deploy brain
railway up --service 2b457fa4-fa83-4a95-a082-c816ef3fc563 --detach --ci

# Re-deploy gateway
railway up --service 893da436-e5ac-4379-a4d9-5709316c9fa0 --detach --ci
```

**Setting env vars via CLI:**
```bash
railway variable set "KEY=value" --service <SERVICE_ID> --skip-deploys
```

---

### EAS Build (Mobile)

The mobile app is set up on EAS. Project: `@abhiai90/ghost-cart` (ID: `0bfcd389-eca1-4cd6-a3eb-dd99f7d2ee08`).

`EXPO_PUBLIC_GATEWAY_URL` is already set as an EAS environment variable for `preview` and `production` environments — it is baked into the binary at build time.

**Build a new Android APK for testers:**
```bash
cd mobile
eas build --platform android --profile preview
```

This outputs a QR code + download link to share with testers directly.

**iOS** (requires Apple Developer account — $99/yr):
```bash
eas build --platform ios --profile preview
```

> **Note:** `mobile/.npmrc` sets `legacy-peer-deps=true` to resolve a `react-dom` peer dependency conflict during the EAS build. Do not remove this file.

---

### Observability (Logtail)

Gateway and Brain already emit structured JSON logs to stdout — Railway captures stdout automatically. To make logs searchable:

1. Sign up at [logtail.com](https://logtail.com) → create a Source (HTTP type) → copy the Source Token
2. In Railway: **Settings → Log Drains** → add HTTP drain to `https://in.logtail.com/` with your token
3. Done — all JSON fields (`event`, `latency_ms`, `request_id`, `agent`, `input_tokens`, etc.) are immediately queryable

No code changes required.

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

---

## Concepts Practised

### Agentic AI — how Claude was given autonomy to decide and act

| Concept | Where Practised |
|---|---|
| Tool use loop | `nudge_agent.py`, `restock_agent.py` — `tool_use` blocks fed back as `tool_result` each iteration |
| `tool_choice` as a design lever | Agents use `"auto"` (Claude decides freely); Intent Filter uses `"tool"` (code forces the call); Chat bot uses neither |
| Tool design as interface contract | `send_nudge` / `skip_nudge` as deliberate opposites — Claude must make an explicit binary choice; no silent no-op path |
| Tool schema as business rule | Urgency thresholds (low 5–9d · medium 10–13d · high 14+d) live in `input_schema` description fields, not in application code |
| Agentic loop safety nets | `MAX_ITERATIONS = 10` cap + hardcoded skip fallback + `agent.fallback` log event if Claude never calls a tool |
| Stateless agent API | Full context (purchase history, days elapsed, current list) sent on every request — no session state held server-side |
| History as agent context | `purchase_history` + `days_since_last_trip` give Claude everything it needs, reconstructed fresh on each call |
| AI reliability pattern | Claude wraps JSON in ` ```json``` ` fences — `re.sub` strips them before `json.loads()` in `ai.py`; pattern documented for all future services |
| Human-in-the-loop by design | Claude decides *whether* to notify, *what* to write, and at *what urgency* — humans receive the result, not configure it |
| AI copy generation | Push notification title + body written by Claude from context — specific, not templated; schema constrains format, not content |

### AI PM — product decisions specific to AI-powered systems

| Concept | Where Practised |
|---|---|
| Agentic vs. non-agentic taxonomy | 8-feature decision matrix in this README: who decides, Claude call count, `tool_choice` mode, output format — for every feature |
| AI cost control as architecture | Two cache layers designed first: `node-cache` (gateway, 10 min TTL) + `TTLCache` (brain) — ~60% fewer API calls at 60% hit rate |
| AI observability | `input_tokens`, `output_tokens`, `latency_ms` logged on every Claude call — maps to cost per loop iteration, not just per request |
| Correlation ID for AI tracing | `X-Request-ID` forwarded gateway → brain, stored in `ContextVar` — one `grep` reconstructs a full user tap across both services |
| Evaluation strategy for agents | `test_cases.json` v0.3.0 — 12 input/expected-decision pairs defining what Claude *should decide*, not just valid output |
| AI security architecture | `ANTHROPIC_API_KEY` isolated in brain; gateway communicates via `X-Internal-Secret` and never sees the AI key |
| Prompt engineering for structured output | System prompt includes exact JSON schema; decision guidelines in prompt body, not in code conditionals |
| LLM as decision engine | Threshold logic (stale vs. fresh, nudge vs. skip) owned by Claude — no hardcoded rules in application code |
| AI debugging in production | `stop_reason`, token counts, and per-iteration latency → root-caused a live 502 to Claude wrapping JSON in code fences |
| Skills as codified AI workflow | SKILL.md system explored to encode deploy, test, and agent-scaffold steps as project-specific slash commands |

### Classic PM — foundational product management applied throughout

| Concept | Where Practised |
|---|---|
| MVP scoping | 8 features shipped; 9 deferred — each roadmap item includes a "why agentic" rationale, not just a feature name |
| PR-driven delivery | 9 PRs, each single-scope, conventional commit style; descriptions explain *why*, not just what |
| Go-live planning | 5-step checklist: Railway services via GraphQL API, root directory config, env vars, EAS build, smoke tests |
| Cost control as PM decision | Caching designed before feature code — "~60% fewer AI calls" stated as a product metric, not an engineering footnote |
| Security as architecture | Brain not publicly routable — a trust boundary decision made at product design level, not retrofitted after |
| Documentation as product artifact | README as external landing page; CLAUDE.md as internal spec — both updated in every PR |
| Test cases as behavior contract | `test_cases.json` TC-01→TC-12 defines what Claude should decide per scenario — a PM spec, not just a QA checklist |
| Context continuity | `.claude/ghost-cart-project-plan.md` + memory system — any session resumes without re-establishing context |
| Mobile distribution strategy | APK (internal testers) → AAB (Play Store) → TestFlight (iOS, blocked on Apple enrollment) — three tiers with explicit prerequisites |
| Dependency tracking | Live blocker list: Google Places key (external), Logtail drain (Railway config), iOS build ($99/yr enrollment) |

---

## Key Wrong Calls — and Corrections

A retrospective of 13 decisions made during the Ghost-Cart build that were challenged and corrected.

| Wrong Call | Why It Was Wrong | What We Did Instead |
|---|---|---|
| **[AI]** Use LangChain to talk to Claude | LangChain is built for chaining multiple models and RAG pipelines — ~150 MB of abstraction for a single Claude endpoint. Its own abstraction layer adds a failure surface and makes the integration harder to debug. | Used the Anthropic Python SDK directly (`anthropic.AsyncAnthropic`). One dependency, fully typed, no layer between the code and Claude's API behaviour. |
| **[Product]** "The app has nothing agentic — I've failed as an AI PM" | The framing was wrong, not the facts. The GPS→store detection→intent filter chain was a perception-decision-action loop — just shallow, because *code* was making all decisions for Claude. Real diagnosis: "Claude is a function call, not an agent." | Built the Restock Agent with `tool_choice="auto"` and a while-loop. Then the Nudge Agent. Two genuinely agentic features, designed from first principles. |
| **[Process]** "I've already integrated GitHub — Claude can push directly" | Claude Code can't authenticate to GitHub on your behalf. OAuth requires the user to run the flow in their own terminal — Claude only picks up credentials already stored. | Ran `gh auth login` and `railway login` manually. Claude then used the stored tokens for all subsequent git and Railway operations. |
| **[Product]** Build an MCP to query Walmart's real inventory database | Walmart has no public API for real-time inventory. Designing a feature spec around a data source that doesn't exist is a PM mistake — validate supply before building the feature. | Moved to roadmap with a note that a mock/simulated inventory endpoint covers the demo and the technical pattern. |
| **[AI]** "Do we need a database to store logs?" | Logs are an append-only stream, not relational data. Writing token counts and latency to Postgres would be slow, expensive at scale, and the wrong query pattern — logs need full-text search, not SQL joins. | stdout → Railway captures it → Logtail HTTP log drain. No extra DB, no schema. All structured fields (`input_tokens`, `latency_ms`, `request_id`) immediately searchable. |
| **[Process]** Plan on TestFlight for 2 iOS testers right away | TestFlight requires the Apple Developer Program ($99/yr). Without enrollment you can't upload builds, create TestFlight groups, or distribute to real devices outside Expo Go. | iOS testers use Expo Go (scan QR, free, immediate). Android testers get an EAS APK link. TestFlight is an explicit roadmap item with its prerequisite stated. |
| **[Technical]** `eas init --id "ghost-cart"` with a human-readable slug | EAS's `--id` flag expects a UUID, not a slug. The command silently wrote `"projectId": "ghost-cart"` into `app.json`, causing GraphQL errors on every EAS build with no helpful error message. | Removed the bad block and ran `eas init --non-interactive --force`, which generated the proper UUID (`0bfcd389-eca1-4cd6-a3eb-dd99f7d2ee08`). |
| **[Technical]** `cd brain && railway up` to deploy just the brain | Railway always uploads from the git root regardless of shell directory. Running from `brain/` still sent the entire monorepo; Railway couldn't detect the language without a root directory configured. | Set `rootDirectory: "brain"` and `rootDirectory: "gateway"` per service via the Railway GraphQL API; deployed from repo root with `railway up --service <ID>`. |
| **[Technical]** Assumed `railway service create` was a valid CLI command | Railway CLI v4 has no `service create` subcommand. Service management beyond basic deploys requires the dashboard or GraphQL API — a gap that only surfaces when you try it. | Created the gateway service via the Railway GraphQL `serviceCreate` mutation, then used the returned ID for all subsequent deploys. |
| **[Technical]** Started the EAS Android build without a `.npmrc` | Expo SDK 54 pins `react@19.1.0` but an indirect dep (`react-dom@19.2.4`) requires `react@^19.2.4`. The EAS build server fails with a peer conflict that doesn't appear in local dev. | Added `mobile/.npmrc` with `legacy-peer-deps=true`. EAS Build picks it up automatically — no config workarounds needed. |
| **[AI]** Assumed Claude would return raw JSON with no special handling | Claude often wraps JSON in ` ```json ``` ` markdown blocks even when the prompt asks for JSON. `json.loads()` fails on the backtick — a silent 502 in production that's hard to trace. | Added `re.sub` stripping before every `json.loads()` call in `ai.py`. Pattern documented in CLAUDE.md for all future services. |
| **[Process]** Asked about "skills.md" as a standard Claude Code filename | There is no file called `skills.md`. Treating an assumed filename as a known spec without verifying first is a gap between confidence and knowledge. | Looked up the real format from existing plugin files: it's `SKILL.md` (uppercase) inside `.claude/skills/<name>/`, with YAML frontmatter controlling invocation mode and tool access. |
| **[Process]** Create a PR containing the HTML artifact file | An HTML file renders as raw markup in GitHub's file viewer and doesn't integrate with the docs people actually read. A browser deliverable isn't useful as a repo source file. | Updated `README.md`, `CLAUDE.md`, and the project plan with markdown tables instead — embedded in the docs that already exist, no orphan file. |
