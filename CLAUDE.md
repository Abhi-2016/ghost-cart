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

## Production Deployment

### Live URLs (Railway)

| Service | URL |
|---|---|
| Gateway | `https://gateway-production-9495.up.railway.app` |
| Brain | `https://ghost-cart-production.up.railway.app` |

Health checks: append `/health` to either URL.

### Railway — Monorepo Setup Notes

This is a monorepo (gateway + brain + mobile in one repo). Railway must be told which subdirectory is each service's root, or it deploys from `/` and can't find `main.py` / `package.json`.

**Critical step — set Root Directory per service via GraphQL API:**
```bash
RAILWAY_TOKEN=$(cat ~/.railway/config.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['accessToken'])")
PROJECT_ID="6cf3cc6f-83c9-4150-b90e-ba6ca30fd034"
ENV_ID="9d8cf807-a919-4e8c-b299-e249fb2e2d9e"

# Brain: root = "brain"
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceUpdate(serviceId: \"<BRAIN_ID>\", environmentId: \"<ENV_ID>\", input: { rootDirectory: \"brain\" }) }"}'

# Gateway: root = "gateway"  
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceUpdate(serviceId: \"<GW_ID>\", environmentId: \"<ENV_ID>\", input: { rootDirectory: \"gateway\" }) }"}'
```

After setting root directories, deploy from the **repo root**:
```bash
railway up --service <BRAIN_SERVICE_ID> --detach --ci      # from repo root
railway up --service <GATEWAY_SERVICE_ID> --detach --ci    # from repo root
```

### EAS Build (Mobile)

| Property | Value |
|---|---|
| Expo account | `abhiai90` |
| Project slug | `ghost-cart` |
| EAS Project ID | `0bfcd389-eca1-4cd6-a3eb-dd99f7d2ee08` |
| Android bundle ID | `com.abhishek.ghostcart` |
| iOS bundle ID | `com.abhishek.ghostcart` |

Build commands:
```bash
cd mobile
eas build --platform android --profile preview   # APK for internal testers
eas build --platform android --profile production # AAB for Play Store
eas build --platform ios     --profile preview   # iOS (requires Apple Dev account)
```

`EXPO_PUBLIC_GATEWAY_URL` is set as an EAS environment variable (not in `.env`) — it is baked into the binary at build time. Changing it requires a new build.

**Known issue fixed:** `mobile/.npmrc` contains `legacy-peer-deps=true` to resolve a peer dependency conflict between `react@19.1.0` (Expo SDK 54 default) and `react-dom@19.2.4` (indirect dependency). Without this file, `npm install` fails on the EAS build server.

### Known Bug Fixed in Production

**`brain/app/services/ai.py` — JSON code fence stripping:**
Claude sometimes wraps its JSON response in `` ```json `` ... `` ``` `` markdown blocks. `json.loads()` fails on the backtick prefix with `"Expecting value: line 1 column 1 (char 0)"`. The fix strips code fences before parsing:
```python
if raw_text.startswith("```"):
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```\s*$", "", raw_text)
```
Apply this pattern to any service that parses free-form JSON from Claude.

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
| Agentic vs. non-agentic taxonomy | 8-feature decision matrix in README: who decides, Claude call count, `tool_choice` mode, output format — for every feature |
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

## Architecture Decisions

