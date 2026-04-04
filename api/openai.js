/**
 * POST /api/openai — Generic server-side OpenAI proxy.
 *
 * All client-side OpenAI calls route through here so OPENAI_API_KEY
 * never appears in the browser bundle.
 *
 * Body: {
 *   model?:      string   (defaults to gpt-4o)
 *   system?:     string
 *   messages:    { role: 'user' | 'assistant', content: string }[]
 *   max_tokens?: number   (defaults to 1024)
 *   temperature?: number  (defaults to 0.7)
 * }
 * Returns: { text: string }
 */
import { authorize } from './_db.js';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { model, system, messages, max_tokens, temperature } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('[POST /api/openai] OPENAI_API_KEY is not set');
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY configuration' });
  }

  try {
    const openaiMessages = [];
    if (system) {
      openaiMessages.push({ role: 'system', content: system });
    }
    openaiMessages.push(...messages);

    const body = {
      model:       model       || DEFAULT_MODEL,
      max_tokens:  max_tokens  || DEFAULT_MAX_TOKENS,
      temperature: temperature ?? DEFAULT_TEMPERATURE,
      messages:    openaiMessages,
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}));
      const message = err.error?.message || `OpenAI API error (${openaiRes.status})`;
      console.error('[POST /api/openai] OpenAI error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await openaiRes.json();
    const text = data.choices?.[0]?.message?.content ?? '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[POST /api/openai]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
