import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unstable_splitSqlQuery } from 'wrangler';

test('local Wrangler keeps nested CASE inside the 0006 progress trigger', async () => {
  const migration = await readFile('worker/migrations/0006_shared_source_work.sql', 'utf8');
  const queries = unstable_splitSqlQuery(migration);
  assert.equal(queries.length, 6, 'two ALTERs, two complete triggers, and two updates');
  const triggers = queries.filter(query => /^CREATE TRIGGER/i.test(query));
  assert.equal(triggers.length, 2);
  assert.ok(triggers.every(query => /END\s*;?\s*$/.test(query)));
  assert.match(triggers[1], /INSERT INTO collection_search_user_versions/);
  const schema = await readFile('worker/schema.sql', 'utf8');
  assert.ok(schema.replace(/\r/g, '').endsWith(migration.replace(/\r/g, '')));
});
