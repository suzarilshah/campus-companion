// Verifies the Neon connection in DATABASE_URL (read from the git-ignored .env) without printing secrets.
// Creates the campus_progress table if missing, then writes and deletes one throwaway row.
import { neon } from '@neondatabase/serverless';
import { NEON_SCHEMA } from '../server/progress.ts';
for (const file of ['../.env.local', '../.env']) { try { process.loadEnvFile(new URL(file, import.meta.url)); } catch { /* optional */ } }
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set. Run `neon link` (writes .env.local) or add it to .env — never commit or paste it in chat.'); process.exit(1); }
const host = (() => { try { return new URL(url).hostname.replace(/^[^.]+/, '***'); } catch { return 'unparseable URL'; } })();
const sql = neon(url);
const [{ version }] = await sql`select version()`;
await sql.query(NEON_SCHEMA);
const probe = `guest:verify-${Date.now()}-probe`;
await sql`insert into campus_progress (identity, award_key, exp) values (${probe}, 'verify:probe', 0)`;
const [{ count }] = await sql`select count(*)::int as count from campus_progress where identity = ${probe}`;
await sql`delete from campus_progress where identity = ${probe}`;
const [{ rows }] = await sql`select count(*)::int as rows from campus_progress`;
console.info(JSON.stringify({ host, postgres: version.split(' ').slice(0, 2).join(' '), table: 'campus_progress', probeWritten: count === 1, probeDeleted: true, existingRows: rows }, null, 2));
