/**
 * ragSearch.js
 * RAG (Retrieval-Augmented Generation) search over the vector memory store.
 * Replaces aiMemorySearch — retrieves relevant chunks via pgvector, then
 * synthesizes an answer with Claude using only those chunks as context.
 */

import { RAG_SYSTEM_PROMPT } from '../constants';

/**
 * @param {string} query              Natural language question
 * @param {object} filters            Optional: { customer_id, entity_types, date_after }
 * @param {string} apiSecret          VITE_API_SECRET for /api/embeddings
 * @param {string} anthropicApiKey    VITE_ANTHROPIC_API_KEY for Claude synthesis
 * @returns {Promise<{ answer: string|null, chunks: object[], query: string, error?: string }>}
 */
export async function ragSearch(query, filters, apiSecret, anthropicApiKey) {
  try {
    // ── Step 1: Retrieve relevant chunks via vector similarity ────────────────
    const searchRes = await fetch('/api/embeddings?op=search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSecret}`,
      },
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

    // ── Step 2: Synthesize answer with Claude ─────────────────────────────────
    const contextBlock = chunks
      .map((c, i) =>
        `[${i + 1}] ${c.metadata?.label ?? 'Entry'} | ${c.metadata?.customerName ?? 'No customer'} | ${c.date ?? 'Unknown date'}\n${c.text}`
      )
      .join('\n\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: RAG_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Query: "${query}"\n\nContext from work log:\n\n${contextBlock}\n\nAnswer the query based on the context above.`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error (${claudeRes.status})`);
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? null;

    return { answer, chunks, query };
  } catch (err) {
    return { answer: null, chunks: [], query, error: err.message };
  }
}
