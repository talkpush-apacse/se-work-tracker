/**
 * GET /api/notion/okrs — Fetch all OKRs from the Notion OKR Tracker database.
 *
 * Returns them formatted for the SE Work Tracker OKR store, using Notion page
 * IDs as the OKR `id` field. This means a Notion task's OKR relation page ID
 * maps directly to a SE Tracker OKR — no fuzzy title matching needed.
 *
 * Rollback: nothing to roll back on the server. Client-side, the store's
 * updateEntity('okrs', ...) call is the only mutation.
 */
import { authorize } from '../_db.js';

const NOTION_OKR_DATABASE_ID = '3708ce3b-3e42-8011-9c42-f655fd1fb069';
const NOTION_API_VERSION = '2022-06-28';

function getTitle(properties, propertyName) {
  const title = properties?.[propertyName]?.title;
  if (!Array.isArray(title) || title.length === 0) return '';
  return title.map((item) => item?.plain_text || '').join('').trim();
}

function getSelectName(properties, propertyName) {
  return properties?.[propertyName]?.select?.name || null;
}

function getStatusValue(properties, propertyName) {
  // Notion "Status" type uses .status.name; fall back to .select.name
  return (
    properties?.[propertyName]?.status?.name ||
    properties?.[propertyName]?.select?.name ||
    null
  );
}

function normalizeOkr(page) {
  const title = getTitle(page.properties, 'Goal name');
  const quarter = getSelectName(page.properties, 'Quarter');
  const status = getStatusValue(page.properties, 'Status');

  return {
    id: page.id,                                         // Notion page ID = SE Tracker OKR ID
    title,
    quarter: quarter ? `${quarter} 2026` : 'Evergreen', // "Q2" → "Q2 2026", null → "Evergreen"
    status: status || 'Not started',
    keyResults: [],
    createdAt: page.created_time || new Date().toISOString(),
    notionId: page.id,                                   // explicit redundant field for clarity
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const notionToken = globalThis.process?.env?.NOTION_API_TOKEN;
  if (!notionToken) {
    return res.status(500).json({ error: 'Server is missing NOTION_API_TOKEN configuration' });
  }

  try {
    // Fetch all pages from the OKR database (no filter — we want every OKR)
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_OKR_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${notionToken}`,
          'Notion-Version': NOTION_API_VERSION,
        },
        body: JSON.stringify({ page_size: 100 }),
      }
    );

    if (!notionRes.ok) {
      const errorBody = await notionRes.json().catch(() => ({}));
      const message = errorBody.message || `Notion API error (${notionRes.status})`;
      console.error('[GET /api/notion/okrs] Notion error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await notionRes.json();
    const okrs = Array.isArray(data.results)
      ? data.results.map(normalizeOkr).filter((o) => o.title)
      : [];

    return res.status(200).json({ okrs, count: okrs.length });
  } catch (err) {
    console.error('[GET /api/notion/okrs]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
