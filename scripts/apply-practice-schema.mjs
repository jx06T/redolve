import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { learningSchemaStatus } from './learning-schema.mjs';
import { practiceMigrations, practiceSchemaStatus } from './practice-schema.mjs';
const args = process.argv.slice(2), target = args.find(a => a.startsWith('--target='))?.split('=')[1];
if (!['local','remote'].includes(target) || args.some(a => !['--target=local','--target=remote','--check','--apply'].includes(a)) || args.includes('--check') && args.includes('--apply')) throw Error('Use --target=local|remote and --check (default) or --apply');
const root = fileURLToPath(new URL('../', import.meta.url)), cli = path.join(root,'node_modules/wrangler/bin/wrangler.js');
function execute(options) {
  const result = spawnSync(process.execPath,[cli,'d1','execute','redolve-db','--'+target,...options,'--json'], { cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'] });
  if (result.error) throw result.error; if (result.status !== 0) throw Error(result.stderr || result.stdout);
  const data = JSON.parse(result.stdout); if (data.some(d => !d.success)) throw Error('D1 query failed'); return data;
}
if (learningSchemaStatus(execute).missing.length) throw Error('Apply and verify 0014 first; no changes made.');
const stages = practiceMigrations.map(file => ({ file, ...practiceSchemaStatus(execute,file) }));
const pending = stages.filter(s => s.missing.length); console.log({ target, pending });
if (!pending.length) process.exit(0);
if (!args.includes('--apply')) process.exit(1);
if (pending.some(s => s.present)) throw Error('Partial/mismatched schema; no changes made.');
if (target === 'local') {
  const source = path.join(root,'.wrangler/state/v3/d1');
  if (existsSync(source)) { const backup = path.join(root,'.wrangler/local-db-backups/practice-'+new Date().toISOString().replace(/[:.]/g,'-')); mkdirSync(path.dirname(backup),{recursive:true}); cpSync(source,backup,{recursive:true}); console.log({ backup }); }
} else {
  const result = spawnSync(process.execPath,[cli,'d1','time-travel','info','redolve-db'],{cwd:root,encoding:'utf8'});
  if (result.status !== 0) throw Error('Cannot record recovery point; no changes made.'); console.log(result.stdout);
}
for (const stage of pending) { execute(['--file',stage.file]); if (practiceSchemaStatus(execute,stage.file).missing.length) throw Error('Schema verification failed: '+stage.file); }
console.log('Practice and analysis schema ready. Feature flags remain unchanged.');
