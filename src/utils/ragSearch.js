/**
 * ragSearch.js
 * RAG (Retrieval-Augmented Generation) search over the vector memory store.
 * Replaces aiMemorySearch — retrieves relevant chunks via pgvector, then
 * synthesizes an answer via /api/openai (server-side — OPENAI_API_KEY never
 * leaves the server).
 */

import { RAG_SYSTEM_PROMPT } from '../constants';

/**
 * @param {string} query              Natural language question
 * @param {object} filters            Optional: { customer_id, entity_types, date_after }
 * @param {string} apiSecret          VITE_API_SECRET for /api/embeddings + /api/openai
 * @param {object} [options]          Optional: { model }
 * @param {string} [options.model]    OpenAI model override
 * @returns {Promise<{ answer: string|null, chunks: object[], query: string, error?: string }>}
 */
export async function ragSearch(query, filters, apiSecret, options = {}) {
  const { model } = options;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiSecret}`,
  };

  try {
    // ── Step 1: Retrieve relevant chunks via vector similarity ────────────────
    const searchRes = await fetch('/api/embeddings?op=search', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ query, limit: 15, filters }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}));
      throw new Error(err.error || `Embedding search failed (${searchRes.status})`);
    }

    const { chunks } = await searchRes.json();

    if (!chunks || chunks.length === 0) {
      return { answer: null, chunks: [], query };
    }

    // ── Step 2: Synthesize answer via server-side OpenAI proxy ────────────────
    const contextBlock = chunks
      .map((c, i) =>
        `[${i + 1}] ${c.metadata?.label ?? 'Entry'} | ${c.metadata?.customerName ?? 'No customer'} | ${c.date ?? 'Unknown date'}\n${c.text}`
      )
      .join('\n\n');

    const synthesisRes = await fetch('/api/openai', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: RAG_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Query: "${query}"\n\nContext from work log:\n\n${contextBlock}\n\nAnswer the query based on the context above.`,
        }],
      }),
    });

    if (!synthesisRes.ok) {
      const err = await synthesisRes.json().catch(() => ({}));
      throw new Error(err.error || `Synthesis failed (${synthesisRes.status})`);
    }

    const { text: answer } = await synthesisRes.json();

    return { answer, chunks, query };
  } catch (err) {
    return { answer: null, chunks: [], query, error: err.message };
  }
}
