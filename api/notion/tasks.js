/**
 * GET /api/notion/tasks — Read active tasks from the Notion task database.
 */
import { authorize } from '../_db.js';

const NOTION_DATABASE_ID = '36e8ce3b-3e42-8034-815a-e9b7727c5dc6';
const NOTION_API_VERSION = '2022-06-28';
const CACHE_TTL_MS = 60 * 1000;

let cachedTasks = null;
let cachedAt = 0;

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

function normalizeTask(page) {
  return {
    id: page.id,
    task_name: getTitle(page.properties, 'Task name'),
    account: getSelectName(page.properties, 'Account'),
    okr: getSelectName(page.properties, 'OKR'),
    status: getStatusName(page.properties, 'Status'),
    priority: getSelectName(page.properties, 'Priority'),
    description: getRichText(page.properties, 'Description'),
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
  const forceRefresh = req.query?.force === '1' || req.query?.force === 'true';

  if (!notionToken) {
    console.error('[GET /api/notion/tasks] NOTION_API_TOKEN is not set');
    return res.status(500).json({ error: 'Server is missing NOTION_API_TOKEN configuration' });
  }

  const now = Date.now();
  if (!forceRefresh && cachedTasks && (now - cachedAt) < CACHE_TTL_MS) {
    return res.status(200).json({ tasks: cachedTasks });
  }

  try {
    const notionRes = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${notionToken}`,
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
    });

    if (!notionRes.ok) {
      const errorBody = await notionRes.json().catch(() => ({}));
      const message = errorBody.message || `Notion API error (${notionRes.status})`;
      console.error('[GET /api/notion/tasks] Notion error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await notionRes.json();
    const tasks = Array.isArray(data.results)
      ? data.results
          .map(normalizeTask)
          .filter((task) => task.task_name)
      : [];

    cachedTasks = tasks;
    cachedAt = now;

    return res.status(200).json({ tasks });
  } catch (err) {
    console.error('[GET /api/notion/tasks]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
