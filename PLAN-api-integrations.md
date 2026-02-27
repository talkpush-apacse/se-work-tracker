# Plan: Gmail & Google Calendar API Integrations + LLM Weekly Updates

## Overview

Add a **Logs** page that pulls emails (sent/received) and calendar events (meetings joined) from Gmail and Google Calendar via Google APIs, then uses an LLM to generate a weekly update summary from those logs.

---

## Architecture Decisions

### Authentication: Google OAuth 2.0

The app currently uses a single bearer token (`API_SECRET`) with no user login. Google APIs require OAuth 2.0 with user consent. The plan adds a **server-side OAuth flow** using Vercel serverless functions to handle token exchange and refresh, storing tokens in the existing Neon database.

### Data Flow

```
Google APIs ──► Vercel Serverless Functions ──► Neon DB (logs entity) ──► React Frontend (Logs page)
                                                       │
                                                       ▼
                                              LLM API (Claude/OpenAI)
                                                       │
                                                       ▼
                                              Weekly Update (aiOutputs entity)
```

### Storage Strategy

Logs are stored as a new `logs` JSONB entity in the existing `app_data` table (same pattern as `points`, `tasks`, etc.). This keeps the architecture consistent and avoids schema migrations.

---

## Implementation Phases

### Phase 1: Google OAuth 2.0 Setup

**Goal:** Allow the user to connect their Google account and store OAuth tokens server-side.

#### 1.1 Google Cloud Console Setup (Manual)
- Create a Google Cloud project (or use existing)
- Enable **Gmail API** and **Google Calendar API**
- Create OAuth 2.0 credentials (Web application type)
- Set authorized redirect URI: `https://<domain>/api/auth/google/callback`
- Add required scopes:
  - `https://www.googleapis.com/auth/gmail.readonly` (read emails)
  - `https://www.googleapis.com/auth/calendar.readonly` (read calendar events)

#### 1.2 New Environment Variables
```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=https://<domain>/api/auth/google/callback
```

#### 1.3 New API Routes

**`api/auth/google/index.js`** — `GET /api/auth/google`
- Generates Google OAuth authorization URL with required scopes
- Includes `access_type=offline` for refresh token
- Includes `prompt=consent` to ensure refresh token is returned
- Returns URL for frontend to redirect user

**`api/auth/google/callback.js`** — `GET /api/auth/google/callback`
- Receives authorization code from Google
- Exchanges code for access + refresh tokens via `https://oauth2.googleapis.com/token`
- Stores tokens in Neon DB as new entity `googleAuth`:
  ```json
  {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "email": "user@gmail.com",
    "connected": true
  }
  ```
- Redirects back to app with success/error status

**`api/auth/google/status.js`** — `GET /api/auth/google/status`
- Returns connection status (connected/disconnected, email, token expiry)
- Used by frontend to show connection state

**`api/auth/google/disconnect.js`** — `POST /api/auth/google/disconnect`
- Revokes Google tokens
- Clears stored auth from DB
- Returns success

#### 1.4 Token Refresh Helper

**`api/_google.js`** — Shared module
- `getValidToken()`: Checks if access token is expired, auto-refreshes using refresh token if needed, updates DB
- `makeGoogleRequest(url, params)`: Wrapper that handles auth headers and token refresh transparently
- Used by all Google API endpoints

---

### Phase 2: Gmail Integration (Fetching Emails)

**Goal:** Fetch sent and received emails for the current week and store them as logs.

#### 2.1 New API Route

**`api/logs/gmail.js`** — `POST /api/logs/gmail`

- Accepts `{ startDate, endDate }` in request body
- Uses Gmail API `messages.list` + `messages.get`:
  - **Received:** `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox after:{startDate} before:{endDate}`
  - **Sent:** `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent after:{startDate} before:{endDate}`
- For each message, fetches headers (Subject, From, To, Date) and a snippet (first ~200 chars of body)
- Does NOT store full email bodies (privacy + storage concerns)
- Deduplicates by Gmail message ID to avoid re-importing
- Returns structured log entries:
  ```json
  [
    {
      "id": "uuid",
      "source": "gmail",
      "type": "received",  // or "sent"
      "subject": "Re: Project Update",
      "from": "client@example.com",
      "to": ["user@gmail.com"],
      "snippet": "Thanks for the update on...",
      "timestamp": "2026-02-23T10:30:00Z",
      "gmailMessageId": "18abc123..."
    }
  ]
  ```

