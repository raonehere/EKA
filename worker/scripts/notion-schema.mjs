// Prints the columns of the Notion bookings database (name, type, select options).
// Reads NOTION_TOKEN and NOTION_DB_ID from worker/.dev.vars. Run from worker/: node scripts/notion-schema.mjs
import { readFileSync } from 'node:fs';

const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const res = await fetch(`https://api.notion.com/v1/databases/${vars.NOTION_DB_ID.replace(/-/g, "")}`, {
  headers: { Authorization: `Bearer ${vars.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
});
const db = await res.json();
if (!res.ok) { console.error(`Notion error ${res.status}: ${db.message}`); process.exit(1); }

console.log(`Database: ${db.title.map(t => t.plain_text).join('')}\n`);
for (const [name, p] of Object.entries(db.properties)) {
  const opts = p[p.type]?.options?.map(o => o.name).join(' | ');
  console.log(`${name.padEnd(28)} ${p.type}${opts ? `  [${opts}]` : ''}`);
}
