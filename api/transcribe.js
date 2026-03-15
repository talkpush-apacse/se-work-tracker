/**
 * POST /api/transcribe
 * Proxies a multipart audio upload to OpenAI Whisper and returns { text }.
 * Keeps the OpenAI API key server-side — never exposed to the browser.
 */
import { authorize } from './_db.js';

export const config = {
  api: {
    bodyParser: false, // Stream raw multipart body to OpenAI
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  // Reject oversized uploads before buffering — OpenAI Whisper's hard limit is 25 MB
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength && contentLength > 25 * 1024 * 1024) {
    return res.status(413).json({ error: 'Audio file too large (max 25 MB)' });
  }

  try {
    // Buffer the raw multipart body and forward it verbatim to OpenAI.
    // Preserves the Content-Type (including multipart boundary) set by the browser.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': req.headers['content-type'],
      },
      body,
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('[POST /api/transcribe] OpenAI error:', data);
      return res.status(openaiRes.status).json({ error: data?.error?.message || 'Transcription failed' });
    }

    return res.status(200).json({ text: data.text });
  } catch (err) {
    console.error('[POST /api/transcribe]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
