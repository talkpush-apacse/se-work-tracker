/**
 * Client-side API wrapper for Neon persistence.
 * All requests include the bearer token from VITE_API_SECRET.
 */

const API_SECRET = import.meta.env.VITE_API_SECRET;

const headers = {
  'Content-Type': 'application/json',
  ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
};

/**
 * Fetch all entities from Neon in a single round-trip.
 * Returns { okrs: [...], customers: [...], ... } or null on failure.
 */
export async function fetchAllData() {
  try {
    const res = await fetch('/api/data', { headers });
    if (!res.ok) throw new Error(`GET /api/data → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[api] fetchAllData failed:', err.message);
    return null;
  }
}

/**
 * Save a single entity to Neon.
 * @param {string} entity - Entity name (e.g. 'tasks', 'projects')
 * @param {any} data - The full data array/object for this entity
 */
export async function saveEntity(entity, data) {
  try {
    const res = await fetch(`/api/data/${entity}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`PUT /api/data/${entity} → ${res.status}`);
    return true;
  } catch (err) {
    console.warn(`[api] saveEntity(${entity}) failed:`, err.message);
    return false;
  }
}

/**
 * Seed all entities to Neon (one-time migration from localStorage).
 * @param {object} allData - { okrs: [...], customers: [...], ... }
 */
export async function seedAllData(allData) {
  try {
    const res = await fetch('/api/seed', {
      method: 'POST',
      headers,
      body: JSON.stringify(allData),
    });
    if (!res.ok) throw new Error(`POST /api/seed → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[api] seedAllData failed:', err.message);
    return null;
  }
}
