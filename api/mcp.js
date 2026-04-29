/**
 * POST /api/mcp — MCP (Model Context Protocol) endpoint for Work Tracker.
 *
 * Lets Claude Desktop / Claude.ai call tools like list_tasks, add_task, etc.
 * Auth: Bearer token via Authorization header OR ?token= query param (Claude.ai connectors)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { sql } from './_db.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorized(req) {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const header = req.headers['authorization'] || '';
  const headerToken = header.replace(/^Bearer\s+/i, '').trim();
  if (headerToken && headerToken === secret) return true;
  if (req.query?.token && req.query.token === secret) return true;
  return false;
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getEntity(entityName) {
  const rows = await sql`SELECT data FROM app_data WHERE entity_name = ${entityName}`;
  return rows.length > 0 && Array.isArray(rows[0].data) ? rows[0].data : [];
}

async function putEntity(entityName, data) {
  await sql`
    INSERT INTO app_data (entity_name, data, updated_at)
    VALUES (${entityName}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (entity_name) DO UPDATE
      SET data       = ${JSON.stringify(data)}::jsonb,
          updated_at = now()
  `;
}

// ── Embedding helper: indexes a single annotation into memory_chunks ──────────
// Mirrors the flow in src/context/StoreContext.jsx + src/utils/chunker.js so
// notes added via MCP show up in Knowledge RAG search just like UI-created notes.
// Silent on failure — never block the note save.
async function indexAnnotationForSearch(annotation, customers) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[mcp/indexAnnotation] OPENAI_API_KEY not set — skipping index');
      return;
    }
    const text = (annotation.text || '').trim();
    if (!text) return;

    const customer = annotation.customerId
      ? customers.find(c => c.id === annotation.customerId)
      : null;
    const customerName = customer?.name || null;

    // Build chunk text the same way src/utils/chunker.js does:
    //   [text, subtext, customerName, label].filter(Boolean).join(' | ')
    const chunkText = [text, customerName, 'Note'].filter(Boolean).join(' | ');
    const chunkId = `annotation_${annotation.id}_0`;

    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: [chunkText],
      }),
    });
    if (!embedRes.ok) {
      console.warn('[mcp/indexAnnotation] OpenAI embed failed:', embedRes.status);
      return;
    }
    const { data } = await embedRes.json();
    const embedding = `[${data[0].embedding.join(',')}]`;
    const metadata = JSON.stringify({ customerName, label: 'Note', subtext: null });

    await sql`
      INSERT INTO memory_chunks (id, entity_type, entity_id, customer_id, date, text, embedding, metadata)
      VALUES (
        ${chunkId},
        ${'annotation'},
        ${annotation.id},
        ${annotation.customerId ?? null},
        ${annotation.date ?? null},
        ${chunkText},
        ${embedding}::vector,
        ${metadata}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        text       = EXCLUDED.text,
        embedding  = EXCLUDED.embedding,
        metadata   = EXCLUDED.metadata,
        created_at = now()
    `;
  } catch (err) {
    console.warn('[mcp/indexAnnotation] indexing failed silently:', err.message);
  }
}

// ── Format a task for output (resolve customer name) ─────────────────────────
function formatTask(task, customers) {
  const customer = customers.find(c => c.id === task.customerId);
  return {
    id:           task.id,
    description:  task.description,
    status:       task.status,
    workType:     task.workType,
    isEvergreen:  task.isEvergreen ?? false,
    customerName: customer?.name ?? null,
    points:       task.points ?? 0,
    createdAt:    task.createdAt,
    closedAt:     task.closedAt ?? null,
  };
}

// ── Vercel handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — needed for Claude.ai connector iframe context
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Build a fresh MCP server per request (stateless — safe for serverless) ──
  const server = new McpServer({
    name:    'work-tracker',
    version: '1.0.0',
  });

  // ── Tool: list_tasks ─────────────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List tasks from the Work Tracker. Optionally filter by status.',
    {
      status: z
        .enum(['open', 'in-progress', 'done', 'blocked'])
        .optional()
        .describe('Filter by status. Omit to return all non-archived tasks.'),
    },
    async ({ status }) => {
      const [tasks, customers] = await Promise.all([
        getEntity('tasks'),
        getEntity('customers'),
      ]);
      const filtered = status
        ? tasks.filter(t => t.status === status)
        : tasks.filter(t => t.status !== 'archived');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filtered.map(t => formatTask(t, customers)), null, 2),
        }],
      };
    }
  );

  // ── Tool: get_tasks_by_customer ───────────────────────────────────────────────
  server.tool(
    'get_tasks_by_customer',
    'Get tasks for a specific customer. Fuzzy-matches the customer name.',
    {
      customer_name: z.string().describe('The customer or account name to search for.'),
    },
    async ({ customer_name }) => {
      const [tasks, customers] = await Promise.all([
        getEntity('tasks'),
        getEntity('customers'),
      ]);
      const lower = customer_name.toLowerCase();
      const matched = customers.filter(c => c.name.toLowerCase().includes(lower));
      if (matched.length === 0) {
        return { content: [{ type: 'text', text: `No customer found matching "${customer_name}".` }] };
      }
      const matchedIds = new Set(matched.map(c => c.id));
      const filtered = tasks.filter(t => matchedIds.has(t.customerId) && t.status !== 'archived');
      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No tasks found for customer matching "${customer_name}".` }] };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filtered.map(t => formatTask(t, customers)), null, 2),
        }],
      };
    }
  );

  // ── Tool: add_task ────────────────────────────────────────────────────────────
  server.tool(
    'add_task',
    'Add a new task to the Work Tracker.',
    {
      description:   z.string().describe('The task description.'),
      customer_name: z.string().describe('The customer or account this task is for.'),
      work_type: z
        .enum(['deep_work', 'meetings'])
        .optional()
        .describe('Type of work. Defaults to deep_work.'),
      is_evergreen: z
        .boolean()
        .optional()
        .describe('Whether this is a recurring evergreen task. Defaults to false.'),
      status: z
        .enum(['open', 'in-progress'])
        .optional()
        .describe('Initial status. Defaults to open.'),
    },
    async ({ description, customer_name, work_type, is_evergreen, status }) => {
      const customers = await getEntity('customers');
      const lower = customer_name.toLowerCase();
      const customer = customers.find(c => c.name.toLowerCase().includes(lower));
      if (!customer) {
        return {
          content: [{
            type: 'text',
            text: `Customer "${customer_name}" not found. Available customers: ${customers.map(c => c.name).join(', ')}`,
          }],
        };
      }

      const tasks = await getEntity('tasks');
      const task = {
        id:             randomUUID(),
        createdAt:      new Date().toISOString(),
        customerId:     customer.id,
        okrId:          null,
        meetingEntryId: null,
        description:    description.trim(),
        workType:       work_type ?? 'deep_work',
        isEvergreen:    is_evergreen ?? false,
        status:         status ?? 'open',
        assigneeOrTeam: null,
        points:         0,
        closedAt:       null,
        ticketUrl:      null,
        notes:          null,
        attachments:    [],
      };
      tasks.push(task);
      await putEntity('tasks', tasks);

      return {
        content: [{
          type: 'text',
          text: `Task created:\n${JSON.stringify(formatTask(task, customers), null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: update_task_status ──────────────────────────────────────────────────
  server.tool(
    'update_task_status',
    'Update the status of a task by its ID.',
    {
      task_id: z.string().describe('The UUID of the task to update.'),
      status: z
        .enum(['open', 'in-progress', 'done', 'blocked'])
        .describe('The new status.'),
    },
    async ({ task_id, status }) => {
      const [tasks, customers] = await Promise.all([
        getEntity('tasks'),
        getEntity('customers'),
      ]);
      const idx = tasks.findIndex(t => t.id === task_id);
      if (idx === -1) {
        return { content: [{ type: 'text', text: `Task "${task_id}" not found.` }] };
      }

      tasks[idx].status = status;
      // Set / clear closedAt alongside status
      if (status === 'done' && !tasks[idx].closedAt) {
        tasks[idx].closedAt = new Date().toISOString();
      } else if (status !== 'done') {
        tasks[idx].closedAt = null;
      }

      await putEntity('tasks', tasks);
      return {
        content: [{
          type: 'text',
          text: `Task updated:\n${JSON.stringify(formatTask(tasks[idx], customers), null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: add_weekly_log ──────────────────────────────────────────────────────
  server.tool(
    'add_weekly_log',
    'Add an entry to the WEEKLY UPDATE REPORT (the Friday email to manager). Use this ONLY for items that should appear in the weekly report: wins, blockers, shoutouts, next-week priorities. Do NOT use this for general notes, insights, or freeform observations — use add_note for those. If the user says "add a note" or "remember this", use add_note instead.',
    {
      type: z
        .enum(['highlight', 'lowlight', 'learning', 'shoutout', 'next-week-priority', 'neutral', 'annotation'])
        .describe('The type of log entry.'),
      text: z
        .string()
        .max(300)
        .describe('The log entry text. Max 300 characters.'),
      customer_name: z
        .string()
        .optional()
        .describe('Optional: link this log to a customer by name (fuzzy match).'),
      date: z
        .string()
        .optional()
        .describe('Optional: date in YYYY-MM-DD format. Defaults to today.'),
    },
    async ({ type, text, customer_name, date }) => {
      const customers = await getEntity('customers');

      // Resolve optional customer
      let customerId = null;
      if (customer_name) {
        const lower = customer_name.toLowerCase();
        const customer = customers.find(c => c.name.toLowerCase().includes(lower));
        if (!customer) {
          return {
            content: [{
              type: 'text',
              text: `Customer "${customer_name}" not found. Available: ${customers.map(c => c.name).join(', ')}`,
            }],
          };
        }
        customerId = customer.id;
      }

      // Validate optional date
      const resolvedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().slice(0, 10);

      const log = {
        id:        randomUUID(),
        createdAt: new Date().toISOString(),
        date:      resolvedDate,
        type,
        text:      text.trim().slice(0, 300),
        ...(customerId ? { customerId } : {}),
      };

      const logs = await getEntity('weeklyUpdateLogs');
      logs.push(log);
      await putEntity('weeklyUpdateLogs', logs);

      return {
        content: [{
          type: 'text',
          text: `Weekly log added:\n${JSON.stringify(log, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: list_weekly_logs ────────────────────────────────────────────────────
  server.tool(
    'list_weekly_logs',
    'List entries from the weekly update report. Optionally filter by type and/or customer. Returns newest first.',
    {
      type: z
        .enum(['highlight', 'lowlight', 'learning', 'shoutout', 'next-week-priority', 'neutral', 'annotation'])
        .optional()
        .describe('Filter by log type.'),
      customer_name: z
        .string()
        .optional()
        .describe('Filter by client name (fuzzy match).'),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe('Max number of entries to return. Defaults to 25.'),
    },
    async ({ type, customer_name, limit }) => {
      const [logs, customers] = await Promise.all([
        getEntity('weeklyUpdateLogs'),
        getEntity('customers'),
      ]);

      let customerIdFilter = null;
      if (customer_name) {
        const lower = customer_name.toLowerCase();
        const matched = customers.filter(c => c.name.toLowerCase().includes(lower));
        if (matched.length === 0) {
          return {
            content: [{ type: 'text', text: `No customer found matching "${customer_name}".` }],
          };
        }
        customerIdFilter = new Set(matched.map(c => c.id));
      }

      let filtered = logs;
      if (type) filtered = filtered.filter(l => l.type === type);
      if (customerIdFilter) filtered = filtered.filter(l => customerIdFilter.has(l.customerId));

      filtered = [...filtered].sort((a, b) => {
        const ad = new Date(a.createdAt || a.date || 0).getTime();
        const bd = new Date(b.createdAt || b.date || 0).getTime();
        return bd - ad;
      });

      const max = limit ?? 25;
      const trimmed = filtered.slice(0, max);

      if (trimmed.length === 0) {
        return { content: [{ type: 'text', text: 'No weekly log entries found.' }] };
      }

      const customerMap = new Map(customers.map(c => [c.id, c.name]));
      const formatted = trimmed.map(l => ({
        id:           l.id,
        date:         l.date,
        type:         l.type,
        text:         l.text,
        customerName: l.customerId ? (customerMap.get(l.customerId) ?? null) : null,
        createdAt:    l.createdAt,
      }));

      return {
        content: [{
          type: 'text',
          text: `Found ${trimmed.length} entry(ies)${filtered.length > trimmed.length ? ` (of ${filtered.length})` : ''}:\n${JSON.stringify(formatted, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: delete_weekly_log ───────────────────────────────────────────────────
  server.tool(
    'delete_weekly_log',
    'Delete a weekly update log entry by its ID. Use list_weekly_logs first to find the ID.',
    {
      log_id: z.string().describe('The UUID of the weekly log entry to delete.'),
    },
    async ({ log_id }) => {
      const logs = await getEntity('weeklyUpdateLogs');
      const idx = logs.findIndex(l => l.id === log_id);
      if (idx === -1) {
        return { content: [{ type: 'text', text: `Weekly log "${log_id}" not found.` }] };
      }
      const removed = logs[idx];
      logs.splice(idx, 1);
      await putEntity('weeklyUpdateLogs', logs);
      return {
        content: [{
          type: 'text',
          text: `Deleted weekly log:\n${JSON.stringify(removed, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: delete_note ─────────────────────────────────────────────────────────
  server.tool(
    'delete_note',
    'Delete a note (annotation) by its ID. Use list_notes first to find the ID. Also removes the note from the Knowledge RAG search index.',
    {
      note_id: z.string().describe('The UUID of the note to delete.'),
    },
    async ({ note_id }) => {
      const annotations = await getEntity('annotations');
      const idx = annotations.findIndex(a => a.id === note_id);
      if (idx === -1) {
        return { content: [{ type: 'text', text: `Note "${note_id}" not found.` }] };
      }
      const removed = annotations[idx];
      annotations.splice(idx, 1);
      await putEntity('annotations', annotations);

      // Clean up the corresponding memory_chunks row so it stops appearing in RAG search.
      try {
        await sql`DELETE FROM memory_chunks WHERE entity_type = 'annotation' AND entity_id = ${note_id}`;
      } catch (err) {
        console.warn('[mcp/delete_note] failed to remove memory_chunks row:', err.message);
      }

      return {
        content: [{
          type: 'text',
          text: `Deleted note:\n${JSON.stringify(removed, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: add_note ────────────────────────────────────────────────────────────
  server.tool(
    'add_note',
    'Add a note to the Knowledge/Notes tab. This is the DEFAULT tool whenever the user says "add a note", "save this", "remember this", or captures a learning / insight / observation. Notes are freeform text, indexed for RAG search, and can be tagged as good / bad / learning / product and optionally linked to a client. Do NOT use this for weekly report items — use add_weekly_log for those.',
    {
      text: z
        .string()
        .describe('The note text. Must be non-empty.'),
      customer_name: z
        .string()
        .optional()
        .describe('Optional: link this note to a client by name (fuzzy match). Omit for "No client".'),
      tag: z
        .enum(['good', 'bad', 'learning', 'product'])
        .optional()
        .describe('Optional tag. Omit for "No tag".'),
      date: z
        .string()
        .optional()
        .describe('Optional: date in YYYY-MM-DD format. Defaults to today.'),
    },
    async ({ text, customer_name, tag, date }) => {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        return { content: [{ type: 'text', text: 'Note text cannot be empty.' }] };
      }

      const customers = await getEntity('customers');

      // Resolve optional customer (fuzzy match — same pattern as add_task / add_weekly_log)
      let customerId = null;
      if (customer_name) {
        const lower = customer_name.toLowerCase();
        const customer = customers.find(c => c.name.toLowerCase().includes(lower));
        if (!customer) {
          return {
            content: [{
              type: 'text',
              text: `Customer "${customer_name}" not found. Available: ${customers.map(c => c.name).join(', ')}`,
            }],
          };
        }
        customerId = customer.id;
      }

      const resolvedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().slice(0, 10);

      const annotation = {
        id:          randomUUID(),
        createdAt:   new Date().toISOString(),
        date:        resolvedDate,
        text:        trimmed,
        customerId:  customerId,
        tag:         tag ?? null,
        attachments: [],
      };

      const annotations = await getEntity('annotations');
      annotations.push(annotation);
      await putEntity('annotations', annotations);

      // Index into memory_chunks so the note surfaces in Knowledge RAG search.
      // Fire-and-await so it completes before the serverless function exits.
      await indexAnnotationForSearch(annotation, customers);

      const customer = customerId ? customers.find(c => c.id === customerId) : null;
      return {
        content: [{
          type: 'text',
          text: `Note added:\n${JSON.stringify({
            id:           annotation.id,
            date:         annotation.date,
            text:         annotation.text,
            tag:          annotation.tag,
            customerName: customer?.name ?? null,
          }, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: list_notes ──────────────────────────────────────────────────────────
  server.tool(
    'list_notes',
    'List notes (annotations) from the Work Tracker. Optionally filter by tag and/or customer. Returns newest first.',
    {
      tag: z
        .enum(['good', 'bad', 'learning', 'product'])
        .optional()
        .describe('Filter by tag.'),
      customer_name: z
        .string()
        .optional()
        .describe('Filter by client name (fuzzy match).'),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe('Max number of notes to return. Defaults to 25.'),
    },
    async ({ tag, customer_name, limit }) => {
      const [annotations, customers] = await Promise.all([
        getEntity('annotations'),
        getEntity('customers'),
      ]);

      // Resolve optional customer filter to a set of IDs (fuzzy match)
      let customerIdFilter = null;
      if (customer_name) {
        const lower = customer_name.toLowerCase();
        const matched = customers.filter(c => c.name.toLowerCase().includes(lower));
        if (matched.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No customer found matching "${customer_name}".`,
            }],
          };
        }
        customerIdFilter = new Set(matched.map(c => c.id));
      }

      let filtered = annotations;
      if (tag) filtered = filtered.filter(a => a.tag === tag);
      if (customerIdFilter) filtered = filtered.filter(a => customerIdFilter.has(a.customerId));

      // Newest first by createdAt (fallback to date)
      filtered = [...filtered].sort((a, b) => {
        const ad = new Date(a.createdAt || a.date || 0).getTime();
        const bd = new Date(b.createdAt || b.date || 0).getTime();
        return bd - ad;
      });

      const max = limit ?? 25;
      const trimmed = filtered.slice(0, max);

      if (trimmed.length === 0) {
        return { content: [{ type: 'text', text: 'No notes found.' }] };
      }

      const customerMap = new Map(customers.map(c => [c.id, c.name]));
      const formatted = trimmed.map(a => ({
        id:           a.id,
        date:         a.date,
        text:         a.text,
        tag:          a.tag ?? null,
        customerName: a.customerId ? (customerMap.get(a.customerId) ?? null) : null,
        createdAt:    a.createdAt,
      }));

      return {
        content: [{
          type: 'text',
          text: `Found ${trimmed.length} note(s)${filtered.length > trimmed.length ? ` (of ${filtered.length})` : ''}:\n${JSON.stringify(formatted, null, 2)}`,
        }],
      };
    }
  );

  // ── OKR helpers ───────────────────────────────────────────────────────────────
  // The OKR entity already lives in app_data as JSONB. KRs are nested inside each
  // OKR as `keyResults[]`. Existing KR shape is `{ id, text, type, value }`; we
  // extend it with optional `accountName`, `status`, `sortOrder` without changing
  // what the frontend reads. The "progress" the MCP spec talks about maps to
  // `kr.value` (numeric) or `kr.value === true ? 100 : 0` (boolean) — same formula
  // the OKRs page uses to render progress bars.
  function currentQuarter() {
    const d = new Date();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q} ${d.getFullYear()}`;
  }

  function krProgressValue(kr) {
    if (kr.type === 'boolean') return kr.value === true ? 100 : 0;
    return typeof kr.value === 'number' ? kr.value : 0;
  }

  function formatKr(kr) {
    return {
      id:           kr.id,
      title:        kr.text ?? '',
      account_name: kr.accountName ?? null,
      progress:     krProgressValue(kr),
      status:       kr.status ?? 'not_started',
    };
  }

  function formatOkrWithKrs(okr) {
    const krs = [...(okr.keyResults || [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return {
      id:           okr.id,
      title:        okr.title,
      quarter:      okr.quarter,
      description:  okr.description ?? '',
      key_results:  krs.map(formatKr),
    };
  }

  // Find a KR and its parent OKR in the okrs array. Returns { okr, kr, okrIdx, krIdx } or null.
  function locateKr(okrs, krId) {
    for (let i = 0; i < okrs.length; i++) {
      const krs = okrs[i].keyResults || [];
      const j = krs.findIndex(kr => kr.id === krId);
      if (j !== -1) return { okr: okrs[i], kr: krs[j], okrIdx: i, krIdx: j };
    }
    return null;
  }

  // ── Tool: list_okrs ───────────────────────────────────────────────────────────
  server.tool(
    'list_okrs',
    'List all OKRs and their key results for a quarter. Returns objectives with nested key results including progress and status.',
    {
      quarter: z
        .string()
        .optional()
        .describe('Quarter filter, e.g. "Q2 2026". Defaults to the current quarter.'),
    },
    async ({ quarter }) => {
      const okrs = await getEntity('okrs');
      const q = quarter || currentQuarter();
      const filtered = okrs.filter(o => o.quarter === q);
      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No OKRs found for ${q}.` }] };
      }
      const sorted = [...filtered].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(sorted.map(formatOkrWithKrs), null, 2),
        }],
      };
    }
  );

  // ── Tool: get_okr_progress ────────────────────────────────────────────────────
  server.tool(
    'get_okr_progress',
    'Get a progress summary for all OKRs in a quarter — overall progress percentage, completion counts, and at-risk flags.',
    {
      quarter: z
        .string()
        .optional()
        .describe('Quarter filter, e.g. "Q2 2026". Defaults to the current quarter.'),
    },
    async ({ quarter }) => {
      const okrs = await getEntity('okrs');
      const q = quarter || currentQuarter();
      const filtered = okrs.filter(o => o.quarter === q);
      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No OKRs found for ${q}.` }] };
      }
      const summary = filtered.map(okr => {
        const krs = okr.keyResults || [];
        const scores = krs.map(krProgressValue);
        const avg = scores.length > 0
          ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0;
        return {
          okr_id:             okr.id,
          okr_title:          okr.title,
          overall_progress:   avg,
          key_results_count:  krs.length,
          completed_count:    krs.filter(k => k.status === 'done').length,
          at_risk_count:      krs.filter(k => k.status === 'at_risk').length,
        };
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // ── Tool: update_key_result ───────────────────────────────────────────────────
  server.tool(
    'update_key_result',
    'Update the progress (0-100) or status (not_started, in_progress, done, at_risk) of a specific key result.',
    {
      key_result_id: z.string().describe('The ID of the key result to update.'),
      progress: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('New progress percentage (0-100). Writes to the KR value; auto-promotes boolean KRs to numeric.'),
      status: z
        .enum(['not_started', 'in_progress', 'done', 'at_risk'])
        .optional()
        .describe('New status.'),
    },
    async ({ key_result_id, progress, status }) => {
      if (progress === undefined && status === undefined) {
        return { content: [{ type: 'text', text: 'Provide at least one of `progress` or `status`.' }] };
      }
      const okrs = await getEntity('okrs');
      const found = locateKr(okrs, key_result_id);
      if (!found) {
        return { content: [{ type: 'text', text: `Key result "${key_result_id}" not found.` }] };
      }
      const kr = { ...found.kr };
      if (progress !== undefined) {
        kr.type = 'numeric';
        kr.value = progress;
      }
      if (status !== undefined) {
        kr.status = status;
      }
      okrs[found.okrIdx].keyResults[found.krIdx] = kr;
      await putEntity('okrs', okrs);
      return {
        content: [{
          type: 'text',
          text: `Key result updated:\n${JSON.stringify({ okr_id: found.okr.id, okr_title: found.okr.title, ...formatKr(kr) }, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: link_task_to_okr ────────────────────────────────────────────────────
  server.tool(
    'link_task_to_okr',
    'Link an existing task to a key result, establishing a connection between daily work and quarterly objectives.',
    {
      task_id:       z.string().describe('The UUID of the task to link.'),
      key_result_id: z.string().describe('The ID of the key result to link the task to.'),
    },
    async ({ task_id, key_result_id }) => {
      const [tasks, okrs] = await Promise.all([
        getEntity('tasks'),
        getEntity('okrs'),
      ]);
      const taskIdx = tasks.findIndex(t => t.id === task_id);
      if (taskIdx === -1) {
        return { content: [{ type: 'text', text: `Task "${task_id}" not found.` }] };
      }
      const found = locateKr(okrs, key_result_id);
      if (!found) {
        return { content: [{ type: 'text', text: `Key result "${key_result_id}" not found.` }] };
      }
      // Set both the KR link and the parent OKR link, so the existing OKRs page
      // (which filters tasks via task.okrId) keeps showing this task under the OKR.
      tasks[taskIdx] = {
        ...tasks[taskIdx],
        keyResultId: key_result_id,
        okrId:       found.okr.id,
      };
      await putEntity('tasks', tasks);
      return {
        content: [{
          type: 'text',
          text: `Task linked:\n${JSON.stringify({
            task_id:          tasks[taskIdx].id,
            task_description: tasks[taskIdx].description,
            key_result_id:    found.kr.id,
            key_result_title: found.kr.text ?? '',
            okr_id:           found.okr.id,
            okr_title:        found.okr.title,
          }, null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: get_tasks_by_okr ────────────────────────────────────────────────────
  server.tool(
    'get_tasks_by_okr',
    'Get all tasks linked to a specific OKR or all OKR-linked tasks. Useful for seeing what work is contributing to which objectives.',
    {
      okr_id: z
        .string()
        .optional()
        .describe('Optional OKR ID. Omit to get tasks linked to any OKR.'),
      quarter: z
        .string()
        .optional()
        .describe('Optional quarter filter, e.g. "Q2 2026". Combined with okr_id if both provided.'),
    },
    async ({ okr_id, quarter }) => {
      const [tasks, okrs, customers] = await Promise.all([
        getEntity('tasks'),
        getEntity('okrs'),
        getEntity('customers'),
      ]);

      // Decide which OKR IDs are in scope.
      let scopeOkrIds;
      if (okr_id) {
        scopeOkrIds = new Set([okr_id]);
        if (!okrs.some(o => o.id === okr_id)) {
          return { content: [{ type: 'text', text: `OKR "${okr_id}" not found.` }] };
        }
      } else if (quarter) {
        scopeOkrIds = new Set(okrs.filter(o => o.quarter === quarter).map(o => o.id));
        if (scopeOkrIds.size === 0) {
          return { content: [{ type: 'text', text: `No OKRs found for ${quarter}.` }] };
        }
      } else {
        scopeOkrIds = new Set(okrs.map(o => o.id));
      }

      // Build a KR-id → { okr, kr } lookup for quick lookup when a task is linked
      // via keyResultId but the older okrId field is missing.
      const krIndex = new Map();
      for (const okr of okrs) {
        for (const kr of (okr.keyResults || [])) {
          krIndex.set(kr.id, { okr, kr });
        }
      }

      const filtered = tasks.filter(t => {
        if (t.okrId && scopeOkrIds.has(t.okrId)) return true;
        if (t.keyResultId) {
          const hit = krIndex.get(t.keyResultId);
          if (hit && scopeOkrIds.has(hit.okr.id)) return true;
        }
        return false;
      });

      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks linked to these OKRs.' }] };
      }

      const okrMap = new Map(okrs.map(o => [o.id, o]));
      const formatted = filtered.map(t => {
        const krHit = t.keyResultId ? krIndex.get(t.keyResultId) : null;
        const okr = okrMap.get(t.okrId) ?? krHit?.okr ?? null;
        return {
          ...formatTask(t, customers),
          key_result_id:    t.keyResultId ?? null,
          key_result_title: krHit?.kr.text ?? null,
          okr_id:           okr?.id ?? null,
          okr_title:        okr?.title ?? null,
        };
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
      };
    }
  );

  // ── Tool: add_okr ─────────────────────────────────────────────────────────────
  server.tool(
    'add_okr',
    'Create a new OKR objective for a specific quarter.',
    {
      title:   z.string().describe('The OKR title.'),
      quarter: z.string().describe('The quarter this OKR belongs to, e.g. "Q2 2026".'),
    },
    async ({ title, quarter }) => {
      const trimmed = (title || '').trim();
      if (!trimmed) {
        return { content: [{ type: 'text', text: 'OKR title cannot be empty.' }] };
      }
      const okrs = await getEntity('okrs');
      const maxSort = okrs
        .filter(o => o.quarter === quarter)
        .reduce((m, o) => Math.max(m, o.sortOrder ?? 0), 0);
      const okr = {
        id:          randomUUID(),
        title:       trimmed,
        quarter,
        description: '',
        keyResults:  [],
        sortOrder:   maxSort + 1,
        createdAt:   new Date().toISOString(),
      };
      okrs.push(okr);
      await putEntity('okrs', okrs);
      return {
        content: [{
          type: 'text',
          text: `OKR created:\n${JSON.stringify(formatOkrWithKrs(okr), null, 2)}`,
        }],
      };
    }
  );

  // ── Tool: add_key_result ──────────────────────────────────────────────────────
  server.tool(
    'add_key_result',
    'Add a new key result under an existing OKR objective.',
    {
      okr_id:       z.string().describe('The ID of the parent OKR.'),
      title:        z.string().describe('The key result title.'),
      account_name: z
        .string()
        .optional()
        .describe('Optional: which client account this key result relates to.'),
    },
    async ({ okr_id, title, account_name }) => {
      const trimmed = (title || '').trim();
      if (!trimmed) {
        return { content: [{ type: 'text', text: 'Key result title cannot be empty.' }] };
      }
      const okrs = await getEntity('okrs');
      const idx = okrs.findIndex(o => o.id === okr_id);
      if (idx === -1) {
        return { content: [{ type: 'text', text: `OKR "${okr_id}" not found.` }] };
      }
      const existing = okrs[idx].keyResults || [];
      const maxSort = existing.reduce((m, k) => Math.max(m, k.sortOrder ?? 0), 0);
      const kr = {
        id:          randomUUID(),
        text:        trimmed,
        type:        'numeric',
        value:       null,
        accountName: account_name?.trim() || null,
        status:      'not_started',
        sortOrder:   maxSort + 1,
      };
      okrs[idx] = { ...okrs[idx], keyResults: [...existing, kr] };
      await putEntity('okrs', okrs);
      return {
        content: [{
          type: 'text',
          text: `Key result created:\n${JSON.stringify({ okr_id: okrs[idx].id, okr_title: okrs[idx].title, ...formatKr(kr) }, null, 2)}`,
        }],
      };
    }
  );

  // ── Stateless transport (one per request, safe for Vercel serverless) ─────────
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // disable sessions — stateless mode
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
