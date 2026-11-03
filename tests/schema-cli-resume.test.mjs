import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const files = ['0014_learning_foundation.sql', '0015_practice_attempts.sql', '0016_personal_analysis.sql', '0017_analysis_context_and_followups.sql', '0018_correction_recognition.sql', '0019_analysis_cycles.sql'];
function fixture(initial, action) {
  mkdirSync('.wrangler/qa', { recursive: true });
  const dir = mkdtempSync(resolve('.wrangler/qa/schema-cli-')), statePath = join(dir, 'state.json'), callsPath = join(dir, 'calls.jsonl');
  writeFileSync(statePath, JSON.stringify(initial)); writeFileSync(callsPath, '');
  const run = (kind, mode = '--apply') => spawnSync(process.execPath, ['--import', pathToFileURL(resolve('tests/fixtures/d1-schema-cli.mjs')).href,
    `scripts/apply-${kind}-schema.mjs`, '--target=remote', mode], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, D1_SCHEMA_FIXTURE_STATE: statePath, D1_SCHEMA_FIXTURE_CALLS: callsPath } });
  const calls = () => readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const applied = () => calls().filter(args => args.includes('--file')).map(args => args[args.indexOf('--file') + 1].split('/').at(-1));
  try { action({ run, applied, calls, state: () => JSON.parse(readFileSync(statePath, 'utf8')) }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
test('learning migration accepts noisy import JSON and verifies the resulting schema', () => fixture({ applied: [] }, ({ run, applied, calls }) => {
  const result = run('learning'); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Learning schema ready/);
  assert.deepEqual(applied(), [files[0]]);
  const count = calls().length; assert.equal(run('learning').status, 0); assert.equal(calls().length, count + 1, 'installed learning schema only needs one read');
  assert.equal(run('learning', '--check').status, 0); assert.deepEqual(applied(), [files[0]]);
}));
test('practice migration resumes after installed 0015 and does not repeat writes on rerun', () => fixture({ applied: files.slice(0, 2) }, ({ run, applied, calls }) => {
  assert.equal(run('practice', '--check').status, 1); assert.deepEqual(applied(), []);
  const result = run('practice'); assert.equal(result.status, 0, result.stderr); assert.deepEqual(applied(), files.slice(2));
  assert.equal(run('practice').status, 0); assert.equal(run('practice', '--check').status, 0); assert.deepEqual(applied(), files.slice(2));
  assert.equal(calls().filter(args => args[1] === 'time-travel').length, 1);
}));
test('an applied migration with an unreadable acknowledgement is skipped safely on retry', () => fixture({ applied: files.slice(0, 2), failAt: files[2], mode: 'invalid-json' }, ({ run, state, applied }) => {
  const first = run('practice'); assert.equal(first.status, 1); assert.match(first.stderr, /may already have run/);
  assert.deepEqual(state().applied, files.slice(0, 3)); assert.deepEqual(applied(), [files[2]]);
  const retry = run('practice'); assert.equal(retry.status, 0, retry.stderr); assert.deepEqual(applied(), files.slice(2));
}));
test('nonzero Wrangler exits and partial schemas stop before any later migration', () => {
  fixture({ applied: files.slice(0, 2), failAt: files[2], mode: 'exit-error' }, ({ run, state, applied }) => {
    const result = run('practice'); assert.equal(result.status, 1); assert.match(result.stderr, /fixture migration rejected/);
    assert.deepEqual(state().applied, files.slice(0, 2)); assert.deepEqual(applied(), [files[2]]);
  });
  fixture({ applied: files.slice(0, 3), omit: ['analysis_reports'] }, ({ run, applied }) => {
    const result = run('practice'); assert.equal(result.status, 1); assert.match(result.stderr, /Partial\/mismatched schema/); assert.deepEqual(applied(), []);
  });
});
