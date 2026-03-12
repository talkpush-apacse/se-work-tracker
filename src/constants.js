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
  mine:         { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  coordinate:   { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/20' },
  comms:        { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20' },
  'focus-time': { bg: 'bg-teal-500/15',   text: 'text-teal-400',   border: 'border-teal-500/20' },
  evergreen:    { bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/20' },
  recurring:    { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/20' },
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
  'open': { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/20' },
  'in-progress': { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  'done': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'blocked': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
  'archived': { bg: 'bg-gray-800/60', text: 'text-gray-600', border: 'border-gray-700/40' },
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
  'Scoping':           '#6366f1',
  'Configuration':     '#10b981',
  'Testing':           '#f43f5e',
  'UAT':               '#8b5cf6',
  'Training':          '#f97316',
  'Hypercare':         '#f59e0b',
  'Reporting':         '#06b6d4',
  'General Admin':     '#6b7280',
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
  'Meeting':    '#8b5cf6',
  'Email':      '#6366f1',
  'Focus Time': '#10b981',
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
  deep_work: { bg: 'bg-teal-500/15',   text: 'text-teal-400',   border: 'border-teal-500/20', hex: '#14b8a6' },
  meetings:  { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/20', hex: '#3b82f6' },
  comms:     { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20', hex: '#8b5cf6' },
  admin:     { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/20', hex: '#f59e0b' },
};

// Default weekly hour targets per work type (must sum to ≤ 40)
export const DEFAULT_WORK_TYPE_TARGETS = {
  deep_work: 20,
  meetings:  8,
  comms:     8,
  admin:     4,
};

// Map task types → work types for timer auto-fill
export const TASK_TYPE_TO_WORK_TYPE = {
  'focus-time': 'deep_work',
  comms:        'comms',
  evergreen:    'deep_work',
  recurring:    'deep_work',
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

// Annotation tags
export const ANNOTATION_TAGS = ['good', 'bad', 'learning'];
export const ANNOTATION_TAG_LABELS = { good: 'Good', bad: 'Bad', learning: 'Learning' };
export const ANNOTATION_TAG_COLORS = {
  good:     '#10b981',  // emerald green
  bad:      '#f43f5e',  // rose red
  learning: '#f59e0b',  // amber yellow
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
  highlight:            '#10b981',  // emerald green
  lowlight:             '#f43f5e',  // rose red
  neutral:              '#6b7280',  // gray
  learning:             '#3b82f6',  // blue
  shoutout:             '#f59e0b',  // amber/gold
  annotation:           '#8b5cf6',  // violet
  'next-week-priority': '#f97316',  // orange
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
  'pending':     '#f59e0b',
  'in-progress': '#6366f1',
  'completed':   '#10b981',
  'cancelled':   '#6b7280',
};

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