#### 2.2 Pagination & Rate Limits
- Gmail API returns max 100 messages per page; use `nextPageToken` for pagination
- Cap at 500 messages per sync to avoid timeout (Vercel 10s limit on hobby, 60s on pro)
- If >500 messages, return partial results with a `hasMore` flag

---

### Phase 3: Google Calendar Integration (Fetching Meetings)

**Goal:** Fetch calendar events (meetings) for the current week and store them as logs.

#### 3.1 New API Route

**`api/logs/calendar.js`** — `POST /api/logs/calendar`

- Accepts `{ startDate, endDate }` in request body
- Uses Calendar API `events.list`:
  - `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin={start}&timeMax={end}&singleEvents=true&orderBy=startTime`
- Filters to events where user is an attendee with `responseStatus: "accepted"` or is the organizer
- Deduplicates by Calendar event ID
- Returns structured log entries:
  ```json
  [
    {
      "id": "uuid",
      "source": "gcal",
      "type": "meeting",
      "title": "Weekly Standup",
      "startTime": "2026-02-23T09:00:00Z",
      "endTime": "2026-02-23T09:30:00Z",
      "durationMinutes": 30,
      "attendees": ["alice@example.com", "bob@example.com"],
      "organizer": "user@gmail.com",
      "location": "Google Meet",
      "description": "Weekly sync...",  // truncated to 300 chars
      "calendarEventId": "abc123..."
    }
  ]
  ```

#### 3.2 Multi-Calendar Support (Optional, Phase 3b)
- Fetch from all calendars the user has access to, not just `primary`
- Use `calendarList.list` to discover calendars
- Let user toggle which calendars to include

---

### Phase 4: Logs Storage & State Management

**Goal:** Store fetched logs in the database and manage them in the frontend store.

#### 4.1 New Entity in `app_data`

Entity name: `logs`

```json
[
  {
    "id": "uuid",
    "source": "gmail" | "gcal",
    "type": "received" | "sent" | "meeting",
    "timestamp": "ISO string",
    "subject": "...",       // gmail
    "title": "...",         // gcal
    "snippet": "...",       // gmail
    "from": "...",          // gmail
    "to": ["..."],          // gmail
    "attendees": ["..."],   // gcal
    "durationMinutes": 30,  // gcal
    "sourceId": "...",      // gmail message ID or gcal event ID
    "weekOf": "2026-02-23"  // Monday of the week, for grouping
  }
]
```

#### 4.2 Store Updates (`src/store/useStore.js`)

Add to the store:
- `logs` state array (loaded from DB like other entities)
- `setLogs(logs)` — replace all logs
- `addLogs(newLogs)` — merge new logs, deduplicate by `sourceId`
- `deleteLog(id)` — remove a single log entry
- `clearLogsForWeek(weekOf)` — clear and re-sync a week
- `getLogsForWeek(weekOf)` — filter logs by week
- `googleAuthStatus` state — tracks connection status
- `syncGmail(startDate, endDate)` — calls `/api/logs/gmail`, merges results
- `syncCalendar(startDate, endDate)` — calls `/api/logs/calendar`, merges results

#### 4.3 API Client Updates (`src/lib/api.js`)

Add functions:
- `fetchGoogleAuthStatus()` → `GET /api/auth/google/status`
- `initiateGoogleAuth()` → `GET /api/auth/google` (returns redirect URL)
- `disconnectGoogle()` → `POST /api/auth/google/disconnect`
- `syncGmailLogs(startDate, endDate)` → `POST /api/logs/gmail`
- `syncCalendarLogs(startDate, endDate)` → `POST /api/logs/calendar`

---

### Phase 5: Logs Page (Frontend)

**Goal:** New "Logs" tab in the navigation showing synced emails and meetings.

#### 5.1 Navigation Update (`src/components/Navigation.jsx`)

- Add "Logs" tab between "Customers" and "Dashboard" (or after Analytics)
- Icon: `ScrollText` or `FileText` from Lucide
- Update `App.jsx` to render the new `Logs` page component

