/**
 * chunker.js
 * Splits MemoryEntry objects into text chunks ready for embedding.
 * Chunk IDs are deterministic: {entityType}_{entityId}_{chunkIndex}
 * so upserts are always idempotent.
 */

function buildChunks(entry) {
  const baseChunk = {
    entity_type: entry.entityType,
    entity_id: entry.id,
    customer_id: entry.customerId ?? null,
    date: entry.date ? entry.date.slice(0, 10) : null,
    metadata: {
      customerName: entry.customerName ?? null,
      label: entry.label ?? null,
      subtext: entry.subtext ?? null,
    },
  };

  const fullText = [entry.text, entry.subtext, entry.customerName, entry.label]
    .filter(Boolean)
    .join(' | ');

  const chunks = [];

  if (fullText.length <= 800) {
    // Single chunk
    chunks.push({
      ...baseChunk,
      id: `${entry.entityType}_${entry.id}_0`,
      text: fullText,
    });
  } else {
    // Split into overlapping word-based chunks (~600 chars, ~100 char overlap)
    const words = fullText.split(' ');
    let chunkIndex = 0;
    let i = 0;

    while (i < words.length) {
      const slice = words.slice(i, i + 100).join(' '); // ~100 words ≈ 600 chars
      chunks.push({
        ...baseChunk,
        id: `${entry.entityType}_${entry.id}_${chunkIndex}`,
        text: slice,
      });
      i += 85; // 15-word overlap
      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * Convert an array of MemoryEntry objects to embedding-ready chunk objects.
 * @param {MemoryEntry[]} entries
 * @returns {object[]}
 */
export function chunkMemoryEntries(entries) {
  const chunks = [];
  for (const entry of entries) {
    if (!entry.text && !entry.subtext) continue; // skip empty entries
    chunks.push(...buildChunks(entry));
  }
  return chunks;
}

/**
 * Convert a single MemoryEntry to chunks — used when re-embedding after a save.
 * @param {MemoryEntry} entry
 * @returns {object[]}
 */
export function chunkSingleEntry(entry) {
  if (!entry.text && !entry.subtext) return [];
  return buildChunks(entry);
}
