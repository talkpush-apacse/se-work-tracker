export const ACTIVITY_TYPES = [
  'Scoping',
  'Configuration',
  'Testing',
  'UAT',
  'Training',
  'Hypercare',
  'Reporting',
  'General Admin',
  'Account Management',
];

export const CUSTOMER_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Teal', value: '#14b8a6' },
];

// Task types — only 'comms' and 'focus-time' appear in dropdowns.
// 'mine' and 'coordinate' entries are kept in the maps below for backward compat
// with existing localStorage tasks but are excluded from the active array.
export const TASK_TYPES = ['comms', 'focus-time', 'evergreen', 'recurring'];

export const TASK_TYPE_LABELS = {
  mine:         'Mine',
  coordinate:   'Coordinate',
  comms:        'Needs Comms',
  'focus-time': 'Focus Time',
  evergreen:    'Evergreen',
  recurring:    'Recurring',
};

export const TASK_TYPE_COLORS = {
  mine:         { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  coordinate:   { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  comms:        { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'focus-time': { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200' },
  evergreen:    { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  recurring:    { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
};

// Points awarded per task type when a task is marked 'done'
// Moving OUT of 'done' resets points to 0
export const TASK_TYPE_POINTS = {
  'focus-time': 2,
  mine:         1,
  coordinate:   1,
  comms:        1,
  evergreen:    1,
  recurring:    1,
};

// Task statuses — 'archived' is a soft-delete; excluded from board by default
export const TASK_STATUSES = ['open', 'in-progress', 'done', 'blocked'];

export const TASK_STATUS_LABELS = {
  'open': 'Open',
  'in-progress': 'In Progress',
  'done': 'Done',
  'blocked': 'Blocked',
  'archived': 'Archived',
};

export const TASK_STATUS_COLORS = {
  'open': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  'in-progress': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'done': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'blocked': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  'archived': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
};

// Task recipients — who this task/message is directed at
export const TASK_RECIPIENTS = [
  { value: 'client',              label: 'Client' },
  { value: 'internal-core',       label: 'Internal — Core Team' },
  { value: 'internal-management', label: 'Internal — Management' },
  { value: 'internal-support',    label: 'Internal — Product Support' },
  { value: 'internal-crm-dev',    label: 'Internal — CRM Developers' },
  { value: 'internal-chatbot-dev',label: 'Internal — Chatbot Developers' },
  { value: 'internal-analytics',  label: 'Internal — Analytics' },
];

// AI output types
export const AI_OUTPUT_TYPES = ['message-draft', 'checklist', 'meeting-summary'];

export const AI_OUTPUT_TYPE_LABELS = {
  'message-draft':   'Message Draft',
  'checklist':       'Checklist',
  'meeting-summary': 'Meeting Summary',
};

export const ACTIVITY_COLORS = {
  'Scoping':           '#3578DB',
  'Configuration':     '#2BAF54',
  'Testing':           '#C44A4A',
  'UAT':               '#9B59B6',
  'Training':          '#f97316',
  'Hypercare':         '#C47F0A',
  'Reporting':         '#06b6d4',
  'General Admin':     '#9C8E7E',
  'Account Management':'#ec4899',
};

// ─── Task Interaction Types (what kind of work was done) ──────────────────────
export const TASK_INTERACTION_TYPES = ['Meeting', 'Email', 'Focus Time'];
export const TASK_INTERACTION_TYPE_LABELS = {
  'Meeting':    'Meeting',
  'Email':      'Email',
  'Focus Time': 'Focus Time',
};
export const TASK_INTERACTION_TYPE_COLORS = {
  'Meeting':    '#9B59B6',
  'Email':      '#3578DB',
  'Focus Time': '#2BAF54',
};

// ─── Work Types (bandwidth-first tracking) ──────────────────────────────────
export const WORK_TYPES = ['deep_work', 'meetings', 'comms', 'admin'];

export const WORK_TYPE_LABELS = {
  deep_work: 'Deep Work',
  meetings:  'Meetings',
  comms:     'Comms',
  admin:     'Admin',
};

export const WORK_TYPE_COLORS = {
  deep_work: { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200', hex: '#14b8a6' },
  meetings:  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200', hex: '#3b82f6' },
  comms:     { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', hex: '#8b5cf6' },
  admin:     { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', hex: '#f59e0b' },
};

// Default weekly hour targets per work type (must sum to ≤ 40)
export const DEFAULT_WORK_TYPE_TARGETS = {
  deep_work: 20,
  meetings:  8,
  comms:     8,
  admin:     4,
};

// Map task types → work types for timer auto-fill & migration
export const TASK_TYPE_TO_WORK_TYPE = {
  'focus-time': 'deep_work',
  comms:        'comms',
  evergreen:    'deep_work',
  recurring:    'deep_work',
  mine:         'comms',
  coordinate:   'comms',
};

// Points awarded per work type when a task is marked 'done'
export const WORK_TYPE_POINTS = { deep_work: 2, meetings: 1, comms: 1, admin: 1 };

// ─── Tickets ────────────────────────────────────────────────────────────────
export const TICKET_STATUSES = ['Open', 'In Progress', 'Blocked', 'In Review', 'Done', 'Closed'];

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export const TICKET_STATUS_COLORS = {
  Open:          { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
  'In Progress': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  Blocked:       { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  'In Review':   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  Done:          { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Closed:        { bg: 'bg-gray-100',   text: 'text-gray-600',    border: 'border-gray-200' },
};

export const TICKET_PRIORITY_COLORS = {
  Low:      { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
  Medium:   { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  High:     { bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200' },
  Critical: { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
};

// ─── Pulse: Stress Logging ──────────────────────────────────────────────────
export const STRESSOR_TYPES = ['workload', 'client_issue', 'unclear_priorities', 'meetings', 'personal', 'other'];

export const STRESSOR_LABELS = {
  workload:            'Workload',
  client_issue:        'Client Issue',
  unclear_priorities:  'Unclear Priorities',
  meetings:            'Meetings',
  personal:            'Personal',
  other:               'Other',
};

export const STRESS_LEVELS = [
  { level: 1, emoji: '😌', label: 'Calm',         desc: 'No notable stress. Work felt manageable, no fires, good pace.' },
  { level: 2, emoji: '😐', label: 'Mild',         desc: 'Minor friction or interruptions, nothing that derailed the day.' },
  { level: 3, emoji: '😤', label: 'Moderate',     desc: 'Noticeable pressure. One or more stressors required real mental energy.' },
  { level: 4, emoji: '😰', label: 'High',         desc: 'Difficult day. Multiple stressors, felt stretched thin.' },
  { level: 5, emoji: '🤯', label: 'Overwhelming', desc: 'Survival mode. Reactive all day, significant anxiety.' },
];

// Points-per-hour rate for auto-tracked task sessions (2150 / 160 hours)
export const AUTO_TRACK_RATE = 2150 / 160; // 13.4375
export const AUTO_TRACK_MIN_SECONDS = 30;  // Ignore sessions shorter than 30s

export const TIMER_MODES = {
  STOPWATCH: 'stopwatch',
  POMODORO: 'pomodoro',
};

export const POMODORO_INTERVALS = {
  WORK: 'work',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break',
};

export const POMODORO_CONFIG = {
  WORK_MINUTES: 25,
  SHORT_BREAK_MINUTES: 5,
  LONG_BREAK_MINUTES: 15,
  CYCLES_BEFORE_LONG_BREAK: 4,
};

// Annotation tags
export const ANNOTATION_TAGS = ['good', 'bad', 'learning', 'product'];
export const ANNOTATION_TAG_LABELS = { good: 'Good', bad: 'Bad', learning: 'Learning', product: 'Product' };
export const ANNOTATION_TAG_COLORS = {
  good:     '#2BAF54',  // earthy green
  bad:      '#C44A4A',  // warm red
  learning: '#C47F0A',  // warm amber
  product:  '#3578DB',  // warm blue
};

// ─── Weekly Update Log ────────────────────────────────────────────────────────
export const WEEKLY_UPDATE_LOG_TYPES = ['highlight', 'lowlight', 'neutral', 'learning', 'shoutout', 'annotation', 'next-week-priority'];
export const WEEKLY_UPDATE_LOG_LABELS = {
  highlight:            'Highlight',
  lowlight:             'Lowlight',
  neutral:              'Neutral',
  learning:             'Learning',
  shoutout:             'Shoutout',
  annotation:           'Annotation',
  'next-week-priority': 'Next Week Priority',
};
export const WEEKLY_UPDATE_LOG_COLORS = {
  highlight:            '#2BAF54',  // earthy green
  lowlight:             '#C44A4A',  // warm red
  neutral:              '#9C8E7E',  // warm taupe
  learning:             '#3578DB',  // warm blue
  shoutout:             '#C47F0A',  // warm amber
  annotation:           '#9B59B6',  // warm purple
  'next-week-priority': '#f97316',  // warm orange
};

// ─── Weekly Email Generator ───────────────────────────────────────────────────
export const WEEKLY_REPORT_DEFAULT_PROMPT = `You are a Solutions Engineer at Talkpush, a hiring tech SaaS company. You support enterprise BPO clients like TaskUs, Inspiro, Accenture, Alorica, and Afni. Your manager and stakeholders expect a clear, concise, and professional weekly status email every Friday.

Using the structured work data provided, write a professional weekly status email that:

1. Opens with a one-paragraph executive summary of the week (highlights, key wins, overall tone).
2. Lists key accomplishments by customer — group bullet points under each customer name. Each bullet should be specific and outcome-focused.
3. Calls out any blockers, risks, or items needing escalation.
4. Lists the priorities for next week (use the NEXT WEEK PRIORITIES section provided — do not invent new ones). If no priorities are provided, omit this section.
5. Closes with a brief note on open action items or pending follow-ups.

Tone: professional, confident, direct. Not overly formal. No filler phrases like "I hope this finds you well." No markdown formatting — plain text only. Use short paragraphs. The email should feel like it was written by a human expert, not generated by AI.

Length target: 250–400 words. Never exceed 500 words.`;

// Pre-computed Object.entries() arrays — avoids creating a new array on every render
// that calls Object.entries() inline inside JSX (e.g. dropdown maps in CustomerDetailView).
export const TASK_TYPE_ENTRIES   = Object.entries(TASK_TYPE_LABELS);
export const TASK_STATUS_ENTRIES = Object.entries(TASK_STATUS_LABELS);

// Milestone statuses
export const MILESTONE_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled'];

export const MILESTONE_STATUS_LABELS = {
  'pending':     'Pending',
  'in-progress': 'In Progress',
  'completed':   'Completed',
  'cancelled':   'Cancelled',
};

export const MILESTONE_STATUS_COLORS = {
  'pending':     '#C47F0A',
  'in-progress': '#3578DB',
  'completed':   '#2BAF54',
  'cancelled':   '#9C8E7E',
};

// ─── RAG Memory Search ────────────────────────────────────────────────────────
// System prompt used by Knowledge page's AI semantic search (RAG mode).
// Instructs OpenAI on how to interpret and rank entries from the memory index.
export const RAG_SYSTEM_PROMPT = `You are a personal work memory assistant for a Solutions Engineer.
You have access to excerpts from their work log. Answer their query using ONLY the provided context.
Be concise. If the context doesn't contain enough information, say so honestly.
Always mention the customer name and approximate date when referencing a specific entry.

Entry types in the index:
- task: a work item / to-do logged against a customer
- meeting: meeting notes or AI-generated meeting summary
- weekly update: highlight, lowlight, learning, or shoutout from a weekly log
- artifact: AI-generated output tied to a task — message drafts, checklists, meeting summaries. Indexed by full output text.
- task-note: written notes on a completed task (rich context, links, screenshots). Indexed by note content; subtitle is the parent task description.
- milestone: a project milestone or deliverable
- activity log: a time-logged activity entry with a comment

When ranking or referencing entries, prefer artifact and task-note entries for questions about specific deliverables, drafted content, or detailed work context. Prefer task entries for questions about status or completion.`;

// ─── Smart Email Summary ──────────────────────────────────────────────────────
export const WEEKLY_EMAIL_SUMMARY_PROMPT = `You are summarizing a Solutions Engineer's weekly client email activity. Group emails by customer/company name if identifiable. For each group, extract: key topics discussed, commitments or follow-ups mentioned, and any issues raised. Be concise and professional.

Format your response as a structured summary:
**Client Communications:**
- [company/person]: [1-sentence summary of topic and outcome]

**Internal Coordination:**
- [summary]

**Follow-ups Needed:**
- [summary]

If a category has no items, omit it entirely. Keep it to 8-12 bullet points maximum. Focus on actionable insights, not email metadata.`;
