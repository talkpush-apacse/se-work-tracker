/**
 * GET /api/data — Load all entities in a single round-trip.
 * Returns: { okrs: [...], customers: [...], projects: [...], ... }
 */
import { sql, authorize } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rows = await sql`SELECT entity_name, data FROM app_data ORDER BY entity_name`;

    // Build a { entity_name: data } map
    const result = {};
    for (const row of rows) {
      result[row.entity_name] = row.data;
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/data]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
