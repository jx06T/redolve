// Native-process fixture only. Never starts Wrangler or contacts Cloudflare.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const argv = process.argv.slice(2);
const sql = fs.readFileSync('./scripts/reader-ux-schema.sql', 'utf8').trimEnd().split(/\r?\n/).join(' ');
assert.deepEqual(argv, [
  './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'redolve-db',
  '--remote', '--command', sql, '--json',
]);
fs.appendFileSync(process.env.READER_RELEASE_TEST_CALLS, JSON.stringify(argv) + '\n');
switch (process.env.READER_RELEASE_TEST_CASE) {
  case 'json-error':
    console.log(JSON.stringify({ error: { text: 'fixture authentication denied', code: 10000 } }));
    process.exitCode = 1;
    break;
  case 'stderr-error':
    console.error('fixture native stderr failure');
    process.exitCode = 7;
    break;
  case 'invalid-json':
    console.log('fixture invalid JSON response');
    break;
  case 'success-stderr':
    console.error('fixture nonfatal stderr warning');
    // fall through
  case 'success':
    console.log(JSON.stringify([
      { success: true, results: [{ metric: 'reader_tables', count: 2 }] },
      { success: true, results: [{ metric: 'starred_column', count: 0 }] },
      { success: true, results: [{ metric: 'classification_column', count: 0 }] },
    ]));
    break;
  default:
    throw new Error('Unknown fixture case');
}
