/**
 * File upload/delete endpoint using Vercel Blob Storage.
 * POST /api/upload?filename=photo.png  → streams file to Blob, returns { url, pathname }
 * DELETE /api/upload                   → removes a blob by URL from { url } body
 */
import { put, del } from '@vercel/blob';
import { authorize } from './_db.js';

export const config = {
  api: {
    bodyParser: false, // Required — stream raw file bytes to Blob
  },
};

export default async function handler(req, res) {
  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── UPLOAD ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const raw = req.query.filename;
    if (!raw) {
      return res.status(400).json({ error: 'Missing filename query parameter' });
    }

    // Sanitize filename: keep only safe characters, limit length
    const filename = raw.replace(/[^\w.\-]/g, '_').slice(0, 200);

    // Validate extension
    const ALLOWED_EXT = new Set(['png','jpg','jpeg','gif','webp','svg','pdf','doc','docx','xls','xlsx','txt','csv']);
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    // Validate size via Content-Length header
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength && contentLength > 4.5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 4.5 MB)' });
    }

    try {
      const blob = await put(filename, req, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return res.status(200).json({
        url: blob.url,
        pathname: blob.pathname,
      });
    } catch (err) {
      console.error('[POST /api/upload]', err);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }

  // ── DELETE ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const { url } = body;
      if (!url || typeof url !== 'string' || !url.includes('.public.blob.vercel-storage.com/')) {
        return res.status(400).json({ error: 'Invalid or missing blob URL' });
      }

      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/upload]', err);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
