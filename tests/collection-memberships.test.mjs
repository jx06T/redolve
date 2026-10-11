import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';

test('owned question badges reflect current membership after removal and rejoining', async () => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/membership-'));
  let mf;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser',
      target: 'es2022', outfile: bundle, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01',
      compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'],
      kvNamespaces: ['KV'], bindings: { JWT_SECRET: 'membership-secret' } });
    const db = await mf.getD1Database('DB');
    const schema = (await readFile('worker/schema.sql', 'utf8')).replace(/^\uFEFF/, '').replace(/^\s*--[^\r\n]*$/gm, '');
    let statement = '', trigger = false;
    for (const line of schema.split(/\r?\n/)) {
      const text = line.trim(); if (!text) continue;
      if (/^CREATE TRIGGER/i.test(text)) trigger = true;
      statement += ` ${text}`;
      if (trigger ? /^END;$/i.test(text) : text.endsWith(';')) {
        await db.exec(statement.trim()); statement = ''; trigger = false;
      }
    }
    const tokens = {};
    for (const uid of ['author', 'other']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid, `${uid}@example.test`).run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)')
        .bind(uid, uid, Math.floor(Date.now() / 1000) + 3600).run();
      tokens[uid] = await sign({ sub: uid, sid: uid, exp: Math.floor(Date.now() / 1000) + 3600 }, 'membership-secret');
    }
    const call = async (path, method = 'GET', body, uid = 'author') => {
      const response = await mf.dispatchFetch(`https://membership.test/api${path}`, { method,
        headers: { Authorization: `Bearer ${tokens[uid]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
    };
    await db.exec("INSERT INTO assets(id,storage_key) VALUES('image','image');");
    const ink = JSON.stringify({ strokes: [], eraserMasks: [], baseWidth: 600, baseHeight: 100 });
    await db.prepare('INSERT INTO items(id,user_id,image_url,source,typed_notes,draw_data) VALUES(?,?,?,?,?,?)')
      .bind('q', 'author', 'image', 'Original', 'Keep my notes', ink).run();
    const first = await call('/my/collections', 'POST', { title: 'Public', public_name: 'Author', visibility: 'public', activate: true });
    const second = await call('/my/collections', 'POST', { title: 'Draft', public_name: 'Author', visibility: 'restricted' });
    const entry = await call(`/collections/${first.id}/items`, 'POST', { item_id: 'q' });
    const draft = await call(`/collections/${second.id}/items`, 'POST', { item_id: 'q' });
    const memberships = async (uid = 'author') => (await call('/my/collections/membership?item_ids=q', 'GET', undefined, uid)).memberships.q || [];
    assert.deepEqual(new Set((await memberships()).map(row => row.entry_id)), new Set([entry.entry_id, draft.entry_id]));
    assert.deepEqual(await memberships('other'), [], 'membership never exposes another user’s originals');
    await call(`/collections/${first.id}/items/${entry.entry_id}`, 'DELETE');
    assert.deepEqual((await memberships()).map(row => row.entry_id), [draft.entry_id], 'remove only the relevant badge');
    assert.equal((await db.prepare('SELECT state FROM collection_items WHERE id=?').bind(entry.entry_id).first()).state, 'removed', 'historical association remains');
    const rejoined = await call(`/collections/${first.id}/items`, 'POST', { item_id: 'q' });
    assert.equal(rejoined.entry_id, entry.entry_id);
    assert.equal((await memberships()).length, 2, 'rejoining restores one badge, without duplicates');
    await call(`/collections/${first.id}/items/${entry.entry_id}`, 'DELETE');
    await call(`/collections/${second.id}/items/${draft.entry_id}`, 'DELETE');
    assert.deepEqual(await memberships(), [], 'removing the last membership clears every badge');
    assert.deepEqual(await db.prepare('SELECT typed_notes,draw_data FROM items WHERE id=?').bind('q').first(),
      { typed_notes: 'Keep my notes', draw_data: ink }, 'removing membership leaves the original work intact');
  } finally {
    await mf?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
