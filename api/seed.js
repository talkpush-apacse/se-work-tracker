/**
 * POST /api/seed — One-time migration from localStorage to Neon.
 * Body: { okrs: [...], customers: [...], ... }
 * Bulk-upserts all entities. Used once during first migration.
 */
import { sql, authorize } from './_db.js';

const ALLOWED_ENTITIES = new Set([
  'okrs', 'customers', 'projects', 'points',
  'meetingEntries', 'tasks', 'milestones',
  'aiOutputs', 'aiSettings',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;
    let count = 0;

    for (const [entity, data] of Object.entries(body)) {
      if (!ALLOWED_ENTITIES.has(entity)) continue;

      await sql`
        INSERT INTO app_data (entity_name, data, updated_at)
        VALUES (${entity}, ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (entity_name) DO UPDATE
          SET data = ${JSON.stringify(data)}::jsonb,
              updated_at = now()
      `;
      count++;
    }

    return res.status(200).json({ ok: true, entitiesSeeded: count });
  } catch (err) {
    console.error('[POST /api/seed]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
