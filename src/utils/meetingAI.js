/**
 * meetingAI.js
 * AI-powered meeting note structuring.
 */

const SYSTEM_PROMPT = `You are an assistant that structures meeting notes for a Solutions Engineer at a B2B SaaS company.
Extract and return ONLY a valid JSON object. No markdown. No explanation. No preamble.`;

/**
 * Generate a structured summary from raw meeting notes.
 *
 * @param {object} meetingEntry  Meeting entry with rawNotes, meetingDate, title?, attendees?
 * @param {string} anthropicApiKey
 * @returns {Promise<{aiSummary, decisions, openQuestions, actionItems, aiGeneratedAt, aiProvider} | null>}
 */
export async function generateMeetingSummary(meetingEntry, anthropicApiKey) {
  if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set.');
  if (!meetingEntry.rawNotes?.trim()) throw new Error('No notes to summarize.');

  const titleLine    = meetingEntry.title     ? `Meeting title: ${meetingEntry.title}\n`     : '';
  const attendeeLines = meetingEntry.attendees ? `Attendees: ${meetingEntry.attendees}\n`      : '';

  const userPrompt = `Meeting date: ${meetingEntry.meetingDate}
${titleLine}${attendeeLines}Raw notes:
${meetingEntry.rawNotes}

Return this exact JSON shape:
{
  "aiSummary": "2–4 sentence plain-English summary of what was discussed and the outcome",
  "decisions": ["Decision 1", "Decision 2"],
  "openQuestions": ["Unresolved question 1", "Unresolved question 2"],
  "actionItems": [
    { "id": "uuid", "text": "Action item description", "owner": "Name or null", "dueDate": "YYYY-MM-DD or null", "convertedToTaskId": null }
  ]
}

Rules:
- aiSummary must be readable as a standalone paragraph — no bullet points
- decisions: only include things that were explicitly agreed/decided, not just discussed
- openQuestions: things that were raised but not resolved; blockers; follow-ups needed
- actionItems: concrete next steps with a clear owner or implied owner ("Jolo", client name, or null)
- If a field has no data, return an empty array []
- Generate a unique short id (8 char alphanumeric) for each action item`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    return {
      aiSummary:      parsed.aiSummary      || '',
      decisions:      Array.isArray(parsed.decisions)      ? parsed.decisions      : [],
      openQuestions:  Array.isArray(parsed.openQuestions)  ? parsed.openQuestions  : [],
      actionItems:    Array.isArray(parsed.actionItems)    ? parsed.actionItems    : [],
      aiGeneratedAt:  new Date().toISOString(),
      aiProvider:     'anthropic',
    };
  } catch {
    // Try to extract JSON from response if it has stray wrapping
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          aiSummary:      parsed.aiSummary      || '',
          decisions:      Array.isArray(parsed.decisions)      ? parsed.decisions      : [],
          openQuestions:  Array.isArray(parsed.openQuestions)  ? parsed.openQuestions  : [],
          actionItems:    Array.isArray(parsed.actionItems)    ? parsed.actionItems    : [],
          aiGeneratedAt:  new Date().toISOString(),
          aiProvider:     'anthropic',
        };
      } catch { /* fall through */ }
    }
    return null;
  }
}
