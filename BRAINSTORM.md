---
name: "work-tracker-brainstorm"
title: "Personal Work Tracker — Project Context"
description: "Comprehensive codebase context for brainstorming features, improvements, and architecture decisions for Jolo's Personal Work Tracker PWA."
author: "Jolo Yu"
version: "1.0"
last_updated: "2026-03-10"
---

# Personal Work Tracker — Project Context for Brainstorming

> Paste this into a new Claude conversation when you want to brainstorm features, improvements, or architecture decisions for this project.

---

## Who I Am

I'm Jolo, a Solutions Engineer (non-developer) at Talkpush, a hiring tech SaaS company. I manage 10–15 enterprise BPO clients (TaskUs, Inspiro, Accenture, Alorica, Afni, etc.) simultaneously. My work involves scoping, configuration, UAT, training, hypercare, and ongoing account management — all tracked in this app.

I build my own internal tools using Claude Code. I'm not a software engineer — I think in terms of workflows and problems, not frameworks.

---

## What This App Is

**Personal Work Tracker** is a PWA I built for myself to manage my daily work across all my customers. Think of it as a personal CRM + task manager + time tracker + weekly reporting tool — all in one dark-mode interface.

It runs at https://se-work-tracker.vercel.app and is installable on my iPhone and desktop.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | React 19 + Vite 7 |
| Styling | Tailwind CSS 3 + custom dark-mode design system |
| Components | Radix UI primitives (Shadcn-style) |
| Animation | Framer Motion |
| Icons | Lucide React |
| Rich Text | TipTap (ProseMirror) |
| Drag & Drop | @dnd-kit |
| Date | date-fns |
| Database | Neon PostgreSQL (serverless) |
| File Storage | Vercel Blob |
| Auth | None (single-user app, API secret for backend) |
| Google APIs | Calendar v3 + Gmail v1 (OAuth, client-side) |
| AI | Claude API + OpenAI API (configurable per feature) |
| PWA | vite-plugin-pwa + Workbox |
| Hosting | Vercel (frontend + serverless functions) |

---

## Pages & What They Do

### 1. Triage (main workspace)
Kanban board for all tasks across customers. Columns: Open → In Progress → Done → Blocked (Archived hidden). Each task has a customer, task type (comms / focus-time / evergreen), optional recipient, and file attachments. Features:
- **Focus timer** — start per-task or per-customer, logs hours + points on completion
- **AI Assist** — generates email drafts, checklists, or meeting summaries using Claude/OpenAI
- **Voice input** — speech-to-text for AI drafts
- **Calendar/email import** — pull Google Calendar events + Gmail into tasks
- **Evergreen tasks** — auto-reset to "open" every Monday
- **Drag reorder** within and across columns

### 2. Dashboard
Weekly snapshot: total points, hours, streak, top customer, top activity. Customer leaderboard sortable by points/hours/activity. Recent activity feed.

### 3. Customers
List of all customers with drag-reorder. Each has a color, task count, points, hours, last activity. Detail view shows all associated tasks, points, milestones, and meeting notes.

### 4. OKRs
Quarterly objectives with boolean key results. Bulk import. Points link to OKRs for progress tracking.

### 5. Weekly Report
AI-generated status email. Pulls context from: completed tasks, logged points, Google Calendar events, Gmail sent/inbox, weekly update logs, milestones. Sends to Claude or OpenAI with a customizable system prompt. Output is a professional plain-text email ready to paste into Outlook.

### 6. Time Budget
YNAB-style weekly hour budget (default 40h). Three sources deduct from budget:
- **Meetings** — auto-fetched from Google Calendar
- **Planned tasks** — manually added with hour estimates
- **Focus time logged** — automatically reads completed timer sessions from the week
Shows a utilization bar and remaining hours. Helps me give stakeholders realistic timelines.

### 7. Knowledge
Full-text search across all entities (tasks, highlights, lowlights, learnings, meetings, AI outputs, milestones). AI-powered relevance ranking via Claude.

### 8. Integrations
Google Calendar & Gmail OAuth connection. Batch-log calendar events as points.

---

