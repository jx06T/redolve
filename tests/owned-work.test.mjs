import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles} = await build({entryPoints: ['src/services/ownedWorkController.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent'});
const {createOwnedWorkController: create, ownedDraftKey: keyFor} = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const ink = n => ({strokes: Array.from({length: n}, (_, i) => ({color:'#374151',width:2,points:[[i,0,.5],[i,10,.5]]})), eraserMasks:[],calcSpaceHeight:100});
const base = () => ({id:'q',user_id:'alice',draw_seq:7,notes_seq:3,vector_clock:'{"seq":999}',draw_data:JSON.stringify(ink(1)),typed_notes:'cloud'});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve=r;});return {promise, resolve};};
function fixture(overrides = {}, values = new Map()) {
  let cloud = base(), active = true, online = true, failStorage = false;
  const writes = [], reads = [];
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(failStorage)throw Error('quota');values.set(k,v);},
    removeItem:k=>{if(failStorage)throw Error('quota');values.delete(k);}};
  const deps = {storage,active:()=>active,online:()=>online,delay:60000,
    saveInk: async (value, seq) => {writes.push(['ink',seq,value]);if(seq!==cloud.draw_seq+1)throw Error('CONFLICT: draw');cloud={...cloud,draw_data:JSON.stringify(value),draw_seq:seq};return {seq};},
    saveNotes: async (value, seq) => {writes.push(['notes',seq,value]);if(seq!==cloud.notes_seq)throw Error('CONFLICT: notes');cloud={...cloud,typed_notes:value,notes_seq:seq+1};return {notes_seq:seq+1};},
    load:async()=>{reads.push(1);return cloud;},...overrides};
  const key=keyFor('alice','q');const controller=create(key,cloud,deps);controller.restoreLegacy();
  return {controller,key,values,storage,writes,reads,deps,get cloud(){return cloud;},set cloud(v){cloud=v;},
    set active(v){active=v;},set online(v){online=v;},set failStorage(v){failStorage=v;}};
}
test('many strokes coalesce into one consecutive server version using draw_seq', async () => {
  const f=fixture();try{
    for(let n=2;n<20;n++)f.controller.ink(ink(n));
    assert.equal(JSON.parse(f.values.get(f.key)).ink.strokes.length,19);
    await f.controller.flush();
    assert.deepEqual(f.writes.map(x=>x.slice(0,2)),[['ink',8]]);
    assert.equal(f.controller.getState().status,'saved');assert.equal(f.values.has(f.key),false);
    assert.equal(f.reads.length,0,'ordinary saves do not add a GET');
  }finally{f.controller.stop();}
});
test('slow writes serialize later strokes and notes; acknowledgements cannot clear newer content', async () => {
  const gate=deferred();let f;
  f=fixture({saveInk:async(value,seq)=>{f.writes.push(['ink',seq,value]);if(seq===8)await gate.promise;f.cloud={...f.cloud,draw_data:JSON.stringify(value),draw_seq:seq};return {seq};}});
  try{
    f.controller.ink(ink(2));const save=f.controller.flush();
    f.controller.ink(ink(3));f.controller.notes('first');f.controller.notes('latest');
    await f.controller.flush();assert.equal(f.writes.length,1);
    gate.resolve();await save;
    assert.deepEqual(f.writes.map(x=>x.slice(0,2)),[['ink',8],['notes',3],['ink',9]]);
    assert.equal(f.cloud.typed_notes,'latest');assert.equal(f.cloud.draw_seq,9);assert.equal(f.values.size,0);
  }finally{f.controller.stop();}
});
test('slow notes use the acknowledged sequence for the next edit', async () => {
  const gate=deferred();let f;
  f=fixture({saveNotes:async(value,seq)=>{f.writes.push(['notes',seq,value]);if(seq===3)await gate.promise;f.cloud={...f.cloud,typed_notes:value,notes_seq:seq+1};return {notes_seq:seq+1};}});
  try{
    f.controller.notes('one');const save=f.controller.flush();f.controller.notes('two');gate.resolve();await save;
    assert.deepEqual(f.writes.map(x=>x.slice(0,2)),[['notes',3],['notes',4]]);assert.equal(f.cloud.typed_notes,'two');
  }finally{f.controller.stop();}
});
test('reload before debounce restores ink, empty notes and geometry', () => {
  const f=fixture();f.online=false;
  f.controller.ink({...ink(5),calcSpaceHeight:650});f.controller.notes('');f.controller.stop();
  const next=create(f.key,{...base(),draw_seq:10,draw_data:JSON.stringify(ink(2)),typed_notes:'remote'},f.deps);
  try{
    next.restoreLegacy();next.observeCloud(base());
    assert.equal(next.getState().ink.strokes.length,5);assert.equal(next.getState().ink.calcSpaceHeight,650);
    assert.equal(next.getState().notes,'');assert.ok(next.pending());
  }finally{next.stop();}
});
test('real conflict survives reload and requires explicit choice; no blind retry', async () => {
  const f=fixture();try{
    f.controller.ink(ink(5));f.cloud={...f.cloud,draw_seq:8,draw_data:JSON.stringify(ink(3))};
    await f.controller.flush();assert.equal(f.controller.getState().status,'conflict');
    await f.controller.flush();assert.equal(f.writes.length,1);assert.equal(f.cloud.draw_data,JSON.stringify(ink(3)));
    f.controller.stop();const next=create(f.key,f.cloud,f.deps);
    try{next.restoreLegacy();assert.equal(next.getState().ink.strokes.length,5);assert.equal(next.getState().status,'conflict');
      next.keepLocal(f.cloud);await next.flush();assert.equal(f.cloud.draw_seq,9);assert.equal(f.cloud.draw_data,JSON.stringify(ink(5)));
      assert.ok([...f.values.keys()].some(k=>k.includes(':backup:')));
    }finally{next.stop();}
  }finally{f.controller.stop();}
});
test('lost response with later edits reconciles acknowledgement then saves latest local work', async () => {
  let lost=true,f;
  f=fixture({saveInk:async(value,seq)=>{f.writes.push(['ink',seq,value]);f.cloud={...f.cloud,draw_data:JSON.stringify(value),draw_seq:seq};if(lost){lost=false;throw Error('network');}return {seq};}});
  try{
    f.controller.ink(ink(2));await f.controller.flush();assert.equal(f.controller.getState().status,'error');
    f.controller.ink(ink(4));await f.controller.flush();
    assert.deepEqual(f.writes.map(x=>x.slice(0,2)),[['ink',8],['ink',9]]);assert.equal(f.cloud.draw_data,JSON.stringify(ink(4)));
    assert.equal(f.controller.getState().status,'saved');assert.equal(f.reads.length,1);
  }finally{f.controller.stop();}
});
test('legacy blocked IndexedDB work is recovered instead of replaced by cloud', () => {
  const f=fixture();f.controller.stop();const next=create(f.key,base(),f.deps);
  try{assert.equal(next.restoreLegacy({drawData:ink(8),seq:25,typed_notes:'old local',notesSeq:3,blockedReason:'筆跡版本衝突'}),true);
    assert.equal(next.getState().ink.strokes.length,8);assert.equal(next.getState().notes,'old local');
    assert.equal(next.getState().status,'conflict');assert.equal(JSON.parse(f.values.get(f.key)).ink.strokes.length,8);
  }finally{next.stop();}
});
test('storage quota failure cannot claim durability or discard draft when choosing cloud', async () => {
  const f=fixture();try{
    f.controller.notes('local');f.failStorage=true;f.controller.ink(ink(4));
    assert.equal(f.controller.getState().storageFailed,true);assert.match(f.controller.getState().error,/暫勿重新整理/);
    assert.throws(()=>f.controller.adoptCloud(f.cloud));assert.equal(f.controller.getState().notes,'local');
    await f.controller.flush();assert.equal(f.writes.length,0);
    f.failStorage=false;await f.controller.flush();assert.equal(f.controller.getState().status,'saved');
  }finally{f.controller.stop();}
});
test('late acknowledgement after account switch retains previous account draft', async () => {
  const gate=deferred();const f=fixture({saveInk:async()=>{await gate.promise;return {seq:8};}});
  try{
    f.controller.ink(ink(3));const pending=f.controller.flush();f.active=false;f.controller.stop();gate.resolve();await pending;
    assert.ok(f.values.has(f.key));assert.equal(f.controller.getState().inkSeq,7);assert.notEqual(keyFor('bob','q'),f.key);
  }finally{f.controller.stop();}
});
test('malformed local record is retained instead of deleted during restoration', () => {
  const values=new Map([[keyFor('alice','q'),'{invalid']]);const f=fixture({},values);
  try{assert.equal(f.values.get(f.key),'{invalid');assert.equal(f.controller.getState().storageFailed,true);}finally{f.controller.stop();}
});
test('unmodified fields accept newer cloud content while the other field is being saved', async () => {
  const gate=deferred();const f=fixture({saveNotes:async()=>{await gate.promise;return {notes_seq:4};}});
  try{
    f.controller.notes('local note');const saving=f.controller.flush();
    f.controller.observeCloud({...base(),draw_seq:9,draw_data:JSON.stringify(ink(8))});
    assert.equal(f.controller.getState().ink.strokes.length,8);assert.equal(f.controller.getState().notes,'local note');
    gate.resolve();await saving;assert.equal(f.controller.getState().inkSeq,9);
  }finally{f.controller.stop();}
});
test('explicitly keeping local notes preserves the latest unedited cloud ink', async () => {
  const f=fixture();try{
    f.controller.notes('local');f.cloud={...f.cloud,notes_seq:4,typed_notes:'remote',draw_seq:9,draw_data:JSON.stringify(ink(7))};
    await f.controller.flush();f.controller.keepLocal(f.cloud);await f.controller.flush();
    assert.equal(f.cloud.typed_notes,'local');assert.equal(f.controller.getState().ink.strokes.length,7);
    assert.equal(f.controller.getState().inkSeq,9);
  }finally{f.controller.stop();}
});
test('cloud adoption clears replayable work and rebases subsequent edits without discarded ink', async () => {
  const f=fixture();try{
    f.controller.ink(ink(9));f.controller.notes('discarded');
    f.cloud={...f.cloud,draw_seq:12,notes_seq:8,draw_data:JSON.stringify(ink(2)),typed_notes:'remote'};
    await f.controller.flush();assert.equal(f.controller.getState().status,'conflict');
    f.controller.adoptCloud(f.cloud);
    assert.equal(f.controller.pending(),false);assert.equal(f.values.has(f.key),false);
    assert.equal(f.controller.getState().editorVersion,1);
    assert.ok([...f.values.keys()].some(k=>k.includes(':backup:')));
    const reopened=create(f.key,f.cloud,f.deps);
    try{reopened.restoreLegacy();assert.equal(reopened.pending(),false);assert.equal(reopened.getState().notes,'remote');}finally{reopened.stop();}
    f.controller.ink({...f.controller.getState().ink,calcSpaceHeight:140});f.controller.notes('new');
    await f.controller.flush();
    assert.deepEqual(f.writes.slice(1).map(x=>x.slice(0,2)),[['ink',13],['notes',8]]);
    assert.equal(JSON.parse(f.cloud.draw_data).strokes.length,2);
    assert.equal(f.controller.getState().editorVersion,1,'ordinary saves preserve editor history');
  }finally{f.controller.stop();}
});
test('failed active-draft deletion leaves local content and conflict intact', async () => {
  let failRemove=false;
  const values=new Map();const f=fixture({storage:{getItem:k=>values.get(k)??null,
    setItem:(k,v)=>values.set(k,v),removeItem:k=>{if(failRemove)throw Error('denied');values.delete(k);}}},values);
  try{
    f.controller.notes('discarded');f.cloud={...f.cloud,notes_seq:8,typed_notes:'remote'};
    await f.controller.flush();failRemove=true;
    assert.throws(()=>f.controller.adoptCloud(f.cloud),/無法清除/);
    assert.equal(f.controller.getState().notes,'discarded');assert.equal(f.controller.getState().status,'conflict');
    assert.equal(f.controller.getState().editorVersion,0);assert.ok(f.controller.pending());assert.ok(values.has(f.key));
    failRemove=false;f.controller.adoptCloud(f.cloud);assert.equal(f.controller.pending(),false);
  }finally{f.controller.stop();}
});
test('adoption cannot race a running save', async () => {
  const gate=deferred();const f=fixture({saveNotes:async()=>{await gate.promise;return {notes_seq:4};}});
  try{
    f.controller.notes('local');const saving=f.controller.flush();
    assert.throws(()=>f.controller.adoptCloud(f.cloud),/等待目前同步/);
    assert.equal(f.controller.getState().notes,'local');gate.resolve();await saving;
  }finally{gate.resolve();f.controller.stop();}
});
test('cloud adoption waits for legacy queue cleanup before discarding its recovered work', () => {
  let ready=false;const f=fixture({canAdoptCloud:()=>ready});
  try{
    f.controller.notes('recovered legacy');
    assert.throws(()=>f.controller.adoptCloud(f.cloud),/舊版草稿尚未清理/);
    assert.equal(f.controller.pending(),true);assert.equal(f.controller.getState().notes,'recovered legacy');
    ready=true;f.controller.adoptCloud(f.cloud);assert.equal(f.controller.pending(),false);
  }finally{f.controller.stop();}
});
