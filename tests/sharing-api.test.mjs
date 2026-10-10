import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';

test('contributor live source revokes while subscriber download survives', async () => {
  const dir=await mkdtemp(join(tmpdir(),'redolve-sharing-'));
  let mf;
  try{
    const bundle=join(dir,'worker.mjs');
    await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',
      target:'es2022',outfile:bundle,logLevel:'silent'});
    mf=new Miniflare({scriptPath:bundle,modules:true,
      compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],
      d1Databases:['DB'],r2Buckets:['STORAGE'],
      kvNamespaces:['KV'],bindings:{JWT_SECRET:'integration-secret'}});
    const db=await mf.getD1Database('DB');
    const storage=await mf.getR2Bucket('STORAGE');
    const schema=(await readFile('worker/schema.sql','utf8')).replace(/^\uFEFF/,'')
      .replace(/^\s*--[^\r\n]*$/gm,'');
    let statement='',inTrigger=false;
    for(const line of schema.split(/\r?\n/)){
      const trimmed=line.trim();
      if(!trimmed)continue;
      if(/^CREATE TRIGGER/i.test(trimmed))inTrigger=true;
      statement+=` ${trimmed}`;
      if((inTrigger&&/^END;$/i.test(trimmed))||(!inTrigger&&trimmed.endsWith(';'))){
        await db.exec(statement.trim());
        statement='';inTrigger=false;
      }
    }
    const users=[['a','a@example.test'],['b','b@example.test'],['d','d@example.test']];
    for(const [id,email] of users){
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(id,email).run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)')
        .bind(`session-${id}`,id,Math.floor(Date.now()/1000)+3600).run();
    }
    const token={};
    for(const [id,email] of users)
      token[id]=await sign({sub:id,email,sid:`session-${id}`,exp:Math.floor(Date.now()/1000)+3600},
        'integration-secret');
    const call=async(path,user,method='GET',body)=>{
      const res=await mf.dispatchFetch(`https://redolve.test${path}`,{
        method,headers:{Authorization:`Bearer ${token[user]}`,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        body:body===undefined?undefined:JSON.stringify(body),
      });
      const data=await res.json().catch(()=>({}));
      return {status:res.status,data};
    };
    const created=await call('/api/my/collections','a','POST',{
      title:'Shared',public_name:'Teacher',visibility:'public',listed:true,activate:true,
    });
    assert.equal(created.status,201,JSON.stringify(created.data));
    const collectionId=created.data.id;
    assert.equal((await call('/api/me/public-profile','b','PUT',{display_name:'Contributor'})).status,200);
    const invite=await call(`/api/collections/${collectionId}/invitations`,'a','POST',{
      email:'b@example.test',role:'contributor',
    });
    assert.equal(invite.status,201,JSON.stringify(invite.data));
    assert.equal((await call('/api/invitations/accept','b','POST',{token:invite.data.token})).status,200);
    await storage.put('images/source.jpg',new Uint8Array([1,2,3]),
      {httpMetadata:{contentType:'image/jpeg'}});
    await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)')
      .bind('images/source.jpg','images/source.jpg').run();
    await db.prepare('INSERT INTO taxonomies(id,user_id,label,level) VALUES(?,?,?,?)')
      .bind('private-topic','b','My private category',0).run();
    await db.prepare(`INSERT INTO items(id,user_id,image_url,source,status,topic_id) VALUES(?,?,?,?,?,?)`)
      .bind('source','b','images/source.jpg','Original','unsolved','private-topic').run();
    await db.prepare(`INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES(?,?,?,'source_image')`)
      .bind('root','images/source.jpg','source').run();
    const add=await call(`/api/collections/${collectionId}/items`,'b','POST',{item_id:'source'});
    assert.equal(add.status,201,JSON.stringify(add.data));
    const entryId=add.data.entry_id;
    const publicEntry=await call(`/api/collections/${collectionId}/items/${entryId}`,'d');
    assert.equal(publicEntry.data.source.topic_id,null);
    assert.equal(publicEntry.data.source.topic_label,null,'private taxonomy label must stay private');
    const publicCollections=await call('/api/public/collections?q=Shared','d');
    assert.equal(publicCollections.status,200,JSON.stringify(publicCollections.data));
    assert.ok(publicCollections.data.collections.some(row=>row.id===collectionId));
    const publicItems=await call('/api/public/items?q=Original','d');
    assert.equal(publicItems.status,200,JSON.stringify(publicItems.data));
    assert.ok(publicItems.data.items.some(row=>row.entry_id===entryId));
    const anonymous=await mf.dispatchFetch('https://redolve.test/api/public/items?q=Original');
    assert.equal(anonymous.status,200,'listed public discovery is readable without login');
    const imageEdit=await call('/api/problems/source','b','PUT',{image_url:'other-image'});
    assert.equal(imageEdit.status,400,'published source image cannot be replaced');
    const cannotAddOther=await call(`/api/collections/${collectionId}/items`,'a','POST',{item_id:'source'});
    assert.equal(cannotAddOther.status,409,'owner cannot add contributor private original');
    assert.equal((await call(`/api/subscriptions/${collectionId}`,'d','PUT')).status,200);
    const star=await call(`/api/subscriptions/${collectionId}/items/${entryId}/star`,'d','PUT',{starred:true});
    assert.equal(star.status,200,JSON.stringify(star.data));
    assert.equal((await call(`/api/collections/${collectionId}?state=starred`,'d')).data.items[0].id,entryId);
    assert.equal((await call('/api/saved','d')).data.items.length,0,'a star is not a download');
    await call(`/api/subscriptions/${collectionId}`,'d','DELETE');
    await call(`/api/subscriptions/${collectionId}`,'d','PUT');
    assert.equal((await call(`/api/collections/${collectionId}?state=starred`,'d')).data.items[0].id,entryId,'stars survive unsubscribe without becoming downloads');
    const originalBrowse=await call(`/api/search?scope=shared&contributing=yes&collection_id=${collectionId}&browse=1`,'b');
    assert.equal(originalBrowse.status,200,JSON.stringify(originalBrowse.data));
    assert.ok(originalBrowse.data.items.some(i=>i.id===entryId));
    assert.equal((await call(`/api/search?scope=shared&contributing=yes&collection_id=${collectionId}&browse=1`,'d')).data.items.length,0,
      'a subscriber has no contributing search scope');
    const progressPath='/api/collections/'+collectionId+'/items/'+entryId+'/progress';
    const progressAction=(user,action,version,generation=1)=>call(progressPath,user,'PUT',{action,expected_version:version,expected_generation:generation});
    assert.equal((await progressAction('d','resolve',0)).status,404,'viewer cannot write progress');
    const done=await progressAction('b','resolve',0);
    assert.equal(done.status,200,JSON.stringify(done.data));assert.equal(done.data.progress.status,'resolved');
    assert.equal(done.data.progress.review_count,1);
    assert.equal((await progressAction('b','archive',0)).status,409,'stale progress must not overwrite');
    assert.equal((await progressAction('b','archive',1,2)).status,409,'stale generation must not write');
    const archived=await progressAction('b','archive',1);assert.equal(archived.data.progress.status,'archived');
    const browseProgress='/api/search?scope=shared&contributing=yes&collection_id='+collectionId+'&browse=1';
    assert.equal((await call(browseProgress+'&status=archived','b')).data.items[0].id,entryId);
    assert.equal((await call(browseProgress+'&exclude_archived=yes','b')).data.items.length,0);
    assert.equal((await call(browseProgress+'&status=unsolved','a')).data.items[0].id,entryId,'owner progress is independent');
    assert.equal((await db.prepare("SELECT status FROM items WHERE id='source'").first()).status,'unsolved');
    assert.equal((await call('/api/collections/'+collectionId+'/items/'+entryId,'d')).data.progress,undefined,'private progress stays private');
    const restored=await progressAction('b','archive',2);assert.equal(restored.data.progress.status,'resolved');
    await db.prepare('UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE collection_id=? AND user_id=?').bind(collectionId,'b').run();
    assert.equal((await progressAction('b','resolve',3)).status,404,'revoked contributor cannot write');
    await db.prepare('UPDATE collection_grants SET revoked_at=NULL WHERE collection_id=? AND user_id=?').bind(collectionId,'b').run();
    assert.equal((await call('/api/collections/'+collectionId+'/items/'+entryId,'b')).data.progress.status,'resolved','progress survives restored access');
    const initialFeed=await call('/api/subscriptions/feed','d');
    assert.equal(initialFeed.data.items.length,0,'pre-subscription entries are not new');
    await storage.put('images/second.jpg',new Uint8Array([4,5,6]));
    await db.prepare('INSERT INTO taxonomies(id,label,level) VALUES(?,?,?)')
      .bind('math','Math',0).run();
    await db.prepare('INSERT INTO taxonomies(id,parent_id,label,level) VALUES(?,?,?,?)')
      .bind('algebra','math','Algebra',1).run();
    await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)')
      .bind('images/second.jpg','images/second.jpg').run();
    await db.prepare(`INSERT INTO items(id,user_id,image_url,source,status,topic_id,keywords) VALUES(?,?,?,?,?,?,?)`)
      .bind('second','b','images/second.jpg','New question','unsolved','algebra',
        '["algebra-tag"]').run();
    await db.prepare(`INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES(?,?,?,'source_image')`)
      .bind('second-root','images/second.jpg','second').run();
    const candidates=await call(`/api/collections/${collectionId}/candidates?q=New`,'b');
    assert.equal(candidates.status,200,JSON.stringify(candidates.data));
    assert.deepEqual(candidates.data.items.map(item=>item.id),['second']);
    assert.deepEqual((await call(`/api/collections/${collectionId}/candidates?q=%25`,'b'))
      .data.items,[],'search wildcard must be treated as literal text');
    assert.equal((await call(`/api/collections/${collectionId}/candidates`,'a')).data.items.length,0,
      'owner cannot list contributor private originals');
    const batch=await call(`/api/collections/${collectionId}/items/batch`,'b','POST',
      {item_ids:['second','source','missing']});
    assert.equal(batch.status,200,JSON.stringify(batch.data));
    assert.deepEqual(batch.data.results.map(row=>row.status||row.error),
      ['included','already_included','SOURCE_UNAVAILABLE']);
    const secondAdded={data:batch.data.results[0]};
    assert.equal((await call(`/api/collections/${collectionId}/candidates?q=New`,'b')).data.items.length,0);
    const officialDownload=await call('/api/saved','d','POST',{entry_id:secondAdded.data.entry_id});
    assert.equal(officialDownload.status,201,JSON.stringify(officialDownload.data));
    assert.equal((await call(`/api/saved/${officialDownload.data.saved_id}`,'d')).data.saved.personal_topic_id,'algebra',
      'official source classification is retained without AI');
    await call(`/api/saved/${officialDownload.data.saved_id}`,'d','DELETE');
    assert.equal((await call(`/api/collections/${collectionId}/items/batch`,'b','POST',
      {item_ids:['second','second']})).status,400);
    const firstWithNeighbor=await call(`/api/collections/${collectionId}/items/${entryId}`,'d');
    assert.equal(firstWithNeighbor.data.neighbors.next,secondAdded.data.entry_id);
    const secondWithNeighbor=await call(`/api/collections/${collectionId}/items/${secondAdded.data.entry_id}`,'d');
    assert.equal(secondWithNeighbor.data.neighbors.previous,entryId);
    const beforeOrder=await call(`/api/collections/${collectionId}`,'a');
    const moved=await call(`/api/collections/${collectionId}/items/${entryId}/order`,
      'a','PATCH',{direction:'down',expected_version:beforeOrder.data.collection.row_version});
    assert.equal(moved.status,200,JSON.stringify(moved.data));
    const reordered=await call(`/api/collections/${collectionId}`,'d');
    assert.equal(reordered.data.items[0].id,secondAdded.data.entry_id);
    const newFeed=await call('/api/subscriptions/feed','d');
    assert.equal(newFeed.data.items.length,1,'new entry appears in subscriber feed');
    assert.equal(newFeed.data.items[0].title,'New question');
    assert.equal((await call('/api/subscriptions','d')).data.subscriptions[0].unread_count,1);
    const latestOrder=await call(`/api/collections/${collectionId}`,'a');
    await call(`/api/collections/${collectionId}/items/${entryId}/order`,'a','PATCH',{direction:'up',expected_version:latestOrder.data.collection.row_version});
    assert.equal((await call(`/api/collections/${collectionId}`,'d')).data.items[0].id,entryId);
    assert.equal((await call(`/api/collections/${collectionId}?sort=recent`,'d')).data.items[0].id,secondAdded.data.entry_id,'latest additions do not follow manual ordering');
    const parentTopicFeed=await call('/api/subscriptions/feed?topic_id=math','d');
    assert.equal(parentTopicFeed.status,200,JSON.stringify(parentTopicFeed.data));
    assert.equal(parentTopicFeed.data.items.length,1,'subject filter includes nested unit');
    const collectionTopic=await call(`/api/collections/${collectionId}?topic_id=math`,'d');
    assert.equal(collectionTopic.status,200,JSON.stringify(collectionTopic.data));
    assert.equal(collectionTopic.data.items.length,1,'collection filter includes nested unit');
    assert.equal(collectionTopic.data.items[0].title,'New question');
    assert.equal((await call(`/api/collections/${collectionId}?tag=algebra-tag`,'d')).data.items.length,1);
    assert.equal((await call(`/api/collections/${collectionId}?state=unread`,'d')).data.items.length,1);
    assert.equal((await call('/api/subscriptions/read-all','d','POST',
      {read_all_token:'forged'})).status,409);
    assert.equal((await call('/api/subscriptions/read-all','d','POST',
      {read_all_token:newFeed.data.read_all_token})).status,200);
    assert.equal((await call('/api/subscriptions/feed','d')).data.items.length,0);
    assert.equal((await call('/api/subscriptions','d')).data.subscriptions[0].unread_count,0);
    assert.equal((await call(`/api/collections/${collectionId}?state=read`,'d')).data.items.length,1);
    assert.equal((await call(`/api/collections/${collectionId}/items/${entryId}`,'d')).status,200);
    const sharedNotes=await call(`/api/collections/${collectionId}/items/${entryId}/layers/notes`,
      'b','PUT',{typed_notes:'shared explanation',expected_seq:0});
    assert.equal(sharedNotes.status,200,JSON.stringify(sharedNotes.data));
    const wrongGeneration=await call(`/api/collections/${collectionId}/items/${entryId}/layers/notes`,
      'b','PUT',{typed_notes:'old generation draft',expected_seq:1,expected_generation:99});
    assert.equal(wrongGeneration.status,409,'drafts cannot move to a different entry generation');
    const privateLayer=await call(`/api/collections/${collectionId}/items/${entryId}`,'d');
    assert.equal(privateLayer.data.layers.length,0,'reader cannot see contributor notes before display is enabled');
    const drawing={strokes:[],eraserMasks:[],baseWidth:600,baseHeight:500};
    const written=await call(`/api/collections/${collectionId}/items/${entryId}/layers/draw`,
      'b','PUT',{draw_data:drawing,expected_seq:0});
    assert.equal(written.status,200,JSON.stringify(written.data));
    const viewerWrite=await call(`/api/collections/${collectionId}/items/${entryId}/layers/draw`,
      'd','PUT',{draw_data:drawing,expected_seq:0});
    assert.equal(viewerWrite.status,404,'subscriber cannot write a shared layer');
    const stale=await call(`/api/collections/${collectionId}/items/${entryId}/layers/draw`,
      'b','PUT',{draw_data:drawing,expected_seq:0});
    assert.equal(stale.status,409,'stale draw update must not overwrite');
    const saved=await call('/api/saved','d','POST',{entry_id:entryId});
    assert.equal(saved.status,201,JSON.stringify(saved.data));
    const savedId=saved.data.saved_id;
    const discoverSaved=await call('/api/public/items','d');
    assert.equal(discoverSaved.data.items.find(i=>i.entry_id===entryId).saved_id,savedId,'public browsing reports own saved copy');
    assert.equal(discoverSaved.data.items.find(i=>i.entry_id===entryId).is_subscribed,1);
    await db.prepare("UPDATE saved_refs SET classification_state='failed' WHERE id=?").bind(savedId).run();
    assert.equal((await call(`/api/saved/${savedId}/retry-classification`,'a','POST',{})).status,409,'another user cannot retry personal classification');
    assert.equal((await call(`/api/saved/${savedId}/retry-classification`,'d','POST',{})).status,200);
    const inspect=await call(`/api/saved/inspect?entry_id=${entryId}`,'d');
    assert.equal(inspect.data.existing_id,savedId);
    const recentSaved=await call('/api/search?scope=mine&origin=saved&browse=1','d');
    assert.ok(recentSaved.data.items.some(i=>i.id===savedId),'empty search lists saved questions immediately');
    const updatePreview=await call(`/api/saved/${savedId}/source-update`,'d');
    assert.equal(updatePreview.data.available,true);
    assert.equal(updatePreview.data.changed,false);
    assert.equal((await call(`/api/saved/${savedId}/refresh-source`,'d','POST',
      {content_seq:999,shared_seq:0})).status,409,'do not silently refresh a newer version than previewed');
    const savedOnly=await call(`/api/collections/${collectionId}?saved=yes`,'d');
    assert.equal(savedOnly.data.items.length,1);
    assert.equal(savedOnly.data.items[0].id,entryId);
    const category=await call(`/api/saved/${savedId}`,'d','PATCH',
      {personal_topic_id:'algebra',expected_version:(await call(`/api/saved/${savedId}`,'d')).data.saved.row_version});
    assert.equal(category.status,200,JSON.stringify(category.data));
    const savedBySubject=await call('/api/saved?topic_id=math','d');
    assert.equal(savedBySubject.status,200,JSON.stringify(savedBySubject.data));
    assert.ok(savedBySubject.data.items.some(item=>item.id===savedId),
      'saved item in algebra must appear under parent math filter');
    await db.prepare('INSERT INTO assets(id,storage_key) VALUES(?,?)')
      .bind('images/my-own.jpg','images/my-own.jpg').run();
    await db.prepare(`INSERT INTO items(id,user_id,image_url,source,topic_id,status)
      VALUES(?,?,?,?,?,?)`).bind('my-own','d','images/my-own.jpg','My original','math','unsolved').run();
    await db.prepare(`INSERT INTO asset_refs(id,asset_id,item_id,role)
      VALUES(?,?,?,'source_image')`).bind('item:my-own','images/my-own.jpg','my-own').run();
    const firstNotebook=await call('/api/my/notebook?topic_id=math&limit=1','d');
    assert.equal(firstNotebook.status,200,JSON.stringify(firstNotebook.data));
    assert.equal(firstNotebook.data.items.length,1);
    assert.ok(firstNotebook.data.next_cursor);
    const notebookCursor=firstNotebook.data.next_cursor;
    const secondNotebook=await call(`/api/my/notebook?topic_id=math&limit=1&before_time=${notebookCursor.sort_time}&before_id=${notebookCursor.id}`,'d');
    assert.equal(secondNotebook.status,200,JSON.stringify(secondNotebook.data));
    assert.deepEqual(new Set([...firstNotebook.data.items,...secondNotebook.data.items].map(item=>item.origin)),
      new Set(['owned','saved']));
    assert.equal((await call('/api/my/notebook?origin=owned','d')).data.items.every(item=>item.origin==='owned'),true);
    const dashboard=await call('/api/dashboard','d');
    assert.equal(dashboard.status,200,JSON.stringify(dashboard.data));
    const firstSaved=await call(`/api/saved/${savedId}`,'d');
    assert.equal(firstSaved.data.layers.length,0,'initial download must honor hidden layers');
    assert.equal(firstSaved.data.snapshot.source_topic_label,null,
      'source author private taxonomy must not enter downloaded projection');
    const personalNote=await call(`/api/saved/${savedId}/workspace/notes`,'d','PUT',
      {typed_notes:'my own correction',expected_seq:0});
    assert.equal(personalNote.status,200,JSON.stringify(personalNote.data));
    const collectionBeforeSettings=await call(`/api/collections/${collectionId}`,'a');
    const publicLayers=await call(`/api/collections/${collectionId}`,'a','PATCH',{
      expected_version:collectionBeforeSettings.data.collection.row_version,
      show_shared_ink:true,show_shared_notes:true,
    });
    assert.equal(publicLayers.status,200,JSON.stringify(publicLayers.data));
    const shown=await call(`/api/collections/${collectionId}/items/${entryId}`,'d');
    assert.equal(shown.data.layers.length,1);
    assert.equal(shown.data.layers[0].typed_notes,'shared explanation');
    const changed=await call('/api/problems/source','b','PUT',{source:'Revised source'});
    assert.equal(changed.status,200,JSON.stringify(changed.data));
    assert.equal((await call('/api/subscriptions/feed','d')).data.items.length,0,
      'source metadata change is not a new item');
    const refreshed=await call(`/api/saved/${savedId}/refresh-source`,'d','POST',{});
    assert.equal(refreshed.status,200,JSON.stringify(refreshed.data));
    const afterRefresh=await call(`/api/saved/${savedId}`,'d');
    assert.equal(afterRefresh.data.snapshot.source_title,'Revised source');
    assert.equal(afterRefresh.data.layers.length,1);
    assert.equal(afterRefresh.data.workspace.id,firstSaved.data.workspace.id);
    assert.equal(afterRefresh.data.workspace.typed_notes,'my own correction');
    assert.equal(afterRefresh.data.saved.personal_topic_id,'algebra');
    const before=await mf.dispatchFetch(`https://redolve.test/api/saved/${savedId}/image`,{
      headers:{Authorization:`Bearer ${token.d}`},
    });
    assert.equal(before.status,200);
    const grants=await call(`/api/collections/${collectionId}/grants`,'a');
    const grant=grants.data.grants.find(g=>g.user_id==='b');
    assert.ok(grant);
    await db.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,user_id)
      VALUES(?,?,'user','viewer',?)`).bind('duplicate-viewer',collectionId,'b').run();
    const grouped=await call(`/api/collections/${collectionId}/grants`,'a');
    assert.equal(grouped.data.grants.filter(g=>g.user_id==='b').length,1,
      'management lists one member even with multiple grants');
    assert.equal((await call(`/api/collections/${collectionId}/grants/${grant.id}`,'a','DELETE')).status,200);
    assert.equal((await call(`/api/collections/${collectionId}/grants`,'a')).data.grants.length,0,
      'removing a member revokes all their grants');
    const detached=await call('/api/my/detached-layers','b');
    assert.equal(detached.status,200,JSON.stringify(detached.data));
    assert.equal(detached.data.layers.length,1);
    assert.equal(detached.data.layers[0].typed_notes,'shared explanation');
    const detachedDraw=await mf.dispatchFetch(
      `https://redolve.test/api/my/detached-layers/${detached.data.layers[0].id}/draw`,
      {headers:{Authorization:`Bearer ${token.b}`}});
    assert.equal(detachedDraw.status,200);
    const noDetached=await call('/api/my/detached-layers','d');
    assert.equal(noDetached.data.layers.length,0);
    const live=await call(`/api/collections/${collectionId}/items/${entryId}`,'d');
    assert.equal(live.status,404);
    const retained=await mf.dispatchFetch(`https://redolve.test/api/saved/${savedId}/image`,{
      headers:{Authorization:`Bearer ${token.d}`},
    });
    assert.equal(retained.status,200);
    assert.deepEqual([...new Uint8Array(await retained.arrayBuffer())],[1,2,3]);
    const retainedDetail=await call(`/api/saved/${savedId}`,'d');
    assert.equal(retainedDetail.data.source.available,false);
    assert.equal(retainedDetail.data.snapshot.source_title,'Revised source');
    const savedLayer=await mf.dispatchFetch(
      `https://redolve.test/api/saved/${savedId}/layers/${shown.data.layers[0].id}/draw`,
      {headers:{Authorization:`Bearer ${token.d}`}});
    assert.equal(savedLayer.status,200,'acquired reference ink survives author revocation');
    const deletedSource=await call('/api/problems/source','b','DELETE');
    assert.equal(deletedSource.status,200,JSON.stringify(deletedSource.data));
    assert.equal((await call(`/api/collections/${collectionId}/items/${entryId}`,'d')).status,404);
    const downloadedAfterDelete=await mf.dispatchFetch(`https://redolve.test/api/saved/${savedId}/image`,{
      headers:{Authorization:`Bearer ${token.d}`},
    });
    assert.equal(downloadedAfterDelete.status,200,'downloaded image survives source deletion');
  }finally{
    await mf?.dispose();
    await rm(dir,{recursive:true,force:true});
  }
});
