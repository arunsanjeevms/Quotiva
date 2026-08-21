import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const projectRef = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!projectRef || !token) {
  console.error('Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN env vars.');
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(path.join(dir, file), 'utf8');
  console.log(`\n--- ${file} ---`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAILED (${res.status}): ${file}`);
    console.error(text);
    process.exitCode = 1;
    break;
  }
  console.log(`OK: ${file}`);
}

if (process.exitCode !== 1) console.log('\nAll migrations applied successfully.');
