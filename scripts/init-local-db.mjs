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
  if (result.status !== 0) throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n') || `Wrangler exited with ${result.status}`);
  const output = JSON.parse(result.stdout);
  if (output.some(entry => entry.success === false)) throw new Error('Local D1 reported a failed query.');
  return output;
}

function schema() {
  const [tables, items, reads, saved, triggers, sourceTriggers, collections, snapshots, shareDdl] = execute(['--command', "SELECT name FROM sqlite_master WHERE type='table'; PRAGMA table_info(items); PRAGMA table_info(collection_item_reads); PRAGMA table_info(saved_refs); SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_version_%'; SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('source_work_shared_update','source_progress_shared_update'); PRAGMA table_info(collections); PRAGMA table_info(saved_snapshots); SELECT name FROM sqlite_master WHERE name IN ('asset_reference_inventory','independent_share_asset_ready','idx_independent_shares_owner','idx_independent_shares_list','idx_independent_shares_expiry','idx_share_asset_refs_asset');"]);
  const names = new Set(tables.results.map(row => row.name));
  const [widgetItems,widgetPrefs,widgetIndexes]=execute(['--command',"PRAGMA table_info(home_widget_items); PRAGMA table_info(home_widget_preferences); SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_home_widgets_active','idx_home_widgets_expiry');"]);
  const [progressPlans,progressPreferences,progressOperations,progressIndexes]=execute(['--command',"PRAGMA table_info(study_progress_plans); PRAGMA table_info(study_progress_preferences); PRAGMA table_info(study_progress_operations); SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_study_progress_active','idx_study_progress_operations_plan');"]);
  const config = names.has('collection_search_cache_config') ? execute(['--command', 'SELECT schema_version,ready FROM collection_search_cache_config WHERE id=1;'])[0].results[0] : null;
  return {
    tables: names,
    progressPlans: new Set(progressPlans.results.map(row=>row.name)),
    progressPreferences: new Set(progressPreferences.results.map(row=>row.name)),
    progressOperations: new Set(progressOperations.results.map(row=>row.name)),
    progressIndexes: new Set(progressIndexes.results.map(row=>row.name)),
    widgetItems: new Set(widgetItems.results.map(row=>row.name)),
    widgetPrefs: new Set(widgetPrefs.results.map(row=>row.name)),
    widgetIndexes: new Set(widgetIndexes.results.map(row=>row.name)),
    collections: new Set(collections.results.map(row=>row.name)),
    snapshots: new Set(snapshots.results.map(row=>row.name)),
    shareDdl: new Set(shareDdl.results.map(row=>row.name)),
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
    ...['users', 'auth_sessions', 'api_keys', 'taxonomies', 'items', 'shares', 'items_fts', ...sharingTables, 'collection_item_progress', 'collection_search_versions', 'collection_search_user_versions', 'collection_search_cache_config', 'independent_shares', 'share_asset_refs', 'home_widget_items', 'home_widget_preferences','study_progress_plans','study_progress_preferences','study_progress_operations'].filter(name => !current.tables.has(name)),
    ...(!current.collections.has('allow_reshare') ? ['collections.allow_reshare'] : []),
    ...(!current.snapshots.has('reshare_allowed') ? ['saved_snapshots.reshare_allowed'] : []),
    ...(!current.snapshots.has('source_text') ? ['saved_snapshots.source_text'] : []),
    ...['id','user_id','name','unit','target_count','completed_count','created_at','updated_at','row_version','deleted_at'].filter(name=>!current.progressPlans.has(name)).map(name=>'study_progress_plans.'+name),
    ...['user_id','visible','plan_order','row_version','updated_at'].filter(name=>!current.progressPreferences.has(name)).map(name=>'study_progress_preferences.'+name),
    ...['id','user_id','plan_id','delta','effect','applied','created_at'].filter(name=>!current.progressOperations.has(name)).map(name=>'study_progress_operations.'+name),
    ...['idx_study_progress_active','idx_study_progress_operations_plan'].filter(name=>!current.progressIndexes.has(name)),
    ...['idx_home_widgets_active','idx_home_widgets_expiry'].filter(name=>!current.widgetIndexes.has(name)),
    ...['id','user_id','kind','text','target_date','completed_at','created_at','updated_at','row_version','deleted_at'].filter(name=>!current.widgetItems.has(name)).map(name=>`home_widget_items.${name}`),
    ...['user_id','todos_visible','countdowns_visible','countdown_order','todo_order','row_version','updated_at'].filter(name=>!current.widgetPrefs.has(name)).map(name=>`home_widget_preferences.${name}`),
    ...['asset_reference_inventory','independent_share_asset_ready','idx_independent_shares_owner','idx_independent_shares_list','idx_independent_shares_expiry','idx_share_asset_refs_asset'].filter(name=>!current.shareDdl.has(name)),
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
  if(current.tables.has('home_widget_items')&&current.widgetItems.size!==10||current.tables.has('home_widget_preferences')&&![5,6,7].includes(current.widgetPrefs.size))throw new Error('Partial home widget schema detected. No changes made; inspect the local database before retrying.');
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
  if(!current.searchReady) execute(['--file', 'worker/migrations/0005_shared_search_cache.sql']);
  current = schema();
  if (!current.items.has('progress_seq')) execute(['--command', 'ALTER TABLE items ADD COLUMN progress_seq INTEGER NOT NULL DEFAULT 1;']);
  if (!current.items.has('previous_status')) execute(['--command', "ALTER TABLE items ADD COLUMN previous_status TEXT NOT NULL DEFAULT 'unsolved';"]);
  const sourceSyncSql = readFileSync(path.join(root, 'worker/migrations/0006_shared_source_work.sql'), 'utf8').replace(/^\s*--.*$/gm, '').replace(/^ALTER TABLE[^;]+;/gm, '').trim();
  if(!current.searchReady)execute(['--command', sourceSyncSql]);
  current=schema();
  if(!current.collections.has('allow_reshare'))execute(['--command','ALTER TABLE collections ADD COLUMN allow_reshare INTEGER NOT NULL DEFAULT 0 CHECK(allow_reshare IN (0,1));']);
  if(!current.snapshots.has('reshare_allowed'))execute(['--command','ALTER TABLE saved_snapshots ADD COLUMN reshare_allowed INTEGER NOT NULL DEFAULT 0 CHECK(reshare_allowed IN (0,1));']);
  const shareSql=readFileSync(path.join(root,'worker/migrations/0007_independent_question_shares.sql'),'utf8').replace(/^\s*--.*$/gm,'').replace(/^ALTER TABLE[^;]+;/gm,'').trim();
  execute(['--command',shareSql]);
  if(!current.snapshots.has('source_text'))execute(['--file','worker/migrations/0008_saved_question_text.sql']);
  execute(['--file','worker/migrations/0009_home_widgets.sql']);
  current=schema();
  if(!current.widgetPrefs.has('countdown_order'))execute(['--file','worker/migrations/0010_countdown_order.sql']);
}
execute(['--file','worker/migrations/0012_study_progress.sql']);
if(!schema().widgetPrefs.has('todo_order'))execute(['--file','worker/migrations/0013_todo_organize.sql']);
pending = missing(schema());
if (pending.length) throw new Error(`Local schema remains incomplete: ${pending.join(', ')}`);
console.log('Local schema is ready. Start npm run worker:dev and npm run dev in separate terminals.');
