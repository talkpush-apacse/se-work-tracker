# Build Plan: Configuration Change Log + Recurring Report Builder

## Important Correction: No Supabase

This codebase is **100% client-side** using **localStorage** for persistence — there is no Supabase, no database, no backend API. All data lives in browser localStorage under `gpt-*` keys. The plan below works entirely within this architecture.

---

## Existing Data Model Summary

| Entity | localStorage Key | Key Fields |
|---|---|---|
| **OKRs** | `gpt-okrs` | id, title, description, quarter, keyResults[] |
| **Customers** | `gpt-customers` | id, name, color, pinned |
| **Projects** | `gpt-projects` | id, name, customerId, okrId, status |
| **Points** (activity log) | `gpt-points` | id, timestamp, projectId, points, hours, activityType, comment |
| **Tasks** | `gpt-tasks` | id, projectId, description, taskType, assigneeOrTeam, status, points |
| **Meeting Entries** | `gpt-meeting-entries` | id, projectId, meetingDate, rawNotes, isTriaged |
| **Milestones** | `gpt-milestones` | id, projectId, title, targetDate, status |
| **AI Outputs** | `gpt-ai-outputs` | id, taskId, outputType, inputText, outputText |

**Existing "Configuration" reference:** `ACTIVITY_TYPES` already includes `'Configuration'` as a category for the Points/activity log. However, this only captures hours/points — no structured "what changed" data.

---

## Feature 1: Configuration Change Log

### Goal
Answer "what changed and when" for a client/project without digging through Slack or notes. Each entry captures a specific configuration change with optional before/after state.

### What Already Exists That We Can Leverage
- `ACTIVITY_TYPES` has `'Configuration'` (used in Points log for time tracking)
- Project detail already has a tab system (Points Log, Meeting Log, Tasks, Timeline)
- The Milestones section in the Timeline tab already shows a chronological list — similar visual pattern
- Store follows a consistent CRUD pattern we can replicate exactly

### Schema: New `configChanges` Entity

```js
// localStorage key: 'gpt-config-changes'
{
  id: string,              // uid()
  createdAt: ISO8601,      // when the entry was logged
  projectId: string,       // FK → projects
  changeDate: 'YYYY-MM-DD', // when the change actually happened
  category: string,        // one of CONFIG_CHANGE_CATEGORIES (see below)
  summary: string,         // what changed (required, short description)
  beforeState: string,     // optional — previous value/state
  afterState: string,      // optional — new value/state
  notes: string,           // optional — additional context
}
```

**Predefined categories** (new constant `CONFIG_CHANGE_CATEGORIES`):
```js
[
  'Chatbot Flow',
  'CRM Setting',
  'Integration',
  'Routing Rule',
  'User Permission',
  'Reporting Config',
  'API / Webhook',
  'Other',
]
```

### No Changes to Existing Tables
This is a fully new entity. The existing `points` entries with `activityType: 'Configuration'` continue to track *time spent* on config work. The new `configChanges` entity tracks *what specifically changed*. They're complementary — no migration or modification of existing data needed.

### UI Changes

1. **New tab in ProjectDetail:** "Config Log" — placed between "Tasks" and "Timeline" in the tab bar
2. **New modal:** `AddConfigChangeModal.jsx` — form with fields: changeDate, category (dropdown), summary (textarea), beforeState (input, optional), afterState (input, optional), notes (textarea, optional)
3. **Timeline view within the tab:** Entries grouped by date (like Meeting Log), showing category badge, summary, and expandable before/after diff
4. **New constant arrays:** `CONFIG_CHANGE_CATEGORIES` and `CONFIG_CHANGE_CATEGORY_COLORS`

### Store Changes (`useStore.js`)
- New state: `configChanges` with `gpt-config-changes` localStorage key
- New actions: `addConfigChange`, `updateConfigChange`, `deleteConfigChange`, `getProjectConfigChanges`
- Add `configChanges` to the `exportData`/`importData` functions
- Add to the returned object from `useStore()`

### Files to Create
| File | Purpose |
|---|---|
| `src/components/AddConfigChangeModal.jsx` | Modal form for logging a config change |

### Files to Modify
| File | Change |
|---|---|
| `src/constants.js` | Add `CONFIG_CHANGE_CATEGORIES` and `CONFIG_CHANGE_CATEGORY_COLORS` |
| `src/store/useStore.js` | Add configChanges state, CRUD actions, localStorage sync, export/import |
| `src/pages/Projects.jsx` | Add "Config Log" tab to ProjectDetail, render timeline view, wire up modal |

---

## Feature 2: Recurring Report Builder

