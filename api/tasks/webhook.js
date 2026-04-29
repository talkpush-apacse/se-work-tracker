/**
 * POST /api/tasks/webhook — Create a single task from an external source (e.g. Apple Shortcuts).
 *
 * Body (JSON):
 *   description  (string, required) — task description
 *   workType     (string, optional) — 'deep_work'|'meetings' (default: 'deep_work')
 *                                     Legacy values 'comms'/'admin' are silently mapped to 'deep_work'.
 *   taskType     (string, optional) — legacy alias; mapped to workType for backward compat
 *   status       (string, optional) — 'open' | 'in-progress'               (default: 'open')
 *   customerId   (string, optional) — UUID of customer to link             (default: null)
 *   isEvergreen  (boolean, optional) — marks task as weekly-recurring       (default: false)
 *
 * Returns: { ok: true, task: { ... } }
 */
import { randomUUID } from 'crypto';
import { sql, authorize } from '../_db.js';

// Current valid work types (matches frontend WORK_TYPES constant)
const VALID_WORK_TYPES = new Set(['deep_work', 'meetings']);
const VALID_STATUSES   = new Set(['open', 'in-progress']);

// Map legacy taskType + old workType values → current workType.
// Existing Apple Shortcuts that POST workType:'comms' will silently map to deep_work.
const TASK_TYPE_TO_WORK_TYPE = {
  'comms':      'deep_work',
  'admin':      'deep_work',
  'focus-time': 'deep_work',
  'evergreen':  'deep_work',
  'recurring':  'deep_work',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { description, workType, taskType, status, customerId, isEvergreen } = req.body || {};

    // Validate required field
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Missing or empty "description"' });
    }

    // Resolve workType: prefer explicit workType, fall back to mapped taskType, then 'deep_work'
    const rawType = workType || taskType;
    const resolvedWorkType = VALID_WORK_TYPES.has(rawType)
      ? rawType
      : (TASK_TYPE_TO_WORK_TYPE[rawType] || 'deep_work');

    // isEvergreen: explicit flag OR inferred from legacy taskType='evergreen'
    const resolvedIsEvergreen = isEvergreen === true || taskType === 'evergreen';

    const resolvedStatus     = VALID_STATUSES.has(status) ? status : 'open';
    const resolvedCustomerId = customerId || null;

    // Build task object using the current schema (workType + isEvergreen, no taskType)
    const task = {
      id:             randomUUID(),
      createdAt:      new Date().toISOString(),
      customerId:     resolvedCustomerId,
      okrId:          null,
      meetingEntryId: null,
      description:    description.trim(),
      workType:       resolvedWorkType,
      isEvergreen:    resolvedIsEvergreen,
      status:         resolvedStatus,
      assigneeOrTeam: null,
      points:         0,
      closedAt:       null,
      ticketUrl:      null,
      notes:          null,
      attachments:    [],
    };

    // Fetch current tasks, append new one, save back
    const rows = await sql`SELECT data FROM app_data WHERE entity_name = 'tasks'`;
    const currentTasks = rows.length > 0 && Array.isArray(rows[0].data) ? rows[0].data : [];
    currentTasks.push(task);

    await sql`
      INSERT INTO app_data (entity_name, data, updated_at)
      VALUES ('tasks', ${JSON.stringify(currentTasks)}::jsonb, now())
      ON CONFLICT (entity_name) DO UPDATE
        SET data = ${JSON.stringify(currentTasks)}::jsonb,
            updated_at = now()
    `;

    return res.status(201).json({ ok: true, task });
  } catch (err) {
    console.error('[POST /api/tasks/webhook]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
