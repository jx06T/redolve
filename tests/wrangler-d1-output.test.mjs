import test from 'node:test';
import assert from 'node:assert/strict';
import { parseD1Output } from '../scripts/wrangler-d1-output.mjs';

const rows = [{ success: true, results: [{ name: 'notes', text: '保留 "括號 [ ] { }" 與 \\ 路徑' }], meta: { changes: 1 } }];
test('D1 output accepts plain JSON and remote import progress without changing query data', () => {
  assert.deepEqual(parseD1Output(JSON.stringify(rows)), rows);
  const progress = '\uFEFF\u001b[32m├ Checking if file needs uploading\u001b[0m\r\n│ Uploading file\r\n';
  assert.deepEqual(parseD1Output(progress + JSON.stringify(rows, null, 2) + '\n'), rows);
  assert.deepEqual(parseD1Output('[INFO] Preparing import\n' + JSON.stringify(rows) + '\nImport complete\n'), rows);
});
test('D1 output never treats failed, empty, incomplete or ambiguous responses as success', () => {
  for (const output of ['', '├ Checking if file needs uploading', '[]', '{}', '{"error":{"text":"denied"}}',
    '[{"success":true}]', '[{"success":true,"results":[]}', 'progress\n' + JSON.stringify(rows) + '\n' + JSON.stringify(rows)])
    assert.throws(() => parseD1Output(output), /Invalid Wrangler/);
  assert.throws(() => parseD1Output(JSON.stringify([{ success: false, results: [] }])), /failed query/);
  assert.throws(() => parseD1Output('progress\n' + JSON.stringify([{ success: false, results: [] }]) + '\n' + JSON.stringify(rows)), /failed query/);
});
