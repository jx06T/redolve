import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';

test('collection visibility, grants, link cookies and revocation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'redolve-sharing-access-'));
  let mf;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm',
      platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: bundle, modules: true,
      compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      r2Buckets: ['STORAGE'], kvNamespaces: ['KV'],
      bindings: { JWT_SECRET: 'access-test-secret', ADMIN_EMAILS:'owner@example.test' } });
    const db = await mf.getD1Database('DB');
    const storage=await mf.getR2Bucket('STORAGE');
    const schema = (await readFile('worker/schema.sql', 'utf8')).replace(/^\uFEFF/, '')
      .replace(/^\s*--[^\r\n]*$/gm, '');
    let statement = '', inTrigger = false;
    for (const line of schema.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^CREATE TRIGGER/i.test(trimmed)) inTrigger = true;
      statement += ` ${trimmed}`;
      if ((inTrigger && /^END;$/i.test(trimmed)) || (!inTrigger && trimmed.endsWith(';'))) {
        await db.exec(statement.trim());
        statement = ''; inTrigger = false;
      }
    }
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const tokens = {};
    for (const [id, email] of [['owner', 'owner@example.test'], ['viewer', 'viewer@example.test'],
      ['contributor', 'contributor@example.test']]) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(id, email).run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)')
        .bind(`session-${id}`, id, expires).run();
      tokens[id] = await sign({ sub: id, email, sid: `session-${id}`, exp: expires },
        'access-test-secret');
    }
    const call = async (path, user, method = 'GET', body, headers = {}) => {
      const response = await mf.dispatchFetch(`https://redolve.test${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json().catch(() => ({})),
        cookie: response.headers.get('Set-Cookie') };
    };
    const unknownApi=await call('/api/this-route-does-not-exist');
    assert.equal(unknownApi.status,404);
    assert.equal(unknownApi.data.error?.code,'NOT_FOUND');
    await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)')
      .bind('asset-present','images/present.jpg').run();
    await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)')
      .bind('asset-missing','images/missing.jpg').run();
    await storage.put('images/present.jpg',new Uint8Array([1]));
    await storage.put('images/orphan.jpg',new Uint8Array([2]));
    assert.equal((await call('/api/admin/assets/audit','viewer')).status,403);
    assert.equal((await call('/api/admin/assets/reverse-audit','viewer')).status,403);
    const assetAudit=await call('/api/admin/assets/audit','owner');
    assert.equal(assetAudit.status,200,JSON.stringify(assetAudit.data));
    assert.deepEqual(assetAudit.data.missing_r2,['asset-missing']);
    assert.equal(assetAudit.data.checked,2);
    assert.equal(assetAudit.data.next_cursor,null);
    const reverseAudit=await call('/api/admin/assets/reverse-audit','owner');
    assert.equal(reverseAudit.status,200,JSON.stringify(reverseAudit.data));
    assert.deepEqual(reverseAudit.data.orphan_r2,['images/orphan.jpg']);

    const privateSet = await call('/api/my/collections', 'owner', 'POST', {
      title: 'Private', public_name: 'Teacher', visibility: 'restricted', activate: true,
    });
    assert.equal(privateSet.status, 201, JSON.stringify(privateSet.data));
    const privatePath = `/api/collections/${privateSet.data.id}`;
    assert.equal((await call(privatePath)).status, 404);
    assert.equal((await call(privatePath, 'viewer')).status, 404);
    const invitation = await call(`${privatePath}/invitations`, 'owner', 'POST', {
      email: 'viewer@example.test', role: 'viewer',
    });
    assert.equal(invitation.status, 201, JSON.stringify(invitation.data));
    assert.equal((await call('/api/invitations/accept', 'viewer', 'POST',
      { token: invitation.data.token })).status, 200);
    assert.equal((await call(privatePath, 'viewer')).status, 200);
    assert.equal((await call(`${privatePath}/stats`,'viewer')).status,404);
    assert.equal((await call(`${privatePath}/stats`,'owner')).data.stats.contributor_count,0);
    assert.equal((await call(`${privatePath}/items`, 'viewer', 'POST',
      { item_id: 'anything' })).status, 403);
    assert.equal((await call(`${privatePath}/candidates`, 'viewer')).status,404);
    assert.equal((await call(`${privatePath}/items/batch`, 'viewer', 'POST',
      {item_ids:['anything']})).status,404);
    assert.equal((await call(`${privatePath}/links`, 'viewer', 'POST')).status, 404);

    const grant = (await call(`${privatePath}/grants`, 'owner')).data.grants
      .find((row) => row.user_id === 'viewer');
    assert.ok(grant);
    await db.prepare("UPDATE collection_grants SET expires_at='2000-01-01' WHERE id=?")
      .bind(grant.id).run();
    assert.equal((await call(privatePath, 'viewer')).status, 404);
    await db.prepare('UPDATE collection_grants SET expires_at=NULL WHERE id=?')
      .bind(grant.id).run();
    assert.equal((await call(privatePath, 'viewer')).status, 200);
    assert.equal((await call(`${privatePath}/grants/${grant.id}`, 'owner', 'DELETE')).status, 200);
    assert.equal((await call(privatePath, 'viewer')).status, 404);

    const linkSet = await call('/api/my/collections', 'owner', 'POST', {
      title: 'Link only', public_name: 'Teacher', visibility: 'link', activate: true,
    });
    assert.equal(linkSet.status, 201, JSON.stringify(linkSet.data));
    const linkPath = `/api/collections/${linkSet.data.id}`;
    assert.equal((await call(linkPath)).status, 404);
    assert.equal((await call(linkPath, 'viewer')).status, 404);
    const link = await call(`${linkPath}/links`, 'owner', 'POST');
    assert.equal(link.status, 201, JSON.stringify(link.data));
    const claim = await call('/api/share-links/claim', undefined, 'POST',
      { token: link.data.token });
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
    assert.ok(claim.cookie?.includes(`rdv_collection_${linkSet.data.id}=`));
    assert.equal((await call(linkPath, undefined, 'GET', undefined,
      { Cookie: claim.cookie.split(';', 1)[0] })).status, 200);
    assert.equal((await call('/api/share-links/claim', 'viewer', 'POST',
      { token: link.data.token })).status, 200);
    assert.equal((await call(linkPath, 'viewer')).status, 200,
      'signed-in claimant can revisit without the cookie');
    assert.equal((await call(`${linkPath}/links/${link.data.id}`, 'owner', 'DELETE')).status, 200);
    assert.equal((await call(linkPath, 'viewer')).status, 404);
    assert.equal((await call(linkPath, undefined, 'GET', undefined,
      { Cookie: claim.cookie.split(';', 1)[0] })).status, 404);
    assert.equal((await call('/api/share-links/claim', undefined, 'POST',
      { token: link.data.token })).status, 404);

    const publicSet = await call('/api/my/collections', 'owner', 'POST', {
      title: 'Public', public_name: 'Teacher', visibility: 'public', listed: true, activate: true,
    });
    assert.equal(publicSet.status, 201, JSON.stringify(publicSet.data));
    assert.equal((await call(`/api/collections/${publicSet.data.id}`)).status, 200);
    const publicPath=`/api/collections/${publicSet.data.id}`;
    const contributorInvite=await call(`${publicPath}/invitations`,'owner','POST',{
      email:'contributor@example.test',role:'contributor',
    });
    assert.equal((await call('/api/invitations/accept','contributor','POST',
      {token:contributorInvite.data.token})).status,200);
    assert.equal((await call(`${publicPath}/owner-transfer`,'owner','POST',
      {to_user_id:'viewer'})).status,409,'viewer cannot become owner');
    const transfer=await call(`${publicPath}/owner-transfer`,'owner','POST',
      {to_user_id:'contributor'});
    assert.equal(transfer.status,201,JSON.stringify(transfer.data));
    assert.equal((await call(`${publicPath}/owner-transfer`,'contributor')).data.transfer.to_user_id,
      'contributor');
    await db.prepare("UPDATE owner_transfers SET expires_at='2000-01-01' WHERE collection_id=?")
      .bind(publicSet.data.id).run();
    assert.equal((await call(`${publicPath}/owner-transfer/accept`,'contributor','POST',{})).status,404);
    assert.equal((await call(`${publicPath}/owner-transfer`,'owner','POST',
      {to_user_id:'contributor'})).status,201);
    const accepted=await call(`${publicPath}/owner-transfer/accept`,'contributor','POST',{});
    assert.equal(accepted.status,200,JSON.stringify(accepted.data));
    assert.equal((await call(publicPath,'contributor')).data.collection.is_owner,true);
    assert.equal((await call(publicPath,'owner')).data.collection.can_contribute,true,
      'original owner keeps contributor access after handover');
    assert.equal((await call(`${publicPath}/grants`,'owner')).status,404);
    assert.equal((await call(`${publicPath}/grants`,'contributor')).status,200);
  } finally {
    await mf?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
