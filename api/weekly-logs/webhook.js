/**
 * POST /api/weekly-logs/webhook — Add a weekly update log from an external source (e.g. Apple Shortcuts).
 *
 * Body (JSON):
 *   text   (string, required)  — the log entry text (max 300 chars)
 *   type   (string, required)  — 'highlight' | 'lowlight' | 'learning' | 'shoutout' | 'annotation' | 'next-week-priority'
 *   date   (string, optional)  — 'YYYY-MM-DD' format (default: today)
 *   customerId (string, optional) — UUID of customer to link (default: null)
 *
 * Returns: { ok: true, log: { ... } }
 */
import { randomUUID } from 'crypto';
import { sql, authorize } from '../_db.js';

const VALID_TYPES = new Set([
  'highlight',
  'lowlight',
  'neutral',
  'learning',
  'shoutout',
  'annotation',
  'next-week-priority',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { text, type, date, customerId } = req.body || {};

    // Validate required fields
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Missing or empty "text"' });
    }
    if (!type || !VALID_TYPES.has(type)) {
      return res.status(400).json({
        error: `Invalid "type". Must be one of: ${[...VALID_TYPES].join(', ')}`,
      });
    }

    // Validate optional date (YYYY-MM-DD)
    const resolvedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

    const log = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      date: resolvedDate,
      type,
      text: text.trim().slice(0, 300),
      ...(customerId ? { customerId } : {}),
    };

    // Fetch current logs, append new one, save back
    const rows = await sql`SELECT data FROM app_data WHERE entity_name = 'weeklyUpdateLogs'`;
    const currentLogs = rows.length > 0 && Array.isArray(rows[0].data) ? rows[0].data : [];
    currentLogs.push(log);

    await sql`
      INSERT INTO app_data (entity_name, data, updated_at)
      VALUES ('weeklyUpdateLogs', ${JSON.stringify(currentLogs)}::jsonb, now())
      ON CONFLICT (entity_name) DO UPDATE
        SET data = ${JSON.stringify(currentLogs)}::jsonb,
            updated_at = now()
    `;

    return res.status(201).json({ ok: true, log });
  } catch (err) {
    console.error('[POST /api/weekly-logs/webhook]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
