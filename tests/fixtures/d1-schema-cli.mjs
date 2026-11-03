// Preloaded only by migration tests. Every Wrangler subprocess is replaced; no network or D1 access.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { unstable_splitSqlQuery } from 'wrangler';

const statePath = process.env.D1_SCHEMA_FIXTURE_STATE, logPath = process.env.D1_SCHEMA_FIXTURE_CALLS;
assert.ok(statePath && logPath, 'Fixture paths are required');
const migrations = ['0014_learning_foundation.sql', '0015_practice_attempts.sql', '0016_personal_analysis.sql',
  '0017_analysis_context_and_followups.sql', '0018_correction_recognition.sql', '0019_analysis_cycles.sql'];
const definitions = new Map(migrations.map(file => [file, unstable_splitSqlQuery(readFileSync('worker/migrations/' + file, 'utf8').replace(/^\s*--[^\r\n]*$/gm, ''))
  .flatMap(sql => { const match = sql.match(/^CREATE\s+(TABLE|INDEX|TRIGGER|VIEW)\s+(\w+)/i); return match ? [{ name: match[2], sql }] : []; })]));
const response = (results = []) => ({ status: 0, stdout: JSON.stringify([{ success: true, results }]), stderr: '' });
childProcess.spawnSync = (_command, args) => {
  assert.match(args[0], /node_modules[\\/]wrangler[\\/]bin[\\/]wrangler\.js$/);
  assert.equal(args[1], 'd1');
  appendFileSync(logPath, JSON.stringify(args.slice(1)) + '\n');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (args[2] === 'time-travel') return { status: 0, stdout: 'Current bookmark: 00000001-00000000-00000000-0000000000000000\n', stderr: '' };
  assert.equal(args[2], 'execute'); assert.equal(args[3], 'redolve-db'); assert.ok(args.includes('--remote'));
  if (args.includes('--command')) {
    const query = args[args.indexOf('--command') + 1];
    if (query.startsWith('PRAGMA table_info(items); PRAGMA table_info(saved_refs); PRAGMA table_info(collection_item_progress);')) {
      const columns = [{ name: 'id', type: 'TEXT', notnull: 0, dflt_value: null }];
      if (state.stars) columns.push({ name: 'starred', type: 'INTEGER', notnull: 1, dflt_value: '0' });
      const objects = state.stars ? ['idx_items_personal_star', 'idx_saved_personal_star', 'personal_star_source_update'].map(name => ({ name })) : [];
      return { status: 0, stderr: '', stdout: JSON.stringify([...Array.from({ length: 3 }, () => ({ success: true, results: columns })), { success: true, results: objects }]) };
    }
    if (query.startsWith('SELECT name,sql FROM sqlite_master')) {
      const names = [...query.matchAll(/'([^']+)'/g)].map(match => match[1]);
      const rows = state.applied.flatMap(file => definitions.get(file)).filter(row => names.includes(row.name) && !state.omit?.includes(row.name));
      if (!state.applied.includes(migrations[0]) && names.includes('asset_reference_inventory')) rows.push({ name: 'asset_reference_inventory', sql: 'CREATE VIEW asset_reference_inventory AS SELECT 1' });
      return response(rows);
    }
    assert.ok(query.startsWith('SELECT name FROM sqlite_master'));
    return response(['items', 'saved_refs', 'saved_snapshots', 'assets', 'asset_refs', 'share_asset_refs', 'asset_reference_inventory'].map(name => ({ name })));
  }
  const file = args[args.indexOf('--file') + 1].split('/').at(-1);
  assert.ok(definitions.has(file)); assert.ok(!state.applied.includes(file), 'Installed migrations must never be replayed');
  if (state.failAt === file && state.mode === 'exit-error') return { ...response(), status: 7, stderr: 'fixture migration rejected' };
  state.applied.push(file); writeFileSync(statePath, JSON.stringify(state));
  if (state.failAt === file && state.mode === 'invalid-json') return { status: 0, stdout: 'File finished, but the result is missing', stderr: '' };
  return { status: 0, stdout: '├ Checking if file needs uploading\n│ Uploading file\n' + response().stdout, stderr: 'fixture nonfatal warning' };
};
syncBuiltinESMExports();
