/**
 * memorySearch.js
 * AI-powered semantic search over the memory index.
 */

/**
 * @param {string} query
 * @param {MemoryEntry[]} entries  Full (already-filtered) memory index
 * @param {string} anthropicApiKey
 * @returns {Promise<{ rankedEntries: MemoryEntry[], reasons: Record<string, string> }>}
 */
export async function aiMemorySearch(query, entries, anthropicApiKey) {
  if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set.');

  // Build a compact index
  const index = entries.map(e => ({
    id: e.id,
    t: e.entityType,
    d: e.date ? e.date.slice(0, 10) : null,
    c: e.customerName,
    x: e.text.slice(0, 120),
  }));

  const CHUNK_LIMIT = 60000;
  const fullJson = JSON.stringify(index);

  let allResults = [];

  if (fullJson.length <= 80000) {
    // Single request
    allResults = await runBatch(query, index, anthropicApiKey);
  } else {
    // Chunk into batches of ~60k chars each
    const batches = [];
    let current = [];
    let currentLen = 0;

    for (const item of index) {
      const itemStr = JSON.stringify(item);
      if (currentLen + itemStr.length > CHUNK_LIMIT && current.length > 0) {
        batches.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(item);
      currentLen += itemStr.length;
    }
    if (current.length > 0) batches.push(current);

    const batchResults = await Promise.all(
      batches.map(batch => runBatch(query, batch, anthropicApiKey))
    );

    // Merge and deduplicate — keep highest score per id
    const scoreMap = new Map();
    for (const batch of batchResults) {
      for (const r of batch) {
        const existing = scoreMap.get(r.id);
        if (!existing || r.score > existing.score) {
          scoreMap.set(r.id, r);
        }
      }
    }
    allResults = Array.from(scoreMap.values());
  }

  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);

  // Build reasons map
  const reasons = {};
  const scoredIds = new Set();
  for (const r of allResults) {
    reasons[r.id] = r.reason || '';
    scoredIds.add(r.id);
  }

  // Re-order entries: scored first (in score order), then unscored in original order
  const scoreById = new Map(allResults.map(r => [r.id, r.score]));
  const scored = allResults
    .map(r => entries.find(e => e.id === r.id))
    .filter(Boolean);
  const unscored = entries.filter(e => !scoredIds.has(e.id));

  return {
    rankedEntries: [...scored, ...unscored],
    reasons,
  };
}

async function runBatch(query, indexBatch, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'You are a semantic search engine for a personal work log. Return ONLY a valid JSON array. No markdown, no explanation, no preamble.',
      messages: [{
        role: 'user',
        content: `Query: "${query}"\n\nEntries:\n${JSON.stringify(indexBatch)}\n\nReturn: [{id, score, reason}] where score is 0.0–1.0. Omit entries scoring below 0.25. Sort descending by score.`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to extract JSON array from the text in case of stray whitespace/wrapping
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return [];
  }
}
