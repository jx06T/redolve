import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
if (args.some(arg => arg !== '--check')) throw new Error('Only --check is supported. This script always uses local D1.');
const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const statePath = path.join(root, '.wrangler/state');

function execute(options) {
  const result = spawnSync(process.execPath, [cli, 'd1', 'execute', 'redolve-db', '--local', '--persist-to', statePath, ...options, '--json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}`);
  const output = JSON.parse(result.stdout);
  if (output.some(entry => entry.success === false)) throw new Error('Local D1 reported a failed query.');
  return output;
}

function schema() {
  const [tables, items, reads, saved, triggers, sourceTriggers] = execute(['--command', "SELECT name FROM sqlite_master WHERE type='table'; PRAGMA table_info(items); PRAGMA table_info(collection_item_reads); PRAGMA table_info(saved_refs); SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_version_%'; SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('source_work_shared_update','source_progress_shared_update');"]);
  const names = new Set(tables.results.map(row => row.name));
  const config = names.has('collection_search_cache_config') ? execute(['--command', 'SELECT schema_version,ready FROM collection_search_cache_config WHERE id=1;'])[0].results[0] : null;
  return {
    tables: names,
    searchReady: config?.ready === 1 && config?.schema_version === 2 && triggers.results.length === 28 && sourceTriggers.results.length === 2,
    items: new Set(items.results.map(row => row.name)),
    reads: new Set(reads.results.map(row => row.name)),
    saved: new Set(saved.results.map(row => row.name)),
  };
}

const sharingSql = readFileSync(path.join(root, 'worker/migrations/0002_sharing_collections.sql'), 'utf8');
const sharingTables = [...sharingSql.matchAll(/CREATE TABLE (\w+)\s*\(/g)].map(match => match[1]);
function missing(current) {
  return [
    ...['users', 'auth_sessions', 'api_keys', 'taxonomies', 'items', 'shares', 'items_fts', ...sharingTables, 'collection_item_progress', 'collection_search_versions', 'collection_search_user_versions', 'collection_search_cache_config'].filter(name => !current.tables.has(name)),
    ...(!current.searchReady ? ['shared_search_cache.not_ready'] : []),
    ...['content_seq', 'draw_seq', 'notes_seq', 'typed_notes', 'progress_seq', 'previous_status'].filter(name => !current.items.has(name)).map(name => `items.${name}`),
    ...(!current.reads.has('starred') ? ['collection_item_reads.starred'] : []),
    ...(!current.saved.has('classification_state') ? ['saved_refs.classification_state'] : []),
  ];
}

console.log('Checking LOCAL D1 (.wrangler/state); production D1 is unaffected.');
let current = schema();
let pending = missing(current);
if (pending.length === 0) {
  console.log('Local schema is ready. No migration needed.');
  process.exit(0);
}
console.log(`Missing: ${pending.join(', ')}`);
if (checkOnly) process.exit(1);

// 0002 is deliberately one-time. Refuse partial states instead of guessing.
if (current.tables.has('items')) {
  const presentSharingTables = sharingTables.filter(name => current.tables.has(name));
  const seqCount = ['content_seq', 'draw_seq', 'notes_seq'].filter(name => current.items.has(name)).length;
  if ((presentSharingTables.length !== 0 && presentSharingTables.length !== sharingTables.length)
      || (presentSharingTables.length === 0 && seqCount !== 0)
      || (presentSharingTables.length === sharingTables.length && seqCount !== 3)) {
    throw new Error('Partial sharing schema detected. No changes made; inspect the local database before retrying.');
  }
}

const d1Path = path.join(statePath, 'v3/d1');
if (existsSync(d1Path)) {
  const backup = path.join(root, '.wrangler/local-db-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(path.dirname(backup), { recursive: true });
  cpSync(d1Path, backup, { recursive: true });
  console.log(`Local D1 backup: ${path.relative(root, backup)}`);
}

if (!current.tables.has('items')) {
  execute(['--file', 'worker/schema.sql']);
} else {
  // The baseline uses IF NOT EXISTS. Run only the baseline portion, because
  // schema.sql also contains one-time sharing ALTER TABLE statements.
  if (!current.items.has('typed_notes')) execute(['--command', 'ALTER TABLE items ADD COLUMN typed_notes TEXT;']);
  const fullSchema = readFileSync(path.join(root, 'worker/schema.sql'), 'utf8');
  const marker = fullSchema.indexOf('-- Sharing v2.');
  if (marker < 0) throw new Error('Baseline schema marker missing.');
  const baselineSql = fullSchema.slice(0, marker).replace(/^\s*--.*$/gm, '').trim();
  execute(['--command', baselineSql]);
  if (!current.tables.has('collections')) execute(['--file', 'worker/migrations/0002_sharing_collections.sql']);
  current = schema();
  if (!current.reads.has('starred')) execute(['--command', 'ALTER TABLE collection_item_reads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));']);
  if (!current.saved.has('classification_state')) execute(['--command', "ALTER TABLE saved_refs ADD COLUMN classification_state TEXT NOT NULL DEFAULT 'ready' CHECK(classification_state IN ('ready','pending','failed','manual'));"]);
  execute(['--file', 'worker/migrations/0004_study_progress.sql']);
  execute(['--file', 'worker/migrations/0005_shared_search_cache.sql']);
  current = schema();
  if (!current.items.has('progress_seq')) execute(['--command', 'ALTER TABLE items ADD COLUMN progress_seq INTEGER NOT NULL DEFAULT 1;']);
  if (!current.items.has('previous_status')) execute(['--command', "ALTER TABLE items ADD COLUMN previous_status TEXT NOT NULL DEFAULT 'unsolved';"]);
  const sourceSyncSql = readFileSync(path.join(root, 'worker/migrations/0006_shared_source_work.sql'), 'utf8').replace(/^\s*--.*$/gm, '').replace(/^ALTER TABLE[^;]+;/gm, '').trim();
  execute(['--command', sourceSyncSql]);
}
pending = missing(schema());
if (pending.length) throw new Error(`Local schema remains incomplete: ${pending.join(', ')}`);
console.log('Local schema is ready. Start npm run worker:dev and npm run dev in separate terminals.');