#### 5.2 New Page: `src/pages/Logs.jsx`

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  Logs                          [← prev] Week [next →]│
│                                                      │
│  ┌─ Google Connection ─────────────────────────────┐ │
│  │ ✓ Connected as user@gmail.com    [Disconnect]   │ │
│  │ Last synced: 5 min ago           [Sync Now]     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Filter Bar ────────────────────────────────────┐ │
│  │ [All] [Emails Received] [Emails Sent] [Meetings]│ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Week Summary ──────────────────────────────────┐ │
│  │ 📧 42 received · 18 sent · 📅 12 meetings      │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Monday, Feb 23 ───────────────────────────────┐  │
│  │ 09:00  📅 Weekly Standup (30m) - 4 attendees   │  │
│  │ 10:15  📧 ← Re: Project proposal (from alice)  │  │
│  │ 10:30  📧 → Follow-up on demo (to bob)         │  │
│  │ 14:00  📅 Client Review (60m) - 6 attendees    │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ Tuesday, Feb 24 ──────────────────────────────┐  │
│  │ ...                                             │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Generate Weekly Update ───────────────────────┐  │
│  │ [Generate Weekly Update]                        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Components:**

- **GoogleConnectionCard** — Shows connection status, connect/disconnect buttons, last sync time
- **LogsFilterBar** — Toggle between All / Received / Sent / Meetings
- **WeekSummaryStats** — Counts of each log type for the selected week
- **DayGroup** — Groups logs by day, sorted chronologically
- **LogEntry** — Single log item (email or meeting) with type icon, time, subject/title, participants
- **WeekNavigator** — Previous/next week arrows with current week label

#### 5.3 Interaction Details

- **Connect Google:** Click "Connect" → redirects to Google OAuth → returns to app
- **Sync:** Click "Sync Now" → fetches Gmail + Calendar for selected week → merges into store → saves to DB
- **Week Navigation:** Arrow buttons to move between weeks; defaults to current week
- **Filter:** Client-side filtering of displayed logs by type
- **Auto-sync:** On page load, if connected and no logs for current week, prompt to sync

---

### Phase 6: LLM-Powered Weekly Update Generation

**Goal:** Use the existing AI infrastructure to generate a weekly update from logs.

#### 6.1 New API Route

**`api/generate.js`** — `POST /api/generate`

- Accepts `{ type, context, provider, model }`:
  - `type`: one of the existing types (`meeting-summary`, `message-draft`, `checklist`) or new `weekly-update`
  - `context`: stringified log data + any existing points/tasks data for the week
  - `provider`: `"openai"` or `"claude"` (from aiSettings)
  - `model`: specific model ID
- Calls Claude API (`https://api.anthropic.com/v1/messages`) or OpenAI API (`https://api.openai.com/v1/chat/completions`)
- Returns generated text
- New environment variables:
  ```
  ANTHROPIC_API_KEY=<Claude API key>
  OPENAI_API_KEY=<OpenAI API key>
  ```

#### 6.2 Weekly Update System Prompt

New output type added to `src/constants.js`:

```
weekly-update: {
  label: "Weekly Update",
  systemPrompt: `You are an assistant helping a Solutions Engineer create a weekly status update.

  You will receive:
  - A list of emails received and sent (subject, sender/recipient, snippet)
  - A list of meetings attended (title, duration, attendees)
  - Logged work points and tasks completed (if available)

  Generate a structured weekly update with:
  1. **Summary** — 2-3 sentence overview of the week
  2. **Key Activities** — Grouped by customer/project where possible
  3. **Meetings** — Notable meetings with brief context
  4. **Communications** — Key email threads and outcomes
  5. **Next Week** — Inferred follow-ups or pending items

  Keep it concise, professional, and action-oriented.`
}
```

#### 6.3 Context Assembly

