/**
 * Shared Neon client + auth helper for all API routes.
 * Underscore prefix (_db.js) tells Vercel this is NOT a route.
 */
import { neon } from '@neondatabase/serverless';

// Guard: fail fast with a clear message rather than a cryptic neon error at query time
if (!process.env.DATABASE_URL) {
  throw new Error('[_db] DATABASE_URL is not set. Add it to your Vercel environment variables.');
}

export const sql = neon(process.env.DATABASE_URL);

/**
 * Validate bearer token from Authorization header.
 * Returns true if the request is authorized.
 */
export function authorize(req) {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '');
  return token === process.env.API_SECRET;
}
