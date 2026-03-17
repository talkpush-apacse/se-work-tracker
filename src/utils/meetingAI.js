/**
 * meetingAI.js
 * AI-powered meeting note structuring.
 * Uses callClaude() — API key stays server-side via /api/claude proxy.
 */

import { callClaude } from '../lib/api';

const SYSTEM_PROMPT = `You are an assistant that structures meeting notes for a Solutions Engineer at a B2B SaaS company.
Extract and return ONLY a valid JSON object. No markdown. No explanation. No preamble.`;

/**
 * Generate a structured summary from raw meeting notes.
 *
 * @param {object} meetingEntry  Meeting entry with rawNotes, meetingDate, title?, attendees?
 * @param {string} [model]       Optional Claude model override (from aiSettings.claudeModel)
 * @returns {Promise<{aiSummary, decisions, openQuestions, actionItems, aiGeneratedAt, aiProvider} | null>}
 */
export async function generateMeetingSummary(meetingEntry, model) {
  if (!meetingEntry.rawNotes?.trim()) throw new Error('No notes to summarize.');

  const titleLine     = meetingEntry.title     ? `Meeting title: ${meetingEntry.title}\n`  : '';
  const attendeeLines = meetingEntry.attendees ? `Attendees: ${meetingEntry.attendees}\n`   : '';

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

  const text = await callClaude({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 1500,
  });

  try {
    const parsed = JSON.parse(text);
    return {
      aiSummary:     parsed.aiSummary                              || '',
      decisions:     Array.isArray(parsed.decisions)     ? parsed.decisions     : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
      actionItems:   Array.isArray(parsed.actionItems)   ? parsed.actionItems   : [],
      aiGeneratedAt: new Date().toISOString(),
      aiProvider:    'anthropic',
    };
  } catch {
    // Try to extract JSON from response if it has stray wrapping text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          aiSummary:     parsed.aiSummary                              || '',
          decisions:     Array.isArray(parsed.decisions)     ? parsed.decisions     : [],
          openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
          actionItems:   Array.isArray(parsed.actionItems)   ? parsed.actionItems   : [],
          aiGeneratedAt: new Date().toISOString(),
          aiProvider:    'anthropic',
        };
      } catch { /* fall through */ }
    }
    return null;
  }
}
