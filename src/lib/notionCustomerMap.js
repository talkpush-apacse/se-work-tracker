/**
 * Helpers for the Notion Account → SE Tracker Customer mapping.
 * Stored in localStorage under 'gpt-notion-customer-map'.
 * Shape: { "Alorica PH": "customer-uuid", "TaskUs": "customer-uuid2", ... }
 *
 * Rollback: remove the 'gpt-notion-customer-map' key from localStorage.
 */

const STORAGE_KEY = 'gpt-notion-customer-map';

/** Read the full mapping object from localStorage. Returns {} on failure. */
export function getNotionCustomerMapping() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist a single Notion Account name → SE Tracker customerId mapping.
 * @param {string} notionAccount - e.g. "Alorica PH"
 * @param {string} customerId    - the SE Tracker customer UUID
 */
export function saveNotionCustomerMapping(notionAccount, customerId) {
  if (!notionAccount || !customerId) return;
  try {
    const current = getNotionCustomerMapping();
    current[notionAccount] = customerId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // localStorage unavailable — non-critical
  }
}

/**
 * Resolve a Notion Account name to a SE Tracker customerId.
 * Returns the mapped customerId string, or null if not yet mapped.
 * @param {string|null} notionAccount
 * @returns {string|null}
 */
export function resolveNotionAccount(notionAccount) {
  if (!notionAccount) return null;
  const map = getNotionCustomerMapping();
  return map[notionAccount] ?? null;
}

/**
 * Match a Notion OKR string against the app's OKR list using case-insensitive
 * substring matching (either string contains the other). Returns the first
 * matching okrId, or null if no match or no OKR was set on the Notion task.
 *
 * @param {string|null} notionOkr - raw Notion OKR property value (e.g. "Drive Client Adoption")
 * @param {Array<{id: string, title: string}>} okrs - app OKR list from store
 * @returns {string|null}
 */
export function resolveNotionOkr(notionOkr, okrs) {
  if (!notionOkr || !Array.isArray(okrs) || okrs.length === 0) return null;
  const needle = notionOkr.toLowerCase().trim();
  const match = okrs.find(okr => {
    const hay = (okr.title || '').toLowerCase().trim();
    return hay.includes(needle) || needle.includes(hay);
  });
  return match?.id ?? null;
}
