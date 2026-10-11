import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Miniflare } from 'miniflare';

test('empty owned browsing reads one page instead of scanning the OCR index', async () => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/search-cost-'));
  let mf;
  try {
    const bundle = join(dir, 'router.mjs');
    await build({ entryPoints: ['worker/routes/search.ts'], bundle: true, format: 'esm', platform: 'node',
      outfile: bundle, logLevel: 'silent' });
    const { searchRouter } = await import(pathToFileURL(bundle));
    const queries = [];
    // Capture the real route's prepared SQL, then profile it against a local D1 fixture.
    const DB = { prepare(sql) {
      const statement = { bind(...values) { statement.values = values; return statement; },
        async first() { return sql.includes('auth_sessions') ? { id: 'session' } : { email: 'cost@example.test' }; },
        async all() { queries.push({ sql, values: statement.values }); return { results: [] }; } };
      return statement;
    } };
    const token = await sign({ sub: 'cost', sid: 'session', exp: Math.floor(Date.now() / 1000) + 3600 }, 'cost-test-secret');
    const app = new Hono().route('/search', searchRouter);
    for (const suffix of ['limit=30', 'limit=50&metadata_only=1', 'limit=30&offset=30']) {
      const response = await app.fetch(new Request(`https://cost.test/search?scope=mine&origin=owned&browse=1&${suffix}`,
        { headers: { Authorization: `Bearer ${token}` } }), { DB, JWT_SECRET: 'cost-test-secret' });
      assert.equal(response.status, 200, await response.text());
    }
    mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2025-04-01', d1Databases: ['DB'] });
    const db = await mf.getD1Database('DB');
    const schema = (await readFile('worker/schema.sql', 'utf8')).replace(/^\uFEFF/, '').replace(/^\s*--[^\r\n]*$/gm, '');
    let statement = '', trigger = false;
    for (const line of schema.split(/\r?\n/)) {
      const text = line.trim(); if (!text) continue;
      if (/^CREATE TRIGGER/i.test(text)) trigger = true;
      statement += ` ${text}`;
      if (trigger ? /^END;$/i.test(text) : text.endsWith(';')) { await db.exec(statement); statement = ''; trigger = false; }
    }
    await db.exec("INSERT INTO users(id,email) VALUES('cost','cost@example.test');");
    for (let start = 0; start < 219; start += 50) {
      const batch = [];
      for (let i = start; i < Math.min(start + 50, 219); i++) {
        const id = `q${String(i).padStart(4, '0')}`;
        batch.push(db.prepare(`INSERT INTO items(id,user_id,source,image_url,status,created_at)
          VALUES(?,'cost','vector exercise','image','unsolved','2026-10-11T00:00:00Z')`).bind(id));
        batch.push(db.prepare("INSERT INTO items_fts(id,user_id,problem_text) VALUES(?,'cost','vector OCR')").bind(id));
      }
      await db.batch(batch);
    }
    for (const [index, query] of queries.entries()) {
      const result = await db.prepare(query.sql).bind(...query.values).all();
      const limit = index === 1 ? 51 : 31;
      const offset = index === 2 ? 30 : 0;
      assert.deepEqual(result.results.map(row => row.id), Array.from({ length: limit }, (_, i) => `q${String(218 - offset - i).padStart(4, '0')}`));
      assert.ok(result.meta.rows_read <= limit + offset + 5,
        `browse cost must be bounded by the page, got ${result.meta.rows_read} reads`);
      const plan = (await db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).bind(...query.values).all()).results;
      assert.ok(!plan.some(row => /VIRTUAL TABLE|TEMP B-TREE/.test(row.detail)), 'no OCR scan or temporary relevance sort');
      console.log(`browse limit=${limit - 1} offset=${offset}: rows_read=${result.meta.rows_read}`);
    }
    // Include hydration in the route's cost, not just its first list query.
    const profile = [];
    const measuredDB = { prepare(sql) {
      let values = [];
      return { bind(...args) { values = args; return this; },
        async first() { return sql.includes('auth_sessions') ? { id: 'session' } : { email: 'cost@example.test' }; },
        async all() { const result = await db.prepare(sql).bind(...values).all(); profile.push({ sql, ...result.meta }); return result; } };
    } };
    const costs = {};
    for (const projection of ['full', 'compact']) {
      profile.length = 0;
      const response = await app.fetch(new Request(`https://cost.test/search?scope=mine&origin=owned&browse=1&projection=${projection}`,
        { headers: { Authorization: `Bearer ${token}` } }), { DB: measuredDB, JWT_SECRET: 'cost-test-secret' });
      assert.equal(response.status, 200);
      const page = await response.json();
      assert.equal(page.items.length, 30);
      if (projection === 'compact') {
        assert.equal(profile.length, 1, 'compact browsing must not hydrate full items');
        assert.ok(profile[0].rows_read <= 36);
        assert.ok(page.items.every(hit => !('problem' in hit) && hit.typed_notes === null));
      } else assert.ok(page.items.every(hit => hit.problem));
      costs[projection] = profile.reduce((sum, result) => sum + result.rows_read, 0);
    }
    assert.ok(costs.compact < costs.full);
    console.log(`complete owned browse: full=${costs.full} reads, compact=${costs.compact} reads`);
  } finally {
    if (mf) await mf.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
