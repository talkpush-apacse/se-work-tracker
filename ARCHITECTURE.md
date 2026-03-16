# Personal Work Tracker — Architecture Reference

## Stack

| Layer | Tool |
|---|---|
| Framework | React 19 + Vite (SPA) |
| Styling | Tailwind CSS + Shadcn/UI (Radix primitives) |
| Database | Neon Postgres (serverless) |
| File Storage | Vercel Blob |
| Hosting | Vercel (serverless functions in `/api/`) |
| Auth | Bearer token (single-user, no accounts) |
| State | Custom React Context (no Zustand/Redux) |

---

## Folder Structure

```
├── api/                         # Vercel serverless functions
│   ├── _db.js                   # Neon client + auth helper
│   ├── data.js                  # GET /api/data (all entities)
│   ├── data/[entity].js         # PUT /api/data/:entity
│   ├── upload.js                # Vercel Blob file ops
│   ├── transcribe.js            # OpenAI Whisper proxy
│   ├── tasks/webhook.js         # Apple Shortcuts → task create
│   └── weekly-logs/webhook.js   # Apple Shortcuts → weekly log
├── src/
│   ├── App.jsx                  # Root + lazy-loaded pages
│   ├── constants.js             # All enums, colors, labels, AI prompts
│   ├── context/
│   │   ├── StoreContext.jsx     # Main app state + Neon sync
│   │   ├── TimerContext.jsx     # Global stopwatch + time tracking
│   │   └── GoogleAuthContext.jsx
│   ├── components/
│   │   ├── ui/                  # Shadcn base components (do not edit)
│   │   └── [Feature].jsx        # Feature modals and widgets
│   ├── pages/
│   │   ├── Dashboard.jsx        # This week overview
│   │   ├── Triage.jsx           # 4-column task board
│   │   ├── Customers.jsx        # Customer-centric view
│   │   ├── OKRs.jsx             # Quarterly objectives
│   │   ├── TimeBudget.jsx       # Weekly bandwidth planning
│   │   ├── Pulse.jsx            # Daily stress check-in
│   │   ├── WeeklyReport.jsx     # AI email generator
│   │   ├── Knowledge.jsx        # Reference notes
│   │   └── Integrations.jsx     # Google Calendar + Gmail config
│   ├── lib/
│   │   ├── api.js               # fetch wrappers + auth header
│   │   ├── googleApi.js         # Google Calendar + Gmail helpers
│   │   └── utils.js             # stripHtml, htmlToPlainText, etc.
│   ├── store/useStore.js        # localStorage + Neon sync logic
│   ├── hooks/                   # useTimer.js, useServiceWorker.js
│   └── utils/dateHelpers.js
├── CHANGELOG.json               # Version history (append-only)
├── ARCHITECTURE.md              # This file
└── vite.config.js               # PWA manifest + custom service worker
```

---

## DB Schema

Single-table JSONB design in Neon Postgres:

```sql
app_data (
  id           SERIAL PRIMARY KEY,
  entity_name  VARCHAR(50) UNIQUE NOT NULL,  -- e.g. 'tasks', 'customers'
  data         JSONB NOT NULL,               -- full array for that entity
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
)
```

**18 entities:** `tasks`, `customers`, `okrs`, `projects`, `points`, `meetingEntries`, `milestones`, `timeLogs`, `stressLogs`, `weeklyReports`, `weeklyUpdateLogs`, `timeBudgets`, `workTypeTargets`, `aiOutputs`, `aiSettings`, `annotations`

**Key entity shapes:**

| Entity | Key Fields |
|---|---|
| `tasks` | `id, description, workType, status, customerId, okrId, points, createdAt, closedAt` |
| `customers` | `id, name, color, pinnedIndex` |
| `okrs` | `id, title, quarter, keyResults[], progress` |
| `timeLogs` | `id, date, duration, workType, taskId, customerId` |
| `stressLogs` | `id, date, level (1–5), stressors[]` |
| `weeklyUpdateLogs` | `id, date, type, text, customerId` |

---

## Key Patterns

**State & Persistence**
`StoreContext` holds all entities in memory. localStorage is the primary read source (keys: `gpt-tasks`, `gpt-customers`, etc.). Writes debounce to Neon at 500ms via `PUT /api/data/:entity`. Store runs schema migrations on init (v2: `projectId→customerId`, v3: `taskType→workType`).

**API Auth**
All `/api/*` requests require `Authorization: Bearer {API_SECRET}`, validated in `api/_db.js`. No user sessions or multi-tenancy.

**Lazy-loaded Pages**
All pages use `React.lazy` + `Suspense`. Framer Motion handles page transitions (opacity + Y slide).

**Timer System**
`TimerContext` manages a global stopwatch. On save, hours are distributed across tasks via `DistributeTimeModal`, then written to `timeLogs`.

**PWA**
Custom service worker (`src/sw.js`) + Workbox. `PWABanners.jsx` surfaces update and offline notifications.

**Drag & Drop**
`@dnd-kit` powers task board columns, sidebar reordering, and customer list sorting.

**Rich Text**
TipTap editor used in `AIAssistModal` for email and note drafts. Extensions: image, link, placeholder, underline.

---

## Integration Points

| System | How |
|---|---|
| **Neon Postgres** | `@neondatabase/serverless` via `api/_db.js` |
| **Vercel Blob** | `/api/upload.js` — 4.5 MB limit, server-side MIME validation |
| **OpenAI GPT-4o** | Client-side via `VITE_OPENAI_API_KEY` — AI drafting in `AIAssistModal` |
| **OpenAI Whisper** | Proxied server-side via `/api/transcribe` |
| **Anthropic Claude** | Client-side via `VITE_ANTHROPIC_API_KEY` |
| **Google Calendar** | Client-side OAuth via `@react-oauth/google`; helpers in `lib/googleApi.js` |
| **Gmail** | Client-side OAuth; email fetch + AI summarization in `WeeklyReport` |
| **Apple Shortcuts** | Webhooks: `POST /api/tasks/webhook`, `POST /api/weekly-logs/webhook` |

**Environment Variables:**

| Variable | Side | Purpose |
|---|---|---|
| `VITE_API_SECRET` | Client | Bearer token for API calls |
| `VITE_OPENAI_API_KEY` | Client | GPT-4o drafting |
| `VITE_ANTHROPIC_API_KEY` | Client | Claude drafting |
| `VITE_GOOGLE_CLIENT_ID` | Client | Google OAuth |
| `DATABASE_URL` | Server | Neon Postgres connection |
| `API_SECRET` | Server | Validate incoming requests |
| `OPENAI_API_KEY` | Server | Whisper transcription |
| `BLOB_READ_WRITE_TOKEN` | Server | Vercel Blob access |
| `OPENAI_API_KEY` | Server | Embeddings via `text-embedding-3-small` (pgvector) |

---

## Vector Setup

Run once in the Neon SQL Editor before deploying `api/embeddings.js`:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the memory chunks table
CREATE TABLE IF NOT EXISTS memory_chunks (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  customer_id  TEXT,
  date         TEXT,
  text         TEXT NOT NULL,
  embedding    VECTOR(1536),
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
ON memory_chunks
USING hnsw (embedding vector_cosine_ops);
```

**Chunk ID format:** `{entityType}_{entityId}_{chunkIndex}` — deterministic, upserts are idempotent.
**Model:** `text-embedding-3-small` (1536 dimensions).
**Sync:** `StoreContext.jsx` debounces a full re-sync 5s after any store change (silent on failure).
**Backfill:** "Rebuild Index" button in the Knowledge page header runs a full upsert of all current entries.
