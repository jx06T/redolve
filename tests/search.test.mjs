import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { createHash } from 'node:crypto';

test('search scopes enforce current access and retained download versions', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'redolve-search-'));
  let mf;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser',
      target: 'es2022', outfile: bundle, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01',
      compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'],
      kvNamespaces: ['KV'], bindings: { JWT_SECRET: 'search-test-secret' } });
    const db = await mf.getD1Database('DB');
    const schema = (await readFile('worker/schema.sql', 'utf8')).replace(/^\uFEFF/, '')
      .replace(/^\s*--[^\r\n]*$/gm, '');
    let statement = '', inTrigger = false;
    for (const line of schema.split(/\r?\n/)) {
      const text = line.trim();
      if (!text) continue;
      if (/^CREATE TRIGGER/i.test(text)) inTrigger = true;
      statement += ` ${text}`;
      if ((inTrigger && /^END;$/i.test(text)) || (!inTrigger && text.endsWith(';'))) {
        await db.exec(statement.trim()); statement = ''; inTrigger = false;
      }
    }
    const tokens = {};
    for (const id of ['a', 'b', 'c', 'd']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(id, `${id}@example.test`).run();
      await db.prepare('INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)').bind(id, id).run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)')
        .bind(`session-${id}`, id, Math.floor(Date.now() / 1000) + 3600).run();
      tokens[id] = await sign({ sub: id, sid: `session-${id}`, exp: Math.floor(Date.now() / 1000) + 3600 },
        'search-test-secret');
    }
    const call = async (path, user = 'b', method = 'GET', body, cookie) => {
      const response = await mf.dispatchFetch(`https://redolve.test/api${path}`, {
        method, headers: { ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    };
    const search = async (q, scope = 'mine', user = 'b', extra = '', cookie) => {
      const result = await call(`/search?q=${encodeURIComponent(q)}&scope=${scope}${extra}`, user, 'GET', undefined, cookie);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return result.data;
    };
    const keys = page => page.items.map(hit => `${hit.origin}:${hit.id}`);
    await db.prepare("INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0)").run();
    await db.prepare("INSERT INTO taxonomies(id,parent_id,label,level) VALUES('vector','math','向量單元',1)").run();
    await db.prepare("INSERT INTO taxonomies(id,user_id,label,level) VALUES('a-private','a','secret-curriculum',0)").run();
    const addSource = async (id, uid, title = '向量練習', topic = 'vector') => {
      await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)').bind(`image-${id}`, `image-${id}`).run();
      await db.prepare(`INSERT INTO items(id,user_id,image_url,source,topic_id,keywords,keyword_tokens,typed_notes,status)
        VALUES(?,?,?,?,?,'["向量"]','vector token','private-secret','unsolved')`)
        .bind(id, uid, `image-${id}`, title, topic).run();
      await db.prepare(`INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES(?,?,?,'source_image')`)
        .bind(`ref-${id}`, `image-${id}`, id).run();
    };
    const addCollection = async (id, visibility = 'public', listed = 1) => {
      await db.prepare(`INSERT INTO collections(id,owner_id,title,public_name,lifecycle,visibility,listed)
        VALUES(?,'a',?,'老師','active',?,?)`).bind(id, `題目集-${id}`, visibility, listed).run();
      await addSource(`source-${id}`, 'a');
      const added = await call(`/collections/${id}/items`, 'a', 'POST', { item_id: `source-${id}` });
      assert.equal(added.status, 201, JSON.stringify(added.data));
      return added.data.entry_id;
    };
    const grant = async (id, co, user, role = 'viewer', expires = null) =>
      db.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,user_id,expires_at)
        VALUES(?,?,'user',?,?,?)`).bind(id, co, role, user, expires).run();
    await addSource('own', 'b');
    await addSource('no-index', 'b', '沒有索引的電流題');
    await addSource('other-private', 'd', '他人的電流題');
    for (const text of ['obsolete-ocr', '洛倫茲力 magnetic particle']) {
      await db.prepare(`INSERT INTO items_fts(id,user_id,source,keyword_tokens,typed_notes,problem_text)
        VALUES('own','b','stale-metadata','','stale-private-note',?)`).bind(text).run();
    }
    const subscribedEntry = await addCollection('subscribed');
    const unknownEntry = await addCollection('unknown');
    const unlistedEntry = await addCollection('unlisted', 'public', 0);
    const invitedEntry = await addCollection('invited', 'restricted', 0);
    const linkEntry = await addCollection('link', 'link', 0);
    await grant('viewer', 'invited', 'b');
    // A subscription alone never grants access to a restricted collection.
    await db.prepare(`INSERT INTO subscriptions(user_id,collection_id,last_known_title,subscribed_after_seq)
      VALUES('b','subscribed','Known',999999),('d','invited','Restricted',0)`).run();
    const linkToken = 'a'.repeat(64);
    await db.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,token_hash)
      VALUES('link-grant','link','link','viewer',?)`)
      .bind(createHash('sha256').update(linkToken).digest('hex')).run();
    await db.prepare("INSERT INTO grant_holders(grant_id,user_id) VALUES('link-grant','b')").run();
    await grant('writer', 'subscribed', 'c', 'contributor');
    await db.prepare(`INSERT INTO shared_layers(id,entry_id,entry_generation,user_id,author_display,typed_notes)
      VALUES('layer',?,1,'c','Contributor','shared-secret')`).bind(subscribedEntry).run();

    await t.test('own metadata without an index; latest OCR; safe literal search; pagination and filters', async () => {
      assert.deepEqual(keys(await search('電流')), ['owned:no-index']);
      assert.deepEqual(keys(await search('洛倫茲')), ['owned:own']);
      assert.deepEqual(keys(await search('magnetic   particle')), ['owned:own'], 'FTS phrase works when LIKE substring cannot match');
      assert.deepEqual(keys(await search('obsolete-ocr')), []);
      assert.deepEqual(keys(await search('stale-metadata')), []);
      assert.deepEqual(keys(await search('stale-private-note')), []);
      assert.deepEqual(keys(await search('%')), []);
      assert.deepEqual(keys(await search('_')), []);
      assert.deepEqual(keys(await search('" OR *')), []);
      const page = await search('向量', 'mine', 'b', '&limit=1&topic_id=math&tag=向量&status=unsolved');
      assert.equal(page.items.length, 1);
      assert.equal(page.next_offset, 1);
      const next = await search('向量', 'mine', 'b', '&limit=1&offset=1&topic_id=math&tag=向量&status=unsolved');
      assert.equal(next.items.length, 1);
      assert.notEqual(page.items[0].id, next.items[0].id);
      assert.equal(next.next_offset, null);
      assert.ok(page.items[0].problem);
      assert.deepEqual(keys(await search('向量', 'mine', 'b', '&status=resolved')), []);
      assert.deepEqual(keys(await search('向量', 'mine', 'b', '&topic_id=a-private')), []);
      const response = await call('/search?q=向量', null);
      assert.equal(response.status, 401);
      assert.equal((await call('/search?q=向量&scope=public&status=resolved', null)).status, 400);
      assert.equal((await call('/search?q=向量&limit=51')).status, 400);
      assert.equal((await call('/search?q=向量&offset=-1')).status, 400);
      assert.equal((await call('/search?q=向量&scope=bogus')).status, 400);
    });
    await t.test('search includes all subscription history, accepted invitations and link holders', async () => {
      const found = keys(await search('向量', 'shared'));
      assert.ok(found.includes(`shared:${subscribedEntry}`), 'pre-subscription questions remain searchable');
      assert.ok(found.includes(`shared:${invitedEntry}`), 'invited reader need not subscribe');
      assert.ok(found.includes(`shared:${linkEntry}`));
      assert.ok(!found.includes(`shared:${unknownEntry}`));
      assert.ok(!found.includes(`shared:${unlistedEntry}`));
      assert.deepEqual(keys(await search('向量', 'shared', 'b', '&subscribed=yes')), [`shared:${subscribedEntry}`]);
      assert.deepEqual(keys(await search('向量', 'shared', 'd')), []);
      assert.deepEqual(keys(await search('向量', 'shared', null, '&collection_id=invited')), []);
      assert.deepEqual(keys(await search('向量', 'shared', null, '&collection_id=link',
        `rdv_collection_link=${linkToken}`)), [`shared:${linkEntry}`]);
      assert.deepEqual(keys(await search('向量', 'shared', null, '&collection_id=link',
        `rdv_collection_invited=${linkToken}`)), []);
      await db.prepare("UPDATE collection_grants SET expires_at='2000-01-01T00:00:00Z' WHERE id='link-grant'").run();
      assert.deepEqual(keys(await search('向量', 'shared', null, '&collection_id=link',
        `rdv_collection_link=${linkToken}`)), []);
      assert.ok(!keys(await search('向量', 'shared')).includes(`shared:${linkEntry}`));
    });
    await t.test('public whitelist and shared layer field visibility exclude private data', async () => {
      const found = keys(await search('向量', 'public', null));
      assert.ok(found.includes(`public:${subscribedEntry}`) && found.includes(`public:${unknownEntry}`));
      assert.ok(!found.includes(`public:${unlistedEntry}`) && !found.includes(`public:${invitedEntry}`));
      const collections = await search('題目集', 'public', null);
      assert.equal(collections.items[0].origin, 'collection');
      assert.deepEqual(keys(await search('private-secret', 'public', null)), []);
      assert.deepEqual(keys(await search('private-secret', 'shared')), []);
      assert.deepEqual(keys(await search('shared-secret', 'shared')), []);
      assert.deepEqual(keys(await search('shared-secret', 'shared', 'c')), [`shared:${subscribedEntry}`]);
      await db.prepare("UPDATE collections SET show_shared_notes=1 WHERE id='subscribed'").run();
      assert.deepEqual(keys(await search('shared-secret', 'shared')), [`shared:${subscribedEntry}`]);
      await db.prepare("INSERT INTO assets(id,storage_key) VALUES('shared-ink','draw/shared-ink.json')").run();
      await db.prepare("UPDATE shared_layers SET draw_asset_id='shared-ink' WHERE id='layer'").run();
      const detail = await call(`/collections/subscribed/items/${subscribedEntry}`);
      assert.equal(detail.status, 200, JSON.stringify(detail.data));
      assert.equal(detail.data.layers.find(layer => layer.id === 'layer').typed_notes, 'shared-secret',
        'searchable notes must remain readable when ink is hidden');
      assert.equal(detail.data.layers.find(layer => layer.id === 'layer').draw_asset_id, null);
      assert.deepEqual(keys(await search('shared-secret', 'public', null)), []);
      await db.prepare("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='writer'").run();
      assert.deepEqual(keys(await search('shared-secret', 'shared')), []);
      await db.prepare("UPDATE items SET topic_id='a-private' WHERE id='source-unknown'").run();
      const privateTopic = (await search('向量', 'public', null)).items.find(hit => hit.id === unknownEntry);
      assert.equal(privateTopic.topic_id, null);
      assert.equal(privateTopic.topic_label, null);
      assert.deepEqual(keys(await search('secret-curriculum', 'public', null)), []);
      await db.prepare("UPDATE collection_grants SET revoked_at=NULL WHERE id='writer'").run();
      await addSource('contributor-source', 'c', '貢獻者向量題');
      const contributed = await call('/collections/subscribed/items', 'c', 'POST', { item_id: 'contributor-source' });
      assert.equal(contributed.status, 201, JSON.stringify(contributed.data));
      assert.ok(keys(await search('貢獻者向量題', 'public', null)).includes(`public:${contributed.data.entry_id}`));
      await db.prepare("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='writer'").run();
      assert.deepEqual(keys(await search('貢獻者向量題', 'public', null)), []);
      assert.deepEqual(keys(await search('貢獻者向量題', 'shared')), []);
      await db.prepare("UPDATE collection_grants SET revoked_at=NULL WHERE id='writer'").run();
      assert.ok(!JSON.stringify(privateTopic).includes('private-secret'));
      await db.prepare("UPDATE assets SET state='gc_pending' WHERE id='image-source-unknown'").run();
      assert.ok(!keys(await search('向量', 'public', null)).includes(`public:${unknownEntry}`));
      await db.prepare("UPDATE assets SET state='ready' WHERE id='image-source-unknown'").run();
      await db.prepare("UPDATE collection_items SET state='removed' WHERE id=?").bind(unknownEntry).run();
      assert.ok(!keys(await search('向量', 'public', null)).includes(`public:${unknownEntry}`));
      await db.prepare("UPDATE collection_items SET state='included',generation=generation+1 WHERE id=?").bind(unknownEntry).run();
      assert.ok(keys(await search('向量', 'public', null)).includes(`public:${unknownEntry}`));
      await db.prepare("UPDATE collection_items SET generation=generation+1 WHERE id=?").bind(subscribedEntry).run();
      assert.deepEqual(keys(await search('shared-secret', 'shared')), [], 'old generation notes stay hidden');
      await db.prepare("UPDATE collection_items SET generation=generation-1 WHERE id=?").bind(subscribedEntry).run();
    });
    await t.test('saved snapshot, retained notes and private workspace survive revocation and deletion', async () => {
      await db.prepare("UPDATE collection_grants SET revoked_at=NULL WHERE id='writer'").run();
      const saved = await call('/saved', 'b', 'POST', { entry_id: subscribedEntry, topic_id: 'vector' });
      assert.equal(saved.status, 201, JSON.stringify(saved.data));
      const savedId = saved.data.saved_id;
      await db.prepare("UPDATE personal_workspaces SET typed_notes='personal-download-note' WHERE saved_ref_id=?").bind(savedId).run();
      await db.prepare("UPDATE saved_refs SET personal_tags=? WHERE id=?").bind('["personal-tag"]',savedId).run();
      assert.deepEqual(keys(await search('personal-download-note')), [`saved:${savedId}`]);
      assert.deepEqual(keys(await search('shared-secret', 'mine', 'b', '&origin=saved')), [`saved:${savedId}`]);
      assert.deepEqual(keys(await search('向量', 'mine', 'b', '&origin=saved&topic_id=math&tag=personal-tag')), [`saved:${savedId}`]);
      await db.prepare("UPDATE items SET source='updated-live-source',keywords=? WHERE id='source-subscribed'")
        .bind('["updated-tag"]').run();
      assert.deepEqual(keys(await search('updated-live-source', 'mine')), []);
      assert.deepEqual(keys(await search('updated-live-source', 'shared')), [`shared:${subscribedEntry}`]);
      const liveHit = (await search('updated-live-source', 'shared')).items[0];
      assert.equal(liveHit.saved_id, savedId);
      await db.prepare("UPDATE collections SET lifecycle='suspended' WHERE id='subscribed'").run();
      assert.deepEqual(keys(await search('updated-live-source', 'shared')), []);
      assert.deepEqual(keys(await search('題目集-subscribed', 'public', null)), []);
      assert.deepEqual(keys(await search('shared-secret')), [`saved:${savedId}`]);
      await db.prepare("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='viewer'").run();
      assert.ok(!keys(await search('向量', 'shared')).includes(`shared:${invitedEntry}`));
      await grant('second-viewer', 'invited', 'b');
      assert.ok(keys(await search('向量', 'shared')).includes(`shared:${invitedEntry}`),
        'one revoked grant must not cancel another valid grant');
      await db.prepare("UPDATE collection_grants SET expires_at='2000-01-01T00:00:00Z' WHERE id='second-viewer'").run();
      assert.ok(!keys(await search('向量', 'shared')).includes(`shared:${invitedEntry}`));
      await db.prepare("DELETE FROM asset_refs WHERE item_id='source-subscribed'").run();
      await db.prepare("DELETE FROM items WHERE id='source-subscribed'").run();
      assert.deepEqual(keys(await search('personal-download-note')), [`saved:${savedId}`]);
      assert.deepEqual(keys(await search('shared-secret', 'mine', 'd')), []);
    });
    await t.test('FTS updates replace legacy duplicates and preserve current notes and OCR', async () => {
      const patched = await call('/problems/own/tags', 'b', 'PATCH', { op: 'add', tag: '新標籤' });
      assert.equal(patched.status, 200, JSON.stringify(patched.data));
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM items_fts WHERE id='own'").first()).n, 1);
      const index = await db.prepare("SELECT * FROM items_fts WHERE id='own'").first();
      assert.equal(index.problem_text, '洛倫茲力 magnetic particle');
      assert.equal(index.typed_notes, 'private-secret');
      const changed = await call('/problems/own', 'b', 'PUT', { source: '換名後的題目',
        typed_notes: 'new-private-note', expected_notes_seq: 0 });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
      assert.deepEqual(keys(await search('新標籤')), ['owned:own']);
      assert.deepEqual(keys(await search('new-private-note')), ['owned:own']);
      assert.deepEqual(keys(await search('換名後')), ['owned:own']);
      assert.deepEqual(keys(await search('洛倫茲力')), ['owned:own']);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM items_fts WHERE id='own'").first()).n, 1);
    });
  } finally {
    if (mf) await mf.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
