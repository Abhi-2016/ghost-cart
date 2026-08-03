# Ghost-Cart — Project Plan & Current State
_Last updated: 2026-04-25_

---

## What This Project Is

Ghost-Cart is a **location-aware AI grocery assistant** — three services working together:

| Service | Stack | Port | Railway URL |
|---|---|---|---|
| **Gateway** | Node.js / Express | 3000 | `https://gateway-production-9495.up.railway.app` |
| **Brain** | Python / FastAPI | 8000 | `https://ghost-cart-production.up.railway.app` |
| **Mobile** | React Native / Expo | 8081 (Metro) | EAS: `@abhiai90/ghost-cart` |

Everything flows: **Mobile → Gateway → Brain → Claude API**. The brain is never public-facing.

---

## Current Status: LIVE IN PRODUCTION ✅

Both Railway services are deployed and healthy. Android APK built and ready to share with testers.

```bash
# Verify both are up right now
curl https://gateway-production-9495.up.railway.app/health
curl https://ghost-cart-production.up.railway.app/health
```

---

## What Has Been Built (All Merged to main)

| PR | Branch | What it did |
|---|---|---|
| #1 | fix/list-apostrophe-syntax-error | Fix SyntaxError — apostrophe in single-quoted string in list.tsx |
| #2 | fix/index-router-replace-during-render | Fix React render-phase navigation crash in index.tsx |
| #3 | feat/nudge-agent | **Nudge Agent** — agentic push notifications after 12h background |
| #4 | chore/test-cases-nudge-agent | Test cases TC-09→TC-12 for Nudge Agent |
| #5 | docs/update-readme | Full README rewrite |
| #6 | logging | **Structured JSON logging** with X-Request-ID correlation IDs |
| #7 | fix/production-blockers | Fix 3 prod blockers: mobile BASE_URL, brain CORS, .env.example files |
| #8 | docs/project-description | GitHub repo description, badges, topics |
| #9 | feat/go-live | Railway.toml, eas.json, .env.example updates |

**Commits directly to main (post-PR-9):**
- `fix: add .npmrc legacy-peer-deps and link EAS project ID` — fixes EAS build peer dep conflict
- `fix: strip markdown code fences from Claude JSON response in ai.py` — fixes 502 in production
- `docs: update CLAUDE.md and README with live deployment, EAS, and bug fixes`

---

## Key Production IDs & Credentials

### Railway
- **Project ID:** `6cf3cc6f-83c9-4150-b90e-ba6ca30fd034`
- **Environment ID (production):** `9d8cf807-a919-4e8c-b299-e249fb2e2d9e`
- **Brain service ID:** `2b457fa4-fa83-4a95-a082-c816ef3fc563` (named "ghost-cart" in Railway dashboard)
- **Gateway service ID:** `893da436-e5ac-4379-a4d9-5709316c9fa0` (named "gateway")
- **Brain URL:** `https://ghost-cart-production.up.railway.app`
- **Gateway URL:** `https://gateway-production-9495.up.railway.app`

### EAS / Expo
- **Expo account:** `abhiai90` (`abhivenkat34@gmail.com`)
- **EAS Project ID:** `0bfcd389-eca1-4cd6-a3eb-dd99f7d2ee08`
- **Project slug:** `ghost-cart`
- **Android package:** `com.abhishek.ghostcart`
- **iOS bundle ID:** `com.abhishek.ghostcart`
- **Latest Android APK build:** `2ac7c16e-94f4-49c8-96f4-4049ccb9ea23`
  - Download: `https://expo.dev/accounts/abhiai90/projects/ghost-cart/builds/2ac7c16e-94f4-49c8-96f4-4049ccb9ea23`

### Git
- **GitHub repo:** `https://github.com/Abhi-2016/ghost-cart`
- **Commit author:** Abhishek Venkatesh `<abhivenkat34@gmail.com>`
- **Co-author:** `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## How to Re-Deploy

### Brain or Gateway (from repo root)
```bash
# Brain
railway up --service 2b457fa4-fa83-4a95-a082-c816ef3fc563 --detach --ci

