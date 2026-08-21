import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log(`Connected. Applying ${files.length} migration(s) from ${dir}`);

for (const file of files) {
  const sql = readFileSync(path.join(dir, file), 'utf8');
  console.log(`\n--- ${file} ---`);
  try {
    await client.query(sql);
    console.log(`OK: ${file}`);
  } catch (err) {
    console.error(`FAILED: ${file}`);
    console.error(err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\nAll migrations applied successfully.');
