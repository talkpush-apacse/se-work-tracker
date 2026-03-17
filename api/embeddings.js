// SETUP REQUIRED: Run the SQL in ARCHITECTURE.md#vector-setup before deploying
import { sql, authorize } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { op } = req.query;

  if (op === 'upsert') return handleUpsert(req, res);
  if (op === 'search') return handleSearch(req, res);
  return res.status(400).json({ error: 'Invalid op. Use ?op=upsert or ?op=search' });
}

// How many chunks to upsert per SQL round-trip.
// Keeps individual queries fast and well under Neon's HTTP payload limits.
const UPSERT_BATCH_SIZE = 25;

async function handleUpsert(req, res) {
  const { chunks } = req.body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ error: 'chunks must be a non-empty array' });
  }

  // Batch embed all texts in a single OpenAI request
  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: chunks.map(c => c.text),
    }),
  });

  if (!embedRes.ok) {
    const err = await embedRes.json().catch(() => ({}));
    return res.status(502).json({ error: err.error?.message || 'OpenAI embedding error' });
  }

  const { data } = await embedRes.json();

  // Upsert in batches instead of one query per chunk.
  // Previously: N sequential SQL round-trips (slow, risks Vercel timeout at scale).
  // Now: ceil(N / UPSERT_BATCH_SIZE) round-trips using a bulk VALUES insert.
  try {
    for (let batchStart = 0; batchStart < chunks.length; batchStart += UPSERT_BATCH_SIZE) {
      const batch = chunks.slice(batchStart, batchStart + UPSERT_BATCH_SIZE);

      // Build parameterized VALUES list: ($1,$2,...,$8), ($9,$10,...,$16), ...
      const params = [];
      const valueClauses = batch.map((c, i) => {
        const base = i * 8;
        params.push(
          c.id,
          c.entity_type,
          c.entity_id,
          c.customer_id ?? null,
          c.date ?? null,
          c.text,
          `[${data[batchStart + i].embedding.join(',')}]`,
          JSON.stringify(c.metadata ?? {}),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::vector, $${base + 8}::jsonb)`;
      });

      const queryStr = `
        INSERT INTO memory_chunks (id, entity_type, entity_id, customer_id, date, text, embedding, metadata)
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          text       = EXCLUDED.text,
          embedding  = EXCLUDED.embedding,
          metadata   = EXCLUDED.metadata,
          created_at = now()
      `;

      await sql.query(queryStr, params);
    }
  } catch (err) {
    console.error('[embeddings/upsert] SQL error:', err);
    return res.status(500).json({ error: 'Failed to persist chunks to vector store' });
  }

  return res.status(200).json({ upserted: chunks.length });
}

async function handleSearch(req, res) {
  const { query, limit = 15, filters = {} } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    // Embed the search query
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: [query],
      }),
    });

    if (!embedRes.ok) {
      const err = await embedRes.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || 'OpenAI embedding error' });
    }

    const { data } = await embedRes.json();
    const queryVector = `[${data[0].embedding.join(',')}]`;

    // Build dynamic SQL with optional WHERE conditions.
    // entity_types is expanded into individual $N params to avoid array nesting issues
    // with neon's HTTP transport.
    const params = [queryVector, limit];
    let paramIdx = 3;
    const conditions = [];

    if (filters.customer_id) {
      conditions.push(`customer_id = $${paramIdx++}`);
      params.push(filters.customer_id);
    }
    if (filters.entity_types && filters.entity_types.length > 0) {
      const placeholders = filters.entity_types.map(() => `$${paramIdx++}`).join(', ');
      conditions.push(`entity_type IN (${placeholders})`);
      params.push(...filters.entity_types);
    }
    if (filters.date_after) {
      conditions.push(`date >= $${paramIdx++}`);
      params.push(filters.date_after);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const queryStr = `
      SELECT
        id, entity_type, entity_id, customer_id, date, text, metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM memory_chunks
      WHERE 1=1
        ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    const chunks = await sql.query(queryStr, params);

    return res.status(200).json({ chunks });
  } catch (err) {
    console.error('[embeddings/search] error:', err);
    return res.status(500).json({ error: err.message || 'Vector search failed' });
  }
}
