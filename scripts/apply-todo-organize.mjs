import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ddl = readFileSync(path.join(root, 'worker/migrations/0013_todo_organize.sql'), 'utf8').replace(/^\s*--[^\r\n]*$/gm, '').trim();
const schemaSql = "SELECT COUNT(*) AS widget_tables FROM sqlite_master WHERE type='table' AND name IN ('home_widget_items','home_widget_preferences'); SELECT COUNT(*) AS todo_order_column FROM pragma_table_info('home_widget_preferences') WHERE name='todo_order';";
const countSql = 'SELECT (SELECT COUNT(*) FROM home_widget_items) AS items, (SELECT COUNT(*) FROM home_widget_preferences) AS preferences;';
function rows(output) {
  const results = JSON.parse(output);
  if (!Array.isArray(results) || results.some(result => result.success !== true || !Array.isArray(result.results))) throw new Error('D1 response is invalid; stopped.');
  return results.map(result => result.results[0]);
}
export function applyTodoOrganize({ local, checkOnly, run, backup, log = console.log }) {
  const target = local ? ['--local', '--persist-to', path.join(root, '.wrangler/state')] : ['--remote'];
  const execute = sql => rows(run(['d1', 'execute', 'redolve-db', ...target, '--command', sql, '--json']));
  const schema = () => {
    const result = execute(schemaSql);
    if (result.length !== 2 || result[0]?.widget_tables !== 2 || ![0, 1].includes(result[1]?.todo_order_column)) throw new Error('Complete 0009_home_widgets.sql first; no migration applied.');
    return result[1].todo_order_column;
  };
  log('Target: ' + (local ? 'LOCAL .wrangler/state' : 'REMOTE redolve-db'));
  const before = schema(); log('todo_order_column=' + before + '; required=1');
  if (checkOnly) { log('Read-only check; no writes.'); return before; }
  if (before === 1) { log('0013 already applied; no writes.'); return 1; }
  const counts = execute(countSql)[0];
  if (!Number.isSafeInteger(counts?.items) || !Number.isSafeInteger(counts?.preferences)) throw new Error('Could not verify existing data; stopped.');
  if (local) backup('local');
  else backup('remote', run(['d1', 'time-travel', 'info', 'redolve-db']));
  execute(ddl);
  if (schema() !== 1) throw new Error('0013 verification failed; inspect database before retrying.');
  const after = execute(countSql)[0];
  if (after.items !== counts.items || after.preferences !== counts.preferences) throw new Error('Row counts changed during migration; inspect database.');
  log('0013 ready: todo_order_column=1; existing item/preference row counts preserved.');
  return 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--local', '--remote', '--check'].includes(arg)) || args.includes('--local') === args.includes('--remote')) throw new Error('Choose exactly one target: --local or --remote. Optional: --check.');
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_LOG_PATH = path.join(root, '.wrangler/qa/logs');
  const run = args => {
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Wrangler failed; stopped.');
    return result.stdout;
  };
  const backup = (target, bookmark) => {
    const folder = path.join(root, '.wrangler/local-db-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-before-todo-organize');
    mkdirSync(folder, { recursive: true });
    if (target === 'local') {
      const state = path.join(root, '.wrangler/state/v3/d1');
      if (!existsSync(state)) throw new Error('Local D1 state missing; stopped.');
      cpSync(state, path.join(folder, 'd1'), { recursive: true });
    } else {
      if (!/bookmark/i.test(bookmark) || !/[0-9a-f]{8}-[0-9a-f-]+/i.test(bookmark)) throw new Error('Time Travel bookmark missing; stopped.');
      writeFileSync(path.join(folder, 'remote-bookmark.txt'), bookmark);
      console.log(bookmark.trim());
    }
    console.log('Backup: ' + path.relative(root, folder));
  };
  applyTodoOrganize({ local: args.includes('--local'), checkOnly: args.includes('--check'), run, backup });
}
