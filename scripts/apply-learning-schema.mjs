import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { learningMigrationPath, learningSchemaStatus } from './learning-schema.mjs';
import { parseD1Output } from './wrangler-d1-output.mjs';

const args = process.argv.slice(2), target = args.find(a => a.startsWith('--target='))?.split('=')[1];
if (!['local', 'remote'].includes(target) || args.some(a => !['--target=local','--target=remote','--check','--apply'].includes(a)) ||
  args.includes('--check') && args.includes('--apply')) throw Error('Use --target=local|remote and --check (default) or --apply.');
const root = fileURLToPath(new URL('../', import.meta.url));
function execute(options) {
  const result = spawnSync(process.execPath, [path.join(root,'node_modules/wrangler/bin/wrangler.js'), 'd1','execute','redolve-db',
    '--'+target, ...options, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return parseD1Output(result.stdout);
}
let status = learningSchemaStatus(execute);
if (!status.missing.length) { console.log(`Learning schema ready (${target}); no writes.`); process.exit(0); }
console.log(`Missing or mismatched (${target}): ${status.missing.join(', ')}`);
if (!args.includes('--apply')) process.exit(1);
if (status.present) throw Error('Partial learning schema: no changes made. Inspect before retrying.');
const tables = execute(['--command', "SELECT name FROM sqlite_master WHERE name IN ('items','saved_refs','saved_snapshots','assets','asset_refs','share_asset_refs','asset_reference_inventory');"])[0].results;
if (tables.length !== 7) throw Error('Prerequisite sharing schema incomplete; no changes made.');
if (target === 'local') {
  const state = path.join(root,'.wrangler/state/v3/d1');
  if (existsSync(state)) {
    const backup = path.join(root,'.wrangler/local-db-backups/learning-'+new Date().toISOString().replace(/[:.]/g,'-'));
    mkdirSync(path.dirname(backup),{recursive:true}); cpSync(state,backup,{recursive:true}); console.log(`Backup: ${backup}`);
  }
} else {
  const result = spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','time-travel','info','redolve-db'],{cwd:root,encoding:'utf8'});
  if (result.status !== 0) throw Error('Cannot record remote recovery point; no changes made.');
  console.log(result.stdout);
}
execute(['--file',learningMigrationPath]);
status = learningSchemaStatus(execute);
if (status.missing.length) throw Error(`Incomplete schema: ${status.missing.join(', ')}`);
console.log(`Learning schema ready (${target}). Existing OCR backfill is a separate explicit operation.`);
