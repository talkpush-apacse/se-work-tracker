/**
 * POST /api/tasks/webhook — Create a single task from an external source (e.g. Apple Shortcuts).
 *
 * Body (JSON):
 *   description  (string, required) — task description
 *   taskType     (string, optional) — 'comms' | 'focus-time' | 'evergreen'  (default: 'comms')
 *   status       (string, optional) — 'open' | 'in-progress'                (default: 'open')
 *   customerId   (string, optional) — UUID of customer to link             (default: null)
 *
 * Returns: { ok: true, task: { ... } }
 */
import { randomUUID } from 'crypto';
import { sql, authorize } from '../_db.js';

const VALID_TASK_TYPES = new Set(['comms', 'focus-time', 'evergreen', 'recurring']);
const VALID_STATUSES = new Set(['open', 'in-progress']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { description, taskType, status, customerId } = req.body || {};

    // Validate required field
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Missing or empty "description"' });
    }

    // Validate optional fields
    const resolvedTaskType = taskType && VALID_TASK_TYPES.has(taskType) ? taskType : 'comms';
    const resolvedStatus = status && VALID_STATUSES.has(status) ? status : 'open';
    const resolvedCustomerId = customerId || null;

    // Build task object (matches the shape used by the frontend store)
    const task = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      customerId: resolvedCustomerId,
      okrId: null,
      meetingEntryId: null,
      description: description.trim(),
      taskType: resolvedTaskType,
      status: resolvedStatus,
      assigneeOrTeam: null,
      points: 0,
      closedAt: null,
      ticketUrl: null,
      notes: null,
      attachments: [],
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