### Goal
Generate two report types from existing data: Internal Weekly Update and Client Status Report. Output formatted text that can be copied to clipboard or pasted into email.

### What Already Exists That We Can Leverage
- **Points** — has `timestamp`, `projectId`, `activityType`, `hours`, `comment` → powers "what I worked on this week"
- **Tasks** — has `status`, `projectId`, `createdAt`, `description` → powers "completed items", "active tasks", "blocked items"
- **OKRs** — has `keyResults[]` with `value` → powers "OKR progress"
- **Milestones** — has `targetDate`, `status` → powers "upcoming milestones"
- **Projects** → `customerId` links everything to a customer for client-scoped reports
- **Analytics page** already does date-range filtering and aggregation — same patterns apply
- **`date-fns`** already handles week boundaries (Monday–Sunday)

### No New Data Entities Needed
Reports are **computed views** over existing data. No new localStorage entities required.

The only new persisted state (optional, nice-to-have): saved report snapshots so you can reference past reports. But for the initial build, reports are generated on-demand — no persistence needed.

### UI: New "Reports" Page

Add a new top-level page accessible from the sidebar navigation.

**Page layout:**
1. **Report type selector** — toggle between "Internal Weekly Update" and "Client Status Report"
2. **Configuration panel:**
   - Internal Weekly: date range picker (defaults to current week Mon–Sun)
   - Client Status: customer dropdown + optional date range
3. **Generated report** — rendered as formatted, readable text in a card
4. **Copy to Clipboard button** — copies plain-text version for email/Slack

### Report Content: Internal Weekly Update

Auto-populated sections:

```
## Weekly Update — [Mon Date] to [Sun Date]

### Work Summary
- [Project Name]: [X] hrs, [Y] points — [top activity types]
  (repeat for each project with activity this week)

### Tasks Completed
- [Project]: [task description] (done on [date])

### In Progress
- [Project]: [task description]

### Blocked
- [Project]: [task description] — [recipient if set]

### OKR Progress
- [OKR Title] ([Quarter])
  - [KR text]: [status/value]

### Hours Breakdown
- Total: [X] hours across [N] projects
- By activity: Configuration [X]h, Meetings [Y]h, ...
```

### Report Content: Client Status Report

```
## Client Status Report — [Customer Name]
## Period: [Date Range]

### Active Projects
- [Project Name] — [Status]

### Completed This Period
- [task description] (completed [date])

### In Progress
- [task description] — [status]

### Upcoming Milestones
- [Milestone title] — [target date] ([status])

### Hours Invested
- Total: [X] hours
- By project: [Project A] [X]h, [Project B] [Y]h
```

### Files to Create
| File | Purpose |
|---|---|
| `src/pages/Reports.jsx` | Full Reports page with both report types, date filtering, generation, and copy-to-clipboard |

### Files to Modify
| File | Change |
|---|---|
| `src/App.jsx` | Add `Reports` import and render for `activeTab === 'reports'` |
| `src/components/Navigation.jsx` | Add "Reports" tab to the `tabs` array with `FileText` icon |

---

## Recommended Build Order

### Phase 1: Configuration Change Log
1. Add constants (`CONFIG_CHANGE_CATEGORIES`, colors) to `constants.js`
2. Add store logic (state, CRUD, localStorage, export/import) to `useStore.js`
3. Create `AddConfigChangeModal.jsx`
4. Add "Config Log" tab + timeline UI to `Projects.jsx` (ProjectDetail)

### Phase 2: Recurring Report Builder
5. Create `Reports.jsx` page with both report types
6. Add "Reports" nav entry to `Navigation.jsx`
7. Wire up the page in `App.jsx`

### Phase 3: Polish (if desired)
8. Add config changes count badge to the Config Log tab
9. Add "Save & Add Another" to the config change modal (matching existing task modal pattern)
10. Add report history/snapshots (persisted to localStorage) — optional future enhancement

---

## Summary of All Schema/Data Changes

| Change Type | Details |
|---|---|
| **New localStorage entity** | `gpt-config-changes` — config change log entries |
| **New constants** | `CONFIG_CHANGE_CATEGORIES`, `CONFIG_CHANGE_CATEGORY_COLORS` |
| **New store actions** | `addConfigChange`, `updateConfigChange`, `deleteConfigChange`, `getProjectConfigChanges` |
| **Export/Import update** | Include `configChanges` in backup JSON |
| **New page** | Reports (route: `reports`) |
| **New nav tab** | Reports in sidebar |
| **New project tab** | "Config Log" in ProjectDetail |
| **New modal** | `AddConfigChangeModal` |
| **Existing tables modified** | None — all existing data untouched |
