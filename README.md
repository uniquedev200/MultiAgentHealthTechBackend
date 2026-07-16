# Siege — Emergency Resource Negotiation Platform

An AI-powered hospital resource negotiation system where autonomous LLM agents bid on emergency cases in real time, competing to allocate limited resources (OR rooms, ICU beds, staff, equipment) to patients based on acuity and clinical need.

## Tech Stack

- **Runtime:** Node.js + Express 5 + TypeScript
- **Database:** Supabase (PostgreSQL) via `pg` driver
- **AI Engine:** Groq (Llama 3.3 70B) for resource bidding, Mistral Large for allocation explanations
- **Realtime:** Server-Sent Events (SSE)
- **Auth:** JWT + API key dual middleware
- **Scheduling:** In-memory debounce + concurrency lock (no Redis required)

## Setup

```bash
git clone <repo-url>
cd siege
npm install
cp .env.example .env   # fill in your values
npm run seed            # seed demo hospital + resources (requires DATA_LAYER=live)
npm run dev             # start dev server on http://localhost:3000
```

For local development without Supabase, set `DATA_LAYER=fake` in `.env` — the server uses a built-in in-memory data store with demo data.

### BYOK (Bring Your Own Key)

Hospitals can supply their own Groq/Mistral API keys instead of relying on the platform's keys:

1. `PUT /settings/llm-keys/groq` with `{ "api_key": "gsk_..." }`
2. Keys are encrypted at rest with AES-256-GCM before storage
3. During negotiation, the scheduler resolves the hospital's keys before invoking the engine
4. If a hospital key is missing, the platform-level env var key is used as fallback
5. Each hospital's keys are isolated — Hospital A cannot see Hospital B's keys

## Architecture

```
POST /emergencies/:id/cases
        │
        ▼
   Scheduler (debounce 3s)
        │
        ▼
   triggerRound()
        │
        ├── loadState(emergencyId, hospitalId)  → cases, resources, dependencies
        │
        ├── runNegotiationRound()               ← per-resource Groq agents bid concurrently
        │      ├── dependency gating (data-driven)
        │      ├── concurrent Groq API calls (Llama 3.3)
        │      ├── live onBid() callback → SSE stream
        │      └── greedy conflict resolution (highest bid_score wins)
        │
        ├── saveBids() + saveResult()           → Postgres + audit log
        │
        └── broadcast("round:completed")        → SSE to connected clients
```

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/hospitals/register` | Register new hospital (no auth) |
| POST | `/auth/login` | Login → JWT token (no auth) |
| GET | `/emergencies/:id/stream` | SSE event stream for live updates |
| POST | `/emergencies` | Declare emergency (individual/mass scope) |
| GET | `/emergencies/:id` | Get emergency + cases + resources state |
| POST | `/emergencies/:id/cases` | Add patient case (triggers negotiation) |
| GET | `/emergencies/:id/rounds/:roundId` | Get bids + allocations for a round |
| GET | `/resources` | List all resources for your hospital |
| PATCH | `/resources/:id` | Override resource status |
| PATCH | `/emergencies/:id/resolve` | Manually resolve emergency |
| GET | `/audit-log` | Paginated audit trail |
| GET | `/settings/llm-keys` | Check which LLM providers are configured for your hospital |
| PUT | `/settings/llm-keys/:provider` | Store or update an API key for `groq` or `mistral` |
| DELETE | `/settings/llm-keys/:provider` | Remove a stored API key |

## Project Structure

```
src/
├── index.ts                 Express server + route definitions
├── types.ts                 Shared TypeScript interfaces
├── express.d.ts             Express Request augmentation (hospitalId)
├── db.ts                    PostgreSQL connection pool
├── auth.ts                  JWT + API key combined middleware
├── password.ts              bcrypt hash/compare
├── hospital.ts              Hospital + API key CRUD
├── negotiation-engine.ts    AI bidding engine (Groq + Mistral)
├── scheduler.ts             Debounce, scheduling, mass-loop, in-memory locks
├── credentials.ts           AES-256-GCM encryption for stored LLM API keys
├── data/
│   ├── index.ts             Fake↔live switch via DATA_LAYER env
│   ├── fake.ts              In-memory data layer (local dev)
│   ├── live.ts              PostgreSQL data layer (production)
│   └── types.ts             Re-exports from ../types
├── seed.ts                  Database seed script
└── migrate.ts               Run SQL migrations against Supabase

scripts/
├── check-state.js           Dev: inspect DB state
└── verify-schema.js         Dev: verify schema columns

supabase/
├── schema.sql               Base 7-table DDL + seed resources
├── migration-hospital-scoping.sql   hospitals + hospital_api_keys
├── migration-auth-columns.sql       email + password_hash on hospitals
├── migration-llm-credentials.sql    hospital_llm_credentials (BYOK)
└── all-migrations.sql       Combined migration for pg execution
```

## Environment Variables

See `.env.example` for the full list. Key variables:

- `DATABASE_URL` — PostgreSQL connection string (required for `DATA_LAYER=live`)
- `JWT_SECRET` — Secret for JWT token signing
- `GROQ_API_KEY` — Platform-level API key for Llama 3.3 bidding engine (fallback if hospital has no BYOK key)
- `MISTRAL_API_KEY` — Platform-level API key for Mistral explanation generation (fallback if hospital has no BYOK key)
- `CREDENTIAL_ENCRYPTION_KEY` — Secret key for encrypting hospital-provided LLM keys at rest (AES-256-GCM)
- `DATA_LAYER` — `"fake"` for local dev, `"live"` for real database
