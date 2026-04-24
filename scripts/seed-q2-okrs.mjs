/**
 * One-time seed: Q2 2026 OKRs + key results.
 *
 * Idempotent — appends any OKR (by title + quarter) that doesn't already exist
 * to the `okrs` JSONB entity in app_data. For existing OKRs, appends any KRs
 * that don't already exist (by title match). Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-q2-okrs.mjs
 */
import { randomUUID } from 'crypto';
import { sql } from '../api/_db.js';

const QUARTER = 'Q2 2026';

const SEED = [
  {
    title: 'AI Bot for Alfamart',
    keyResults: [
      { title: 'Launch the Tagalog AI Bot in Live Environment', accountName: 'Alfamart - PH' },
    ],
  },
  {
    title: 'AI-Assisted Configurations to Speed Up Implementation Time by 50%',
    keyResults: [
      { title: 'Use agentic configuration for EXL/TaskUs to save 1-2 hours for configurations (Attributes, Campaigns, Folders)', accountName: 'EXL, TaskUs' },
      { title: 'Deploy an AI-connected UAT tool to save 45-60 minutes of time per UAT checklist', accountName: null },
    ],
  },
  {
    title: 'Drive Client Adoption of Talkpush Features',
    keyResults: [
      { title: 'Increase AI Interview usage for EXL, Accenture and Afni', accountName: 'EXL, Accenture, Afni' },
      { title: 'Get 1000 completed AI interviews for this quarter, with at least 50% completion rates', accountName: 'EXL, Accenture, Afni' },
      { title: '1 Client using the Onboarding Module', accountName: null },
    ],
  },
  {
    title: 'Implement Projects for Expanding Use Case of Talkpush',
    keyResults: [
      { title: 'TaskUs PH Onboarding Go Live', accountName: 'TaskUs - PH' },
      { title: 'TaskUs PH Identity Verification Process (IDV) Go Live', accountName: 'TaskUs - PH' },
      { title: 'TaskUs India Onboarding Go Live', accountName: 'TaskUs - IN' },
      { title: 'TaskUs India Identity Verification Process (IDV) Go Live', accountName: 'TaskUs - IN' },
      { title: 'Alorica PH Queue Management System Go Live', accountName: 'Alorica - PH' },
      { title: 'Afni PH Interview Pass to Complement AI Pilot', accountName: 'Afni' },
      { title: 'Concentrix PH Onboarding - Connect to Project Odyssey', accountName: 'Concentrix PH' },
      { title: 'McDonalds HR MyPal Project', accountName: 'McDonalds - PH' },
    ],
  },
  {
    title: 'Inspiro PH: Help Renew and Expand to Egypt',
    keyResults: [
      { title: 'Renewal of Inspiro to secure 100% ARR', accountName: 'Inspiro PH' },
      { title: 'Start implementations for Inspiro Egypt', accountName: 'Inspiro Egypt' },
    ],
  },
];

function buildKr(seed, sortOrder) {
  return {
    id:          randomUUID(),
    text:        seed.title,
    type:        'numeric',
    value:       null,
    accountName: seed.accountName ?? null,
    status:      'not_started',
    sortOrder,
  };
}

function buildOkr(seed, sortOrder) {
  return {
    id:          randomUUID(),
    title:       seed.title,
    quarter:     QUARTER,
    description: '',
    sortOrder,
    keyResults:  seed.keyResults.map((kr, i) => buildKr(kr, i + 1)),
    createdAt:   new Date().toISOString(),
  };
}

async function main() {
  const rows = await sql`SELECT data FROM app_data WHERE entity_name = 'okrs'`;
  const okrs = Array.isArray(rows[0]?.data) ? [...rows[0].data] : [];

  const existingByTitle = new Map(
    okrs
      .filter(o => o.quarter === QUARTER)
      .map(o => [o.title, o]),
  );

  const maxOkrSort = okrs
    .filter(o => o.quarter === QUARTER)
    .reduce((m, o) => Math.max(m, o.sortOrder ?? 0), 0);

  let addedOkrs = 0;
  let addedKrs = 0;
  let nextOkrSort = maxOkrSort;

  for (const seed of SEED) {
    const existing = existingByTitle.get(seed.title);
    if (!existing) {
      nextOkrSort += 1;
      const newOkr = buildOkr(seed, nextOkrSort);
      okrs.push(newOkr);
      addedOkrs += 1;
      addedKrs += newOkr.keyResults.length;
      console.log(`  + OKR  "${seed.title}" (${newOkr.keyResults.length} KRs)`);
      continue;
    }

    // OKR already exists — check for missing KRs by title.
    const existingKrTitles = new Set((existing.keyResults || []).map(k => (k.text ?? '').trim()));
    const maxKrSort = (existing.keyResults || []).reduce(
      (m, k) => Math.max(m, k.sortOrder ?? 0),
      0,
    );
    let nextKrSort = maxKrSort;
    const newKrs = [];
    for (const krSeed of seed.keyResults) {
      if (existingKrTitles.has(krSeed.title.trim())) continue;
      nextKrSort += 1;
      newKrs.push(buildKr(krSeed, nextKrSort));
    }
    if (newKrs.length > 0) {
      existing.keyResults = [...(existing.keyResults || []), ...newKrs];
      addedKrs += newKrs.length;
      console.log(`  ~ OKR  "${seed.title}" (+${newKrs.length} KRs)`);
    } else {
      console.log(`  = OKR  "${seed.title}" (no changes)`);
    }
  }

  if (addedOkrs === 0 && addedKrs === 0) {
    console.log('\nNothing to seed — all Q2 2026 OKRs and KRs already present.');
    return;
  }

  await sql`
    INSERT INTO app_data (entity_name, data, updated_at)
    VALUES ('okrs', ${JSON.stringify(okrs)}::jsonb, now())
    ON CONFLICT (entity_name) DO UPDATE
      SET data       = ${JSON.stringify(okrs)}::jsonb,
          updated_at = now()
  `;

  console.log(`\nSeeded ${addedOkrs} OKR(s) and ${addedKrs} KR(s) for ${QUARTER}.`);
}

main().catch(err => {
  console.error('[seed-q2-okrs] FAILED:', err);
  process.exit(1);
});
