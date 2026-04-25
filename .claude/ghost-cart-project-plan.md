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