When "Generate Weekly Update" is clicked:
1. Gather all logs for the selected week from store
2. Gather all points entries for the same week (existing data)
3. Gather all tasks marked done/in-progress that week (existing data)
4. Format into a structured prompt:
   ```
   ## Emails Received (42)
   - Mon 09:15 | From: alice@client.com | Subject: Re: Project proposal | "Thanks for sending..."
   - ...

   ## Emails Sent (18)
   - Mon 10:30 | To: bob@partner.com | Subject: Follow-up on demo | "As discussed..."
   - ...

   ## Meetings Attended (12)
   - Mon 09:00 | Weekly Standup (30m) | With: alice, bob, carol
   - ...

   ## Work Logged
   - ProjectA: 8 points, 6 hours (Configuration, Troubleshooting)
   - ProjectB: 4 points, 3 hours (Sending Email, Reporting)

   ## Tasks Completed
   - [comms] Follow up with client on proposal
   - [focus-time] Configure SSO for tenant
   ```

5. Send to LLM API via `/api/generate`
6. Store result in `aiOutputs` entity (reusing existing infrastructure)
7. Display in a modal or expandable section on the Logs page

#### 6.4 UI for Weekly Update

- **Generate button** at the bottom of the Logs page
- Shows a loading spinner while generating (~5-15 seconds)
- Result displayed in a **modal with rich text** (reuse existing AI output modal pattern from Triage page)
- Actions: Copy to clipboard, Regenerate, Edit (using TipTap editor), Save
- Saved updates stored in `aiOutputs` with `type: "weekly-update"` and `weekOf` metadata

---

### Phase 7: Polish & Edge Cases

#### 7.1 Error Handling
- Google token expired → auto-refresh; if refresh fails → show "Reconnect" prompt
- Google API rate limits → show "Try again in a few minutes" message
- Vercel function timeout → return partial results with warning
- LLM API errors → show error toast with retry button

#### 7.2 Privacy Considerations
- Only store email metadata (subject, from, to, snippet) — never full email bodies
- Calendar event descriptions truncated to 300 characters
- All data stored in user's own Neon database
- Google OAuth scopes are read-only
- "Disconnect" fully revokes access and clears stored tokens

#### 7.3 Sync Status
- Show last sync timestamp per source (Gmail, Calendar)
- Visual indicator in navigation when sync is stale (>24 hours)
- Prevent duplicate syncs with debouncing

#### 7.4 Performance
- Logs page uses virtual scrolling if >200 entries per week
- Sync operations show progress ("Fetching emails... 42/100")
- LLM generation uses streaming response if possible

---

## New Files Summary

```
api/
├── auth/
│   └── google/
│       ├── index.js        # OAuth initiation
│       ├── callback.js     # OAuth callback
│       ├── status.js       # Connection status
│       └── disconnect.js   # Revoke access
├── logs/
│   ├── gmail.js            # Fetch Gmail messages
│   └── calendar.js         # Fetch Calendar events
├── generate.js             # LLM generation endpoint
└── _google.js              # Shared Google auth helpers

src/
├── pages/
│   └── Logs.jsx            # New Logs page
├── components/
│   ├── GoogleConnectionCard.jsx
│   ├── LogsFilterBar.jsx
│   ├── WeekSummaryStats.jsx
│   ├── DayGroup.jsx
│   ├── LogEntry.jsx
│   ├── WeekNavigator.jsx
│   └── WeeklyUpdateModal.jsx
```

## Modified Files Summary

```
src/App.jsx                 # Add Logs tab routing
src/components/Navigation.jsx  # Add Logs nav item
src/store/useStore.js       # Add logs + googleAuth state
src/lib/api.js              # Add Google auth + sync + generate API calls
src/constants.js            # Add weekly-update output type
vercel.json                 # Add rewrite for /api/auth/google/callback
```

## New Environment Variables

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
ANTHROPIC_API_KEY=       # if not already set
OPENAI_API_KEY=          # if not already set
```

## Dependencies to Add

```
None required — all Google API calls use native fetch() in serverless functions.
LLM API calls also use native fetch(). No new npm packages needed.
```

## Implementation Order

1. **Phase 1** — Google OAuth (foundation for everything else)
2. **Phase 4** — Store + API client updates (needed before UI)
3. **Phase 5.1** — Navigation + empty Logs page scaffold
4. **Phase 2** — Gmail integration
5. **Phase 3** — Calendar integration
6. **Phase 5.2-5.3** — Full Logs page UI
7. **Phase 6** — LLM weekly update generation
8. **Phase 7** — Polish and edge cases