| Decision | What Was Decided | Why |
|---|---|---|
| **Service split** | Three separate services: Node.js gateway, Python brain, React Native mobile — not a monolith | Isolates concerns; each service has a single job. Gateway handles I/O and validation, brain handles AI, mobile handles UX. Independent deployable units. |
| **Brain is not publicly routable** | Brain accepts requests only from the gateway via an internal network; it has no public URL that works without the secret header | `ANTHROPIC_API_KEY` never leaves the brain process. Even if the gateway is fully compromised, the AI key cannot be extracted. |
| **Gateway-to-brain auth** | `X-Internal-Secret` shared header, not JWT or OAuth | Simple, stateless, no token expiry to manage. The only consumer of the brain is the gateway — a lightweight secret is the right tool for a trusted internal channel. |
| **Hybrid language stack** | Node.js for gateway, Python for brain | Node.js handles high-throughput async I/O well; Python has the best AI/ML ecosystem. Using the right language per job outweighs the overhead of a polyglot stack. |
| **AI framework** | Direct Anthropic Python SDK (`anthropic.AsyncAnthropic`) — no LangChain or wrapper | LangChain adds ~150 MB of abstraction designed for multi-model chains and RAG pipelines. Ghost-Cart calls a single Claude endpoint; the direct SDK is leaner, typed, and easier to debug. |
| **Agentic loop mechanism** | `tool_choice="auto"` with a `while` loop for Restock and Nudge agents | Gives Claude genuine autonomy — it decides what to call and when to stop. Code provides tools and context; Claude provides judgment. This is the line between "AI as function call" and "AI as agent." |
| **Non-agentic AI calls** | `tool_choice="tool"` (forced) for the Intent Filter | The Intent Filter output must be deterministic and code-controlled. Forcing the tool call guarantees the response shape; Claude doesn't need to decide whether to call it. |
| **Tool design** | `send_nudge` and `skip_nudge` as deliberate opposites; both require a reason | No silent no-op path. Claude must make an explicit binary decision and provide reasoning — this produces a clean audit trail in logs and forces deliberate behaviour rather than drift. |
| **Business rules in tool schema** | Urgency thresholds (low 5–9d / medium 10–13d / high 14+d) live in `input_schema` description fields | Business logic belongs where Claude reads it. Changing a threshold means editing the schema, not the application code — no redeployment of conditional logic required. |
| **Stateless agent API** | Full context (purchase history, days elapsed, current list) sent on every agent request — no server-side session state | Simpler, cheaper, more reliable. Each request is self-contained; no state drift between calls, no session storage to maintain. Horizontal scaling is trivial. |
| **Agent safety nets** | `MAX_ITERATIONS = 10` hard cap + hardcoded fallback result if Claude never calls a tool | Prevents infinite loops and runaway API spend. If Claude produces no tool call after the cap, the caller still gets a valid deterministic response — the system never hangs. |
| **Two-layer caching** | `node-cache` in gateway (10 min TTL) + `TTLCache` in brain | Cache hits at the gateway never reach the brain or Claude API — that's the primary cost lever. The brain cache provides a second line for any requests that bypass the gateway. Projected ~60% fewer API calls at 60% hit rate. |
| **Log storage** | Structured JSON to stdout — no logging database | Logs are a stream, not a table. Railway captures stdout automatically; a Logtail HTTP drain makes all JSON fields (`input_tokens`, `latency_ms`, `request_id`) instantly searchable. Writing logs to Postgres would be slow, expensive, and the wrong query pattern. |
| **Correlation IDs** | `X-Request-ID` generated at gateway, forwarded to brain, stored in `ContextVar`, logged on every event | A single `grep` across both services reconstructs a complete user action — from the gateway request through all Claude iterations — without cross-referencing timestamps or guessing. |
| **AI response handling** | `re.sub` strips `` ```json``` `` fences before every `json.loads()` call | Claude reliably wraps JSON in markdown code blocks even when prompted not to. `json.loads()` fails on the backtick with a cryptic error. Stripping first is a defensive pattern that belongs in every service that parses Claude's output. |
| **Mobile framework** | React Native + Expo SDK 54 with Expo Router | Single codebase for iOS and Android; Expo handles native modules, build tooling, and OTA updates. Expo Router gives file-based navigation consistent with modern web conventions. |
| **Mobile state** | Zustand + AsyncStorage | Zustand is lighter than Redux with no boilerplate. AsyncStorage gives offline-first persistence — shopping list and history survive app restarts with no backend dependency in the MVP. |
| **GPS store detection** | Haversine distance formula, polled every 30 seconds | Cross-platform and permission-light compared to OS geofencing APIs. 30s polling is fine-grained enough for store entry detection without draining battery. Deterministic and easy to test. |
| **Mobile distribution** | EAS (Expo Application Services) for builds; APK for Android testers, Expo Go for iOS until Apple Developer enrollment | EAS manages Android/iOS build toolchains without local Xcode or Android Studio setup. APK distribution is immediate for Android; Expo Go covers iOS without the $99/yr enrollment cost for early-stage testing. |
| **Behavior specification** | `test_cases.json` with 12 input/expected-decision pairs (TC-01→TC-12) | AI agents need behavior specs, not just unit tests. Each case defines what Claude *should decide* given a specific context — a PM-level contract that doubles as a regression suite. |
