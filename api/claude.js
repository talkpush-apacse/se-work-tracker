/**
 * POST /api/claude — Generic server-side Claude proxy.
 *
 * All client-side Anthropic calls route through here so ANTHROPIC_API_KEY
 * never appears in the browser bundle.
 *
 * Body: {
 *   model?:      string   (defaults to claude-sonnet-4-6)
 *   system?:     string
 *   messages:    { role: 'user' | 'assistant', content: string }[]
 *   max_tokens?: number   (defaults to 1024)
 * }
 * Returns: { text: string }
 */
import { authorize } from './_db.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { model, system, messages, max_tokens } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[POST /api/claude] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY configuration' });
  }

  try {
    const body = {
      model:      model      || DEFAULT_MODEL,
      max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
      messages,
    };
    if (system) body.system = system;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      const message = err.error?.message || `Claude API error (${claudeRes.status})`;
      console.error('[POST /api/claude] Claude error:', message);
      return res.status(502).json({ error: message });
    }

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text ?? '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[POST /api/claude]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