# Gateway
railway up --service 893da436-e5ac-4379-a4d9-5709316c9fa0 --detach --ci
```

> **Why from repo root?** This is a monorepo. Root directories are set to `brain/` and `gateway/`
> in Railway via the GraphQL API. Railway scopes the build to the right subdirectory automatically.

### Set/update a Railway env var
```bash
railway variable set "KEY=value" --service <SERVICE_ID> --skip-deploys
```

### Build a new Android APK
```bash
cd mobile
eas build --platform android --profile preview
```

---

## What's Left To Do

### Immediate (blockers or quick wins)
| Item | How |
|---|---|
| **Add GOOGLE_PLACES_API_KEY** | `railway variable set "GOOGLE_PLACES_API_KEY=<key>" --service 893da436-e5ac-4379-a4d9-5709316c9fa0` then redeploy gateway |
| **Logtail log drain** | Railway dashboard → Settings → Log Drains → HTTP drain to `https://in.logtail.com/` with source token |
| **iOS build** | Requires Apple Developer Program enrollment ($99/yr) → `eas build --platform ios --profile preview` |

### Feature Roadmap (see README.md for full list)
1. Multi-Store Trip Planner (agentic)
2. Meal Planning Agent (agentic)
3. Budget Agent (agentic)
4. Receipt Scanner (agentic)
5. Pantry Memory (agentic)
6. Langfuse evals on Claude tool decisions
7. PostgreSQL persistence
8. Redis cache

---

## Known Issues & Fixes Applied

| Issue | Root Cause | Fix |
|---|---|---|
| EAS build fails on `npm install` | `react-dom@19.2.4` needs `react@^19.2.4`; Expo pins `19.1.0` | `mobile/.npmrc` with `legacy-peer-deps=true` |
| Brain returns 502 on `/v1/recommend` | Claude wraps JSON in ` ```json ``` ` code fences; `json.loads()` fails on the backtick | `brain/app/services/ai.py` strips code fences with `re.sub` before parsing |
| Railway deploys whole monorepo | `railway up` from a subdirectory still uploads from git root | Set `rootDirectory` per service via Railway GraphQL API |

---

## Architecture Quick Reference

```
Mobile (RN/Expo)  ──HTTPS──▶  Gateway (:3000)  ──X-Internal-Secret──▶  Brain (:8000)  ──▶  Claude
                               • Zod validation                          • Auth gate
                               • Rate limiting                           • Pydantic models
                               • node-cache (10 min)                     • TTLCache
                               • X-Request-ID                            • Agentic loops
                               • JSON logs → stdout                      • JSON logs → stdout
```

### The Two Agentic Features

**Restock Agent** — triggered when GPS detects store entry:
- `tool_choice="auto"`, while-loop, max 10 iterations
- Tools: `add_to_list`, `skip_item`, `set_agent_note`

**Nudge Agent** — triggered when app foregrounds after 12+ hours:
- `tool_choice="auto"`, while-loop
- Tools: `send_nudge(title, body, urgency, suggested_items)`, `skip_nudge(reason)`
- Claude writes notification copy — no templates

### Logging
All logs are structured JSON on stdout. Every request has an `X-Request-ID` forwarded gateway→brain for end-to-end tracing. Key events: `request`, `brain.call`, `brain.call_failed`, `agent.start`, `agent.tool_call`, `agent.complete`.

---

## Branch Naming & Commit Style
- Branches: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`
- Commits: Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`
- Every commit ends with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

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
| Agentic vs. non-agentic taxonomy | 8-feature decision matrix in the README: who decides, Claude call count, `tool_choice` mode, output format — for every feature |
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
| **[Process]** Asked about "skills.md" as a standard Claude Code filename | There is no file called `skills.md`. Treating an assumed filename as a known spec without verifying first is a gap between confidence and knowledge. | Looked up the real format: it's `SKILL.md` (uppercase) inside `.claude/skills/<name>/`, with YAML frontmatter controlling invocation mode and tool access. |
| **[Process]** Create a PR containing the HTML artifact file | An HTML file renders as raw markup in GitHub's file viewer and doesn't integrate with the docs people actually read. A browser deliverable isn't useful as a repo source file. | Updated `README.md`, `CLAUDE.md`, and the project plan with markdown tables instead — embedded in the docs that already exist, no orphan file. |
