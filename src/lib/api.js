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
    // 5-second timeout via AbortController — prevents indefinite hang on slow/hung Neon connections
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/data', { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`GET /api/data → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[api] fetchAllData failed:', err.message);
    return null;
  }
}

/**
 * Sync all OKRs from the Notion OKR Tracker database.
 * Returns an array of OKR objects (Notion page IDs used as OKR IDs) or throws on failure.
 */
export async function syncNotionOkrs() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('/api/notion/okrs', { headers, signal: controller.signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `GET /api/notion/okrs → ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.okrs) ? data.okrs : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch active Notion tasks through the server-side proxy route.
 * Returns an array of task objects or throws on failure.
 */
export async function fetchNotionTasks({ force = false } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const url = force ? '/api/notion/tasks?force=1' : '/api/notion/tasks';

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `GET /api/notion/tasks → ${res.status}`);
    }

    const data = await res.json();
    return Array.isArray(data.tasks) ? data.tasks : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Save a single entity to Neon.
 * @param {string} entity - Entity name (e.g. 'tasks', 'projects')
 * @param {any} data - The full data array/object for this entity
 * @param {{ keepalive?: boolean }} options - keepalive: true lets the request complete after page unload
 */
export async function saveEntity(entity, data, { keepalive = false } = {}) {
  try {
    const res = await fetch(`/api/data/${entity}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ data }),
      ...(keepalive ? { keepalive: true } : {}),
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

/**
 * Upload a file to Vercel Blob via the serverless function.
 * Uses XMLHttpRequest (not fetch) because XHR supports upload progress events.
 * @param {File} file - The File object from an <input> or drag event
 * @param {function} onProgress - Optional callback(percent) for progress tracking
 * @returns {{ url: string, pathname: string } | null}
 */
export async function uploadFile(file, onProgress) {
  try {
    const xhr = new XMLHttpRequest();
    const url = `/api/upload?filename=${encodeURIComponent(file.name)}`;

    return await new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));

      xhr.open('POST', url);
      if (API_SECRET) xhr.setRequestHeader('Authorization', `Bearer ${API_SECRET}`);
      xhr.send(file);
    });
  } catch (err) {
    console.warn('[api] uploadFile failed:', err.message);
    return null;
  }
}

/**
 * Call the server-side Claude proxy.
 * Replaces all direct `fetch('https://api.anthropic.com/v1/messages')` calls
 * so ANTHROPIC_API_KEY is never bundled into the browser build.
 *
 * @param {{ model?: string, system?: string, messages: object[], max_tokens?: number }} params
 * @returns {Promise<string>} The text from Claude's first response block
 * @throws {Error} On API or network failure — caller is responsible for try/catch
 */
export async function callClaude({ model, system, messages, max_tokens }) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, system, messages, max_tokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Claude API error (${res.status})`);
  }
  const data = await res.json();
  return data.text ?? '';
}

/**
 * Call the server-side OpenAI proxy.
 * Replaces all direct `fetch('https://api.openai.com/v1/chat/completions')` calls
 * so OPENAI_API_KEY is never bundled into the browser build.
 *
 * @param {{ model?: string, system?: string, messages: object[], max_tokens?: number, temperature?: number }} params
 * @returns {Promise<string>} The text from OpenAI's first response choice
 * @throws {Error} On API or network failure — caller is responsible for try/catch
 */
export async function callOpenAI({ model, system, messages, max_tokens, temperature }) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, system, messages, max_tokens, temperature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OpenAI API error (${res.status})`);
  }
  const data = await res.json();
  return data.text ?? '';
}

/**
 * Delete a file from Vercel Blob.
 * @param {string} blobUrl - The full Blob URL to delete
 * @returns {boolean} true on success
 */
export async function deleteFile(blobUrl) {
  try {
    const res = await fetch('/api/upload', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ url: blobUrl }),
    });
    if (!res.ok) throw new Error(`DELETE /api/upload → ${res.status}`);
    return true;
  } catch (err) {
    console.warn('[api] deleteFile failed:', err.message);
    return false;
  }
}
