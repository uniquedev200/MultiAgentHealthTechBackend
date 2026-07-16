# Siege — Emergency Resource Negotiation Platform

**Live Demo:** [https://health-tech-navy-nu.vercel.app/](https://health-tech-navy-nu.vercel.app/)

An AI-powered hospital resource negotiation system where autonomous LLM agents bid on emergency cases in real time, competing to allocate limited resources — OR rooms, ICU beds, staff, equipment — to patients based on acuity and clinical need.

---

## Features

- **AI-Powered Negotiation** — Per-resource Groq agents (Llama 3.3 70B) evaluate cases concurrently and submit competitive bids; greedy conflict resolution matches cases to the best-fit resource
- **Real-Time Streaming** — Server-Sent Events deliver live case additions, individual bids, round completions, and emergency status changes to connected clients
- **Human-in-the-Loop (HITL)** — Every allocation starts as `pending`; clinicians approve or reject each one. Rejection frees the resource, reverts the case, and reactivates the emergency
- **BYOK (Bring Your Own Key)** — Hospitals supply their own Groq and Mistral API keys, encrypted at rest with AES-256-GCM. Platform-level keys serve as fallback
- **Multi-Hospital Isolation** — Each hospital sees only its own emergencies, cases, resources, and audit trail. Cross-hospital access returns 404
- **Audit Trail** — Every allocation, bid, and status change is logged with a hash chain for tamper detection
- **Dual Data Layer** — `DATA_LAYER=fake` runs entirely in-memory for local development; `DATA_LAYER=live` connects to a real PostgreSQL database via Supabase

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 + Express 5 + TypeScript 5.9 |
| Database | Supabase (PostgreSQL) via `pg` driver |
| AI Engine | Groq (Llama 3.3 70B Versatile) for resource bidding, Mistral Large for allocation explanations |
| Realtime | Server-Sent Events (SSE) |
| Auth | JWT + API key dual middleware, bcrypt password hashing |
| Frontend | Vite + React 19 + Tailwind CSS |
| Scheduling | In-memory debounce timers + concurrency locks (no Redis) |
| Encryption | AES-256-GCM for stored LLM API keys |

---

## Prerequisites

- **Node.js** v20+ (v24 recommended)
- **npm** v10+
- A **Supabase** project (free tier works) — or skip this for in-memory mode
- **Groq** API key — [console.groq.com](https://console.groq.com)
- **Mistral** API key — [console.mistral.ai](https://console.mistral.ai)

---

## Quick Start (In-Memory Mode)

No database required. Runs entirely with built-in demo data.

```bash
git clone <repo-url>
cd siege
npm install
cp .env.example .env
# Edit .env and set:
#   DATA_LAYER=fake
#   GROQ_API_KEY=gsk_your_key_here
#   MISTRAL_API_KEY=your_mistral_key_here
#   JWT_SECRET=any-random-string
#   CREDENTIAL_ENCRYPTION_KEY=any-32-char-string

npm run dev          # Starts on http://localhost:3000
```

The server automatically seeds a demo hospital:
- **Email:** `admin@generalhospital.demo`
- **Password:** `demo1234`
- **API Key:** `gh-live-key-001`

---

## Full Setup (With Supabase)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **connection string** (Settings → Database → Connection string → URI)

### 2. Run the Migration

In the Supabase SQL Editor, paste and run the entire contents of:

```
supabase/all-migrations.sql
```

This creates all required tables: `hospitals`, `hospital_api_keys`, `emergencies`, `cases`, `resources`, `resource_dependencies`, `bids`, `allocations`, `audit_log`, and `hospital_llm_credentials`.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Database
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Auth (generate random strings)
JWT_SECRET=your-random-secret-here
CREDENTIAL_ENCRYPTION_KEY=a-32-character-minimum-secret

# AI Keys (get from Groq and Mistral dashboards)
GROQ_API_KEY=gsk_your_groq_key
MISTRAL_API_KEY=your_mistral_key

# Data layer
DATA_LAYER=live

# CORS (for frontend)
CORS_ORIGINS=http://localhost:5174
```

### 4. Start the Server

```bash
npm run dev
```

Register your first hospital via the API:

```bash
curl -X POST http://localhost:3000/hospitals/register \
  -H "Content-Type: application/json" \
  -d '{"name":"My Hospital","email":"admin@myhospital.com","password":"securepass123"}'
```

---

## Running the Frontend

The frontend is a separate Vite + React + Tailwind project in the `frontend/` directory.

```bash
cd frontend
npm install
```

Configure the API endpoint:

```bash
# frontend/.env
VITE_API_URL=http://localhost:3000
```

Start the dev server:

```bash
npx vite --port 5174
```

Open [http://localhost:5174](http://localhost:5174) in your browser.

> **Note:** On Windows, you may need to set `NODE_OPTIONS="--max-old-space-size=4096"` before running `npm install` to avoid out-of-memory errors during the esbuild install step.

---

## Testing

### Automated Backend Test Suite

```bash
node test-full.js
```

Runs 46 tests covering the complete API surface:

| Category | Tests | Coverage |
|----------|-------|----------|
| Health | 1 | Health endpoint responds |
| Registration | 2 | Register + duplicate rejection |
| Login | 2 | Login + bad credentials |
| Emergencies | 5 | Declare, list, get state, resolve, not-found |
| Cases | 3 | Add case, invalid emergency, acuity range |
| Negotiation | 4 | Trigger round, allocations, bids, explanation |
| Resources | 3 | List, update status, invalid ID |
| HITL | 4 | Approve allocation, reject allocation, double-approve, reject-frees-resource |
| BYOK | 5 | Set/get/delete keys, invalid provider, missing-table graceful fallback |
| SSE | 3 | Connect, event stream, disconnect |
| Audit Log | 4 | Pagination, hash chain integrity, entries exist |
| Cross-Hospital | 3 | Isolation (404 for other hospital's data) |
| Edge Cases | 7 | Rate limiting, concurrent rounds, emergency stop, empty state |

### Quick Smoke Test

```bash
# Health check
curl http://localhost:3000/health

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@generalhospital.demo","password":"demo1234"}'

# List emergencies (use token from login)
curl http://localhost:3000/emergencies \
  -H "Authorization: Bearer <token>"
```

### Full Integration Flow

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@generalhospital.demo","password":"demo1234"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# 2. Declare emergency
EMERGENCY_ID=$(curl -s -X POST http://localhost:3000/emergencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"scope":"individual","department_reach":["Emergency","ICU"]}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")

# 3. Add a critical case (triggers AI negotiation after 3s debounce)
curl -X POST "http://localhost:3000/emergencies/$EMERGENCY_ID/cases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"acuity_score":5,"required_resource_types":["icu_bed","staff"]}'

# 4. Wait 5s for the negotiation round, then check allocations
sleep 5
curl "http://localhost:3000/emergencies/$EMERGENCY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

---

## How It Works

```
User adds case via UI or API
         │
         ▼
   POST /emergencies/:id/cases
         │
         ▼
   Scheduler (3s debounce → prevents rapid-fire)
         │
         ▼
   triggerRound()
         │
         ├── loadState()             → cases, resources, dependencies
         │
         ├── getLLMKeys(hospitalId)  → resolve BYOK or platform keys
         │
         ├── runNegotiationRound()
         │      │
         │      ├── Filter: only "available" resources, "pending" cases
         │      ├── Dependency gating (data-driven prerequisites)
         │      ├── 3 concurrent Groq agents per resource (Llama 3.3)
         │      │     └── Each agent evaluates cases, submits bids via tool call
         │      ├── Greedy conflict resolution (highest bid_score wins)
         │      └── Mistral generates allocation explanation
         │
         ├── saveBids() + saveResult()   → Postgres + audit log
         │
         └── broadcast("round:completed") → SSE to all connected clients
                    │
                    ▼
           Frontend renders:
             • Bids with scores + reasoning
             • Allocations with HITL approve/reject buttons
             • AI explanation
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/hospitals/register` | No | Register new hospital account |
| POST | `/auth/login` | No | Login, returns JWT |
| GET | `/emergencies` | Yes | List all emergencies for your hospital |
| POST | `/emergencies` | Yes | Declare emergency (`individual` or `mass` scope) |
| GET | `/emergencies/:id` | Yes | Get emergency state (cases, resources, dependencies, allocations) |
| GET | `/emergencies/:id/stream` | Yes | SSE event stream (`connected`, `case_added`, `bid_submitted`, `round:completed`, `emergency_resolved`) |
| POST | `/emergencies/:id/cases` | Yes | Add patient case (triggers negotiation) |
| GET | `/emergencies/:id/rounds/:roundId` | Yes | Get bids + allocations for a specific round |
| PATCH | `/emergencies/:id/resolve` | Yes | Manually resolve emergency |
| GET | `/resources` | Yes | List all resources |
| PATCH | `/resources/:id` | Yes | Override resource status (`available`, `occupied`, `offline`) |
| PATCH | `/allocations/:id/approve` | Yes | Approve a pending allocation (HITL) |
| PATCH | `/allocations/:id/reject` | Yes | Reject allocation (frees resource, reverts case, reactivates emergency) |
| GET | `/audit-log` | Yes | Paginated audit trail with hash chain |
| GET | `/settings/llm-keys` | Yes | Check configured LLM providers |
| PUT | `/settings/llm-keys/:provider` | Yes | Store/update Groq or Mistral API key (BYOK) |
| DELETE | `/settings/llm-keys/:provider` | Yes | Remove stored API key |

---

## Project Structure

```
siege/
├── src/
│   ├── index.ts                 Express server + route definitions + CORS
│   ├── types.ts                 Shared TypeScript interfaces
│   ├── express.d.ts             Express Request augmentation (hospitalId)
│   ├── db.ts                    PostgreSQL connection pool (pg)
│   ├── auth.ts                  JWT + API key combined middleware
│   ├── password.ts              bcrypt hash/compare
│   ├── hospital.ts              Hospital + API key CRUD
│   ├── negotiation-engine.ts    AI bidding engine (Groq + Mistral)
│   ├── scheduler.ts             Debounce, scheduling, mass-loop, in-memory locks
│   ├── credentials.ts           AES-256-GCM encryption for stored LLM API keys
│   ├── data/
│   │   ├── index.ts             Fake↔live switch via DATA_LAYER env
│   │   ├── types.ts             Re-exports from ../types
│   │   ├── fake.ts              In-memory data layer (local dev)
│   │   └── live.ts              PostgreSQL data layer (production)
│   ├── seed.ts                  Database seed script
│   └── migrate.ts               Run SQL migrations against Supabase
│
├── frontend/
│   ├── src/
│   │   ├── api.ts               API client with SSE streaming
│   │   ├── App.tsx              Route config with protected routes
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx   Auth state with localStorage persistence
│   │   ├── components/
│   │   │   └── Layout.tsx       Sidebar navigation layout
│   │   ├── pages/
│   │   │   ├── Login.tsx        Login / register with demo credentials
│   │   │   ├── Dashboard.tsx    Resource stats, quick actions, audit feed
│   │   │   ├── Emergencies.tsx  List emergencies + declare new
│   │   │   ├── EmergencyDetail.tsx  Full emergency operations (SSE, cases, HITL)
│   │   │   ├── Resources.tsx    Resource management with status override
│   │   │   ├── AuditLog.tsx     Paginated audit trail
│   │   │   └── Settings.tsx     BYOK LLM key management
│   │   └── types.ts             Frontend type definitions
│   ├── vite.config.ts           Vite config with API proxy
│   └── tailwind.config.js       Tailwind CSS configuration
│
├── supabase/
│   └── all-migrations.sql       Combined migration (run once in Supabase SQL Editor)
│
├── test-full.js                 Full backend test suite (46 tests)
├── test-api.js                  Quick API endpoint smoke tests
├── API.md                       Detailed API documentation
├── render.yaml                  Render deployment blueprint
├── .env.example                 Environment variable template
└── package.json                 Build scripts + dependencies
```

---

## Deployment

### Backend (Render)

1. Push your code to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Set environment variables in the Render dashboard:
   - `DATA_LAYER=live`
   - `DATABASE_URL` (your Supabase connection string)
   - `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (generate random strings)
   - `GROQ_API_KEY`, `MISTRAL_API_KEY`
   - `CORS_ORIGINS` (your Vercel frontend URL)
4. Render auto-deploys on push

### Frontend (Vercel)

1. Create a new project on [Vercel](https://vercel.com)
2. Set the root directory to `frontend/`
3. Set environment variable: `VITE_API_URL` → your Render backend URL
4. Vercel auto-deploys on push

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3000`) |
| `DATABASE_URL` | If `live` | PostgreSQL connection string from Supabase |
| `DATA_LAYER` | Yes | `"fake"` for in-memory dev, `"live"` for PostgreSQL |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `GROQ_API_KEY` | Recommended | Platform-level Groq key (fallback if hospital has no BYOK) |
| `MISTRAL_API_KEY` | Recommended | Platform-level Mistral key (fallback if hospital has no BYOK) |
| `CREDENTIAL_ENCRYPTION_KEY` | If BYOK | 32+ character secret for AES-256-GCM key encryption |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (empty = allow all) |
| `DEBOUNCE_MS` | No | Scheduler debounce delay (default: `3000`) |
| `ROUND_COOLDOWN_MS` | No | Cooldown between mass-loop rounds (default: `5000`) |
| `MAX_RETRIES` | No | Max negotiation round retries (default: `3`) |

---

## License

This project was built as part of a hackathon submission.
