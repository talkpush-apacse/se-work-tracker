import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const sql = neon(process.env.DATABASE_URL);
const data = JSON.parse(readFileSync(process.env.HOME + '/Downloads/recovered-data.json', 'utf8'));

for (const [entity, items] of Object.entries(data)) {
  if (!items || (Array.isArray(items) && items.length === 0)) continue;

  await sql`
    INSERT INTO app_data (entity_name, data, updated_at)
    VALUES (${entity}, ${JSON.stringify(items)}::jsonb, now())
    ON CONFLICT (entity_name) DO UPDATE
      SET data = ${JSON.stringify(items)}::jsonb, updated_at = now()
  `;
  const count = Array.isArray(items) ? items.length : 1;
  console.log('Pushed', entity, ':', count, 'items');
}

const rows = await sql`SELECT entity_name,
  CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_array_length(data) ELSE -1 END as count
  FROM app_data ORDER BY entity_name`;
console.log('\nNeon state:');
console.table(rows);
