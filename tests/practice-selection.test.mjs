import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['worker/services/practiceSelection.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { selectPracticeCandidates } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const now = Date.parse('2026-11-19T10:00:00Z'), day = 86400000;
const pool = Array.from({ length: 100 }, (_, i) => ({ id: `q${i}` }));
const latest = (id, days, result = 'correct') => ({ question_id: id, answered_at: new Date(now - days * day).toISOString(), result });
const seeded = () => { let state = 56789; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + 0.5) / 4294967296; }; };

test('a single incorrect question receives a per-question weight rather than a whole group quota', () => {
  const random = seeded(); let hits = 0;
  for (let i = 0; i < 5000; i++) if (selectPracticeCandidates(pool, 1, [latest('q0', 2, 'incorrect')], [], now, random)[0].id === 'q0') hits++;
  assert.ok(hits > 50 && hits < 180, `expected about 2%, got ${hits / 50}%`);
});
test('recently answered questions and recently drawn sessions give way to fresh candidates', () => {
  const picked = selectPracticeCandidates(pool, 10, [latest('q0', 0.1, 'incorrect'), latest('q1', 0.5)], ['q2', 'q3'], now, seeded());
  assert.equal(picked.length, 10); assert.equal(new Set(picked.map(q => q.id)).size, 10);
  assert.ok(picked.every(q => !['q0', 'q1', 'q2', 'q3'].includes(q.id)));
});
test('a small pool fills with older exposed questions, with no duplicates or artificial attempts', () => {
  const picked = selectPracticeCandidates(pool.slice(0, 5), 3, [], ['q0', 'q1', 'q2', 'q3'], now, seeded());
  assert.deepEqual(picked.map(q => q.id), ['q4', 'q3', 'q2']);
  assert.equal(selectPracticeCandidates(pool.slice(0, 2), 10, [], ['q0'], now, seeded()).length, 2);
  assert.deepEqual(selectPracticeCandidates([], 3, [], [], now, seeded()), []);
});
test('server cooldown applies without browser exposure history and respects its boundary', () => {
  const picked = selectPracticeCandidates(pool.slice(0, 4), 3,
    [latest('q0', 0.1, 'incorrect'), latest('q1', 0.5), latest('q2', 1)], [], now, seeded());
  assert.deepEqual(new Set(picked.map(q => q.id)), new Set(['q3', 'q2', 'q1']));
});