## Data Model (key entities)

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| **Customers** | name, color | Parent entity for most data |
| **Tasks** | description, customerId, taskType, status, recipient, attachments | Triage board items |
| **Points** | customerId, hours, points, activityType, comment, timestamp | Time/effort log — created by timer, manual entry, or calendar import |
| **OKRs** | title, quarter, keyResults[] | Quarterly goals |
| **Meeting Entries** | customerId, meetingDate, rawNotes | Meeting notes, can be triaged into tasks |
| **Milestones** | customerId, title, targetDate, status | Delivery milestones |
| **Weekly Update Logs** | date, type (highlight/lowlight/learning/shoutout/neutral/next-week-priority), text, customerId | Feed into weekly report |
| **Time Budgets** | weekStart, totalBudgetHours, meetings[], tasks[] | Per-week hour allocation |
| **AI Outputs** | taskId, type, outputText, provider, model | Generated drafts/checklists |
| **Weekly Reports** | weekStart, emailText, provider, promptUsed | Saved AI-generated emails |

---

## Persistence Architecture

- **Primary**: localStorage (instant reads/writes, survives offline)
- **Backend**: Neon PostgreSQL (debounced 500ms sync, fetched on mount)
- **Strategy**: Dual-write. localStorage is source of truth during session. Neon syncs async. If Neon is unreachable, app works offline with localStorage.
- **Sync indicator**: Sidebar shows cloud icon with status (synced / saving / error / offline)

---

## Timer System

The focus timer is central to how I track my work:
1. Start timer on a customer or specific task (from Triage or Navigation)
2. Timer persists across page refreshes (localStorage)
3. Multi-tab safe (storage event listener syncs across tabs)
4. Max 12 hours (auto-stop)
5. On stop → SaveSessionModal: confirm hours, assign activity type, link to OKR, add comment
6. Creates a **points** entry with hours + calculated points (13.4375 pts/hr rate)
7. "General Focus Time" (no customer) → DistributeTimeModal: split across multiple customers by percentage
8. Auto-save on task switch (if timer running for different task, silently log and restart)

---

## AI Integration

Two providers configurable per feature (Claude or OpenAI):
- **Email drafts** — system prompt tuned for enterprise SaaS comms (warm, direct, no filler)
- **Checklists** — generates action items from context
- **Meeting summaries** — extracts key points + action items
- **Weekly report** — builds context from all week data, generates status email
- **Knowledge search** — ranks search results by relevance
- **Calendar/email import** — AI batch-summarizes imported items

System prompts are customizable in Settings (per output type).

---

## Design System

- **Theme**: Dark mode by default, minimal light mode support
- **Font**: Space Grotesk (Google Fonts)
- **Brand colors**: Lavender (primary accent), Sage, Pink, Amber
- **Color tokens**: CSS variables (HSL) for background, foreground, card, border, etc.
- **Cards**: `bg-card border border-border rounded-2xl`
- **Inputs**: `bg-secondary border border-border rounded-xl`
- **Status colors**: Green (success), Red (error), Amber (warning), Gray (inactive), Blue (info), Purple (focus/logged)
- **Animations**: Framer Motion page transitions, pulse indicators, accordion expand

---

## My Workflow (typical week)

**Monday**: Review last week's report. Reset evergreen tasks. Plan time budget (fetch calendar, add planned tasks). Triage inbox.

**Daily**: Open Triage → work through tasks top-to-bottom. Start focus timer when deep-working. Log comms tasks as I send emails. Quick-add highlights/lowlights to Weekly Update Log throughout the day.

**Friday**: Generate Weekly Report (AI pulls all context from the week). Review, tweak, send to stakeholders. Archive completed tasks.

**Ad hoc**: Log meeting notes after calls. Create milestones when new projects kick off. Check Knowledge when a client asks "didn't we discuss X last month?"

---

## What I Want From This Brainstorm

When I share this with you, I want to brainstorm:
- New features that would save me time or give me better visibility
- UX improvements to existing workflows
- Architectural improvements (performance, reliability, data model)
- Integrations that would reduce manual work
- Ways to make the AI features smarter or more useful
- Mobile experience improvements (I use this on iPhone daily)

**Ground rules for suggestions:**
- I'm a solo user — no multi-tenant complexity
- I'm not a developer — features should be practical, not technically impressive
- I deploy via Vercel + Neon — keep infra simple
- I use Claude Code to build everything — implementation feasibility matters
- The app already works well — I want to make it *better*, not rebuild it
