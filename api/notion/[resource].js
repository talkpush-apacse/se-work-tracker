/**
 * GET /api/notion/tasks  — active tasks from the Notion task database
 * GET /api/notion/okrs   — all OKRs from the Notion OKR Tracker database
 *
 * Combined into one serverless function to stay within Vercel Hobby's 12-function limit.
 * Route is determined by req.query.resource ('tasks' | 'okrs').
 */
import { authorize } from '../_db.js';

const NOTION_API_VERSION = '2022-06-28';

// ── Shared property accessors ─────────────────────────────────────────────────

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

function getStatusValue(properties, propertyName) {
  return (
    properties?.[propertyName]?.status?.name ||
    properties?.[propertyName]?.select?.name ||
    null
  );
}

function getRelationIds(properties, propertyName) {
  const relation = properties?.[propertyName]?.relation;
  if (!Array.isArray(relation) || relation.length === 0) return [];
  return relation.map((r) => r.id).filter(Boolean);
}

// ── Tasks handler ─────────────────────────────────────────────────────────────

const TASKS_DB_ID = '36e8ce3b-3e42-8034-815a-e9b7727c5dc6';
const TASKS_CACHE_TTL_MS = 60 * 1000;
let cachedTasks = null;
let tasksCachedAt = 0;

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
    const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
    if (!Array.isArray(titleProp?.title) || titleProp.title.length === 0) return null;
    return titleProp.title.map((item) => item?.plain_text || '').join('').trim() || null;
  } catch {
    return null;
  }
}

function normalizeTask(page) {
  return {
    id: page.id,
    task_name: getTitle(page.properties, 'Task name'),
    account: getSelectName(page.properties, 'Account'),
    okr: null,
    okrPageId: null,
    status: getStatusValue(page.properties, 'Status'),
    priority: getSelectName(page.properties, 'Priority'),
    description: getRichText(page.properties, 'Description'),
  };
}

async function handleTasks(req, res, notionToken) {
  const forceRefresh = req.query?.force === '1' || req.query?.force === 'true';
  const now = Date.now();

  if (!forceRefresh && cachedTasks && now - tasksCachedAt < TASKS_CACHE_TTL_MS) {
    return res.status(200).json({ tasks: cachedTasks });
  }

  const notionRes = await fetch(
    `https://api.notion.com/v1/databases/${TASKS_DB_ID}/query`,
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
            { property: 'Status', status: { does_not_equal: 'Delegated' } },
          ],
        },
      }),
    }
  );

  if (!notionRes.ok) {
    const errorBody = await notionRes.json().catch(() => ({}));
    const message = errorBody.message || `Notion API error (${notionRes.status})`;
    console.error('[notion/tasks] Notion error:', message);
    return res.status(502).json({ error: message });
  }

  const data = await notionRes.json();
  const rawPages = Array.isArray(data.results) ? data.results : [];

  const uniqueOkrPageIds = [
    ...new Set(rawPages.flatMap((page) => getRelationIds(page.properties, 'OKR'))),
  ];

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

  const tasks = rawPages
    .map((page) => {
      const task = normalizeTask(page);
      const okrIds = getRelationIds(page.properties, 'OKR');
      task.okr = okrIds.length > 0 ? (okrTitleMap[okrIds[0]] ?? null) : null;
      task.okrPageId = okrIds[0] ?? null;
      return task;
    })
    .filter((task) => task.task_name);

  cachedTasks = tasks;
  tasksCachedAt = now;

  return res.status(200).json({ tasks });
}

// ── OKRs handler ──────────────────────────────────────────────────────────────

const OKRS_DB_ID = '3708ce3b-3e42-8011-9c42-f655fd1fb069';

function normalizeOkr(page) {
  const title = getTitle(page.properties, 'Goal name');
  const quarter = getSelectName(page.properties, 'Quarter');
  const status = getStatusValue(page.properties, 'Status');
  return {
    id: page.id,
    title,
    quarter: quarter ? `${quarter} 2026` : 'Evergreen',
    status: status || 'Not started',
    keyResults: [],
    createdAt: page.created_time || new Date().toISOString(),
    notionId: page.id,
  };
}

async function handleOkrs(req, res, notionToken) {
  const notionRes = await fetch(
    `https://api.notion.com/v1/databases/${OKRS_DB_ID}/query`,
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
    console.error('[notion/okrs] Notion error:', message);
    return res.status(502).json({ error: message });
  }

  const data = await notionRes.json();
  const okrs = Array.isArray(data.results)
    ? data.results.map(normalizeOkr).filter((o) => o.title)
    : [];

  return res.status(200).json({ okrs, count: okrs.length });
}

// ── Router ────────────────────────────────────────────────────────────────────

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

  const resource = req.query?.resource;

  try {
    if (resource === 'tasks') return await handleTasks(req, res, notionToken);
    if (resource === 'okrs')  return await handleOkrs(req, res, notionToken);
    return res.status(404).json({ error: `Unknown resource: ${resource}` });
  } catch (err) {
    console.error(`[notion/${resource}]`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
