# Jira Integration Brainstorm

## Context

The SE Work Tracker currently manages tasks manually — users create them via modals or inline forms, tied to customers and OKRs. The app already integrates with **Google Calendar** (OAuth, client-side) and **Gmail** (OAuth, read-only) on the existing Integrations page (`src/pages/Integrations.jsx`). The user wants Jira tickets assigned to them to **automatically appear as Tasks** in the tracker.

---

## Approach Options

### Option A: Client-Side Polling via Jira REST API (OAuth 2.0)

**How it works:**
- Add a "Connect Jira" section to the Integrations page (same pattern as Google Calendar/Gmail)
- User authenticates via Atlassian OAuth 2.0 (3LO) — grants `read:jira-work` scope
- On the Integrations page, a "Sync Jira" button (or auto-poll on page load) calls the Jira REST API:
  ```
  GET /rest/api/3/search?jql=assignee=currentUser() AND status!=Done
  ```
- Fetched issues are displayed in a review list (like Google Calendar events) where the user:
  - Selects which tickets to import
  - Maps each to a **customer** and optionally an **OKR**
  - Chooses a `taskType` (comms, focus-time, evergreen)
- Selected issues become Tasks via `addTask()` with a new field like `jiraKey: "PROJ-123"` to prevent duplicates on re-sync

**Pros:** Matches existing integration patterns exactly. No new infrastructure. User stays in control of what gets imported.
**Cons:** Not truly "automatic" — requires user to visit the page and click sync. Jira tokens expire (1hr) and need refresh.

---

### Option B: Webhook-Driven Auto-Sync (Server-Side)

**How it works:**
- New Vercel API route: `POST /api/jira/webhook`
- User configures a Jira Automation rule or Webhook in their Jira project:
  - Trigger: "Issue assigned to me" or "Issue updated"
  - Action: POST to `https://<app-domain>/api/jira/webhook`
- The webhook handler:
  1. Validates the request (shared secret or Jira's webhook signature)
  2. Extracts issue key, summary, status, priority, project
  3. Maps the Jira project to a customer (via a configurable mapping table stored in `app_data`)
  4. Creates/updates a Task in Neon directly
  5. Next time the app loads, the task appears via the normal data fetch

**Pros:** Truly automatic — tasks appear without user action. Near real-time.
**Cons:** Requires Jira admin access to set up webhooks. Needs a project-to-customer mapping config. More complex server-side logic. Webhook URL must be publicly accessible.

---

### Option C: Scheduled Background Sync (Cron + Server-Side)

**How it works:**
- Store the user's Jira OAuth refresh token in the database (encrypted)
- A Vercel Cron Job runs every 15-30 minutes:
  1. Refreshes the Jira access token
  2. Queries `assignee=currentUser() AND updated >= -30m`
  3. Diffs against existing tasks (by `jiraKey`)
  4. Creates new tasks / updates status of existing ones
- Project-to-customer mapping configured on the Integrations page

**Pros:** Fully automatic. No Jira admin access needed (just user OAuth). Reliable.
**Cons:** Not real-time (15-30 min delay). Requires storing tokens server-side. Vercel Cron has limits on free tier. More infrastructure complexity.

---

### Option D: Hybrid — Client-Side with Auto-Sync on App Open

**How it works:**
- Same OAuth 2.0 setup as Option A
- But instead of a manual "Sync" button, the app **auto-fetches** assigned Jira tickets every time the user opens the app (in `useStore.js` during the existing `loadFromNeon` flow)
- New tickets are added with `status: 'open'` and a `source: 'jira'` flag
- A small toast/banner notifies: "3 new Jira tickets synced"
- Bi-directional sync (optional): when user marks a task "done", update Jira status via API

**Pros:** Feels automatic to the user. Simple — reuses existing client-side patterns. No webhooks or crons needed.
**Cons:** Only syncs when app is open. Jira token refresh adds complexity to the auth flow. Initial sync might be slow if many tickets.

---

## Recommended Approach

**Start with Option D (Hybrid)**, then layer on Option B (Webhooks) later if real-time sync matters.

Rationale:
- Follows the existing Google Calendar/Gmail integration pattern (minimal new concepts)
- Feels automatic to the user without server-side infrastructure
- The Integrations page already has the UI scaffolding for OAuth flows
- Can be built incrementally: connect first, then auto-sync, then bi-directional

---

## Key Design Decisions to Make

1. **Jira-to-Customer Mapping** — How should Jira projects map to customers?
   - Option: Manual mapping on Integrations page (dropdown: Jira Project → Customer)
   - Option: Auto-create customers from Jira project names
   - Option: Let user assign customer per-ticket during first sync, remember for future

2. **Task Type Mapping** — What `taskType` should Jira tickets get?
   - Default to `focus-time` (most Jira tickets are deep work)?
   - Map based on Jira issue type (Bug → focus-time, Story → focus-time, Sub-task → comms)?
   - Let user configure a default per project?

3. **Status Sync Direction** — Should status changes flow both ways?
   - One-way (Jira → Tracker): Simplest. Jira is source of truth for creation, Tracker for local workflow.
   - Two-way: When task is marked "done" in Tracker, transition Jira issue too. More useful but significantly more complex (needs `write:jira-work` scope, transition IDs, etc.)

4. **Duplicate Prevention** — How to avoid re-importing the same ticket?
   - Add a `jiraKey` field to the task model (e.g., `"PROJ-123"`)
   - On sync, skip any ticket whose key already exists in tasks
   - Also useful for linking back to Jira (clickable link in task detail)

5. **Scope of Sync** — What tickets to pull?
   - Only "assigned to me"?
   - Include "reporter = me"?
   - Filter by project? By status?
   - User-configurable JQL filter on the Integrations page?

---

## Data Model Changes

New fields on the Task object:
```js
{
  // ...existing fields...
  source: 'manual' | 'jira',        // where the task originated
  jiraKey: 'PROJ-123' | null,       // Jira issue key (for dedup + linking)
  jiraUrl: 'https://...' | null,    // Direct link to Jira issue
}
```

New entity in `app_data`:
```js
// entity_name: 'jiraSettings'
{
  connected: true,
  cloudId: 'abc-123',               // Atlassian cloud instance ID
  siteUrl: 'https://mycompany.atlassian.net',
  projectMappings: [                 // Jira project → Customer
    { jiraProjectKey: 'PROJ', customerId: 'uuid-here' }
  ],
  defaultTaskType: 'focus-time',
  syncFilter: 'assignee=currentUser() AND status!=Done',
  lastSyncAt: '2026-03-09T...'
}
```

---

## Implementation Sketch (for future reference)

1. **Atlassian OAuth 2.0 setup** — Register an OAuth app at developer.atlassian.com, add client ID to env vars
2. **Integrations page UI** — "Connect Jira" button, project mapping config, sync controls
3. **Jira API client** — `src/lib/jiraApi.js` (similar to `googleApi.js`)
4. **Auto-sync hook** — In `useStore.js` loadFromNeon flow, after data loads, trigger Jira sync if connected
5. **Task model migration** — Add `source`, `jiraKey`, `jiraUrl` fields (backwards-compatible, all nullable)
6. **Dedup logic** — Check `jiraKey` before creating tasks on sync

---

## Verification Plan

- Connect Jira OAuth and confirm token retrieval
- Fetch assigned tickets and display on Integrations page
- Import a ticket as a Task, verify it appears in Triage board
- Re-sync and verify duplicates are not created
- Close a Jira ticket externally, re-sync, verify status update (if bi-directional)
