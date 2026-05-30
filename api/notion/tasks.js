/**
 * GET /api/notion/tasks — Read active tasks from the Notion task database.
 *
 * The OKR field is a Relation property (links to a separate Notion OKR page).
 * We resolve it by fetching the related page's title in parallel after the
 * main database query, then cache the fully-resolved tasks for 60 seconds.
 */
import { authorize } from '../_db.js';

const NOTION_DATABASE_ID = '36e8ce3b-3e42-8034-815a-e9b7727c5dc6';
const NOTION_API_VERSION = '2022-06-28';
const CACHE_TTL_MS = 60 * 1000;

let cachedTasks = null;
let cachedAt = 0;

// ── Property accessors ────────────────────────────────────────────────────────

function getTitle(properties, propertyName) {
  const title = properties?.[propertyName]?.title;
  if (!Array.isArray(title) || title.length === 0) return '';
  return title.map((item) => item?.plain_text || '').join('').trim();
}

function getRichText(properties, propertyName) {
  const richText = properties?.[propertyName]?.rich_text;
  if (!Array.isArray(richText) || richText.length === 0) return '';
  return richText.map((item) => item?.plain_text || '').join('').trim();
}

function getSelectName(properties, propertyName) {
  return properties?.[propertyName]?.select?.name || null;
}

function getStatusName(properties, propertyName) {
  return properties?.[propertyName]?.status?.name || null;
}

/**
 * Extract page IDs from a Relation property (returns [] when unset or wrong type).
 */
function getRelationIds(properties, propertyName) {
  const relation = properties?.[propertyName]?.relation;
  if (!Array.isArray(relation) || relation.length === 0) return [];
  return relation.map((r) => r.id).filter(Boolean);
}

// ── Notion page title resolver ────────────────────────────────────────────────

/**
 * Fetch the plain-text title of a single Notion page.
 * Returns null on any error (missing access, network, etc.) so callers can
 * degrade gracefully rather than crashing the whole tasks request.
 */
async function fetchPageTitle(pageId, notionToken) {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });
    if (!res.ok) return null;
    const page = await res.json();
    // The title property is whichever property has type === 'title'
    const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
    if (!Array.isArray(titleProp?.title) || titleProp.title.length === 0) return null;
    return titleProp.title.map((item) => item?.plain_text || '').join('').trim() || null;
  } catch {
    return null;
  }
}

// ── Task normalizer ───────────────────────────────────────────────────────────

/**
 * Convert a raw Notion page object into the shape the client expects.
 * `okr` is set to null here and populated separately after relation resolution.
 */
function normalizeTask(page) {
  return {
    id: page.id,
    task_name: getTitle(page.properties, 'Task name'),
    account: getSelectName(page.properties, 'Account'),
    okr: null, // resolved below via Relation page title fetch
    status: getStatusName(page.properties, 'Status'),
    priority: getSelectName(page.properties, 'Priority'),
    description: getRichText(page.properties, 'Description'),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const notionToken = globalThis.process?.env?.NOTION_API_TOKEN;
  const forceRefresh = req.query?.force === '1' || req.query?.force === 'true';

  if (!notionToken) {
    console.error('[GET /api/notion/tasks] NOTION_API_TOKEN is not set');
    return res.status(500).json({ error: 'Server is missing NOTION_API_TOKEN configuration' });
  }

  const now = Date.now();
  if (!forceRefresh && cachedTasks && now - cachedAt < CACHE_TTL_MS) {
    return res.status(200).json({ tasks: cachedTasks });
  }

  try {
    // 1. Fetch active tasks from the database
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${notionToken}`,
          'Notion-Version': NOTION_API_VERSION,
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: 'Status', status: { does_not_equal: 'Done' } },
              { property: 'Status', status: { does_not_equal: 'Parked' } },
            ],
          },
        }),
      }
    );

    if (!notionRes.ok) {
      const errorBody = await notionRes.json().catch(() => ({}));
      const message = errorBody.message || `Notion API error (${notionRes.status})`;
      console.error('[GET /api/notion/tasks] Notion error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await notionRes.json();
    const rawPages = Array.isArray(data.results) ? data.results : [];

    // 2. Collect every unique OKR relation page ID across all tasks
    const uniqueOkrPageIds = [
      ...new Set(rawPages.flatMap((page) => getRelationIds(page.properties, 'OKR'))),
    ];

    // 3. Fetch each OKR page title in parallel — failures silently return null
    const okrTitleMap = {};
    if (uniqueOkrPageIds.length > 0) {
      const results = await Promise.all(
        uniqueOkrPageIds.map((id) =>
          fetchPageTitle(id, notionToken).then((title) => ({ id, title }))
        )
      );
      results.forEach(({ id, title }) => {
        if (title) okrTitleMap[id] = title;
      });
    }

    // 4. Normalize tasks and attach the resolved OKR title (first relation only)
    const tasks = rawPages
      .map((page) => {
        const task = normalizeTask(page);
        const okrIds = getRelationIds(page.properties, 'OKR');
        task.okr = okrIds.length > 0 ? (okrTitleMap[okrIds[0]] ?? null) : null;
        return task;
      })
      .filter((task) => task.task_name);

    cachedTasks = tasks;
    cachedAt = now;

    return res.status(200).json({ tasks });
  } catch (err) {
    console.error('[GET /api/notion/tasks]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
