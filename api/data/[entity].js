/**
 * PUT /api/data/:entity — Save one entity's data.
 * Body: { data: [...] } (the full JSON array/object for this entity)
 * Upserts the row in app_data.
 */
import { sql, authorize } from '../_db.js';

const ALLOWED_ENTITIES = new Set([
  'okrs', 'customers', 'projects', 'points',
  'meetingEntries', 'tasks', 'milestones',
  'aiOutputs', 'aiSettings',
]);

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { entity } = req.query;

  if (!ALLOWED_ENTITIES.has(entity)) {
    return res.status(400).json({ error: `Unknown entity: ${entity}` });
  }

  try {
    const { data } = req.body;

    if (data === undefined) {
      return res.status(400).json({ error: 'Missing "data" field in body' });
    }

    await sql`
      INSERT INTO app_data (entity_name, data, updated_at)
      VALUES (${entity}, ${JSON.stringify(data)}::jsonb, now())
      ON CONFLICT (entity_name) DO UPDATE
        SET data = ${JSON.stringify(data)}::jsonb,
            updated_at = now()
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[PUT /api/data/${entity}]`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
