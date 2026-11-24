// Existing release sweep, with a disposable real journey store. Never a live credential.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startDisposablePg } from '../../server/scripts/fixtures/disposable-pg.mjs';
const cluster = await startDisposablePg();
const db = new pg.Pool({ connectionString: cluster.url });
try {
  const sql=readFileSync(new URL('../../supabase/migrations/0014_commerce_journey.sql',import.meta.url),'utf8');
  await db.query(sql.match(/create table if not exists [^;]+;/is)[0]);
  await db.query(readFileSync(new URL('../../supabase/migrations/0024_journey_traffic.sql',import.meta.url),'utf8'));
} catch(error) { await db.end(); await cluster.stop(); throw error; }
await db.end();
const child=spawn(process.execPath,['server/index.js'],{stdio:'inherit',env:{...process.env,SDS_PRIVATE_PREVIEW:'1',SDS_CARE_DATABASE_URL:cluster.url,SDS_CARE_SCHEMA:'public'}});
let closing=false;
async function close(signal) {
  if(closing)return;closing=true;
  if(child.exitCode===null) { child.kill(signal); await new Promise(resolve=>child.once('exit',resolve)); }
  await cluster.stop();process.exit(0);
}
process.once('SIGTERM',()=>void close('SIGTERM'));process.once('SIGINT',()=>void close('SIGINT'));
child.once('exit',async code=>{if(!closing){closing=true;await cluster.stop();process.exit(code??1);}});
