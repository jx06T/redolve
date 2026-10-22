import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { learningSchemaStatus } from './learning-schema.mjs';
import { learningBackfillSql } from './learning-backfill-sql.mjs';

const args = process.argv.slice(2), target = args.find(a => a.startsWith('--target='))?.split('=')[1];
if (!['local','remote'].includes(target) || args.some(a => !['--target=local','--target=remote','--check','--apply'].includes(a)) ||
  args.includes('--check') && args.includes('--apply')) throw Error('Use --target=local|remote with --check (default) or --apply. One batch per invocation.');
const root = fileURLToPath(new URL('../', import.meta.url));
function execute(options) {
  const r=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','redolve-db','--'+target,...options,'--json'],
    {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);if(data.some(d=>!d.success))throw Error('D1 query failed');return data;
}
if(learningSchemaStatus(execute).missing.length)throw Error('Apply and verify 0014 first.');
const state=execute(['--command','SELECT last_rowid,completed FROM learning_backfill WHERE id=1;'])[0].results[0];
console.log({target,...state});
if(!args.includes('--apply')||state.completed)process.exit(0);
const rows=execute(['--command',`SELECT rowid FROM items_fts WHERE rowid>${Number(state.last_rowid)} ORDER BY rowid LIMIT 250;`])[0].results;
if(!rows.length){execute(['--command','UPDATE learning_backfill SET completed=1 WHERE id=1;']);console.log('Legacy OCR backfill complete.');process.exit(0);}
const end=Number(rows.at(-1).rowid),start=Number(state.last_rowid);
// Replaying an interrupted batch is safe. Live writes always win over legacy text.
execute(['--command',learningBackfillSql(start,end)]);
execute(['--command',`UPDATE learning_backfill SET last_rowid=${end} WHERE id=1 AND last_rowid=${start};`]);
console.log(`Processed up to FTS rowid ${end}. Repeat --apply until complete; no AI calls.`);
