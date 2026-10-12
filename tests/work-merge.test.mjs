import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/services/ownedWorkController';export * from './src/services/workMerge';export * from './src/services/workInteraction';export * from './src/services/workConflictQueue';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {createOwnedWorkController:create,mergeInk,mergeNotes,rebaseInkHistory,rebaseTextPosition,beginWorkInteraction,endWorkInteraction,activeConflictDialog,registerConflictDialog}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const stroke=id=>({id,color:'#374151',width:2,points:[[10,10,.5],[30,30,.5]]});
const ink=(...ids)=>({strokes:ids.map(stroke),eraserMasks:[],baseWidth:800,baseHeight:300,calcSpaceHeight:100,expansions:[]});
const initial=()=>({id:'q',user_id:'a',draw_data:JSON.stringify(ink('base')),draw_seq:1,notes_seq:1,typed_notes:'第一段\n中間段\n最後段'});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(overrides={},values=new Map(),cloud=initial()){
 let remote=cloud,active=true,online=true;const writes=[],reads=[];
 const deps={delay:60000,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  active:()=>active,online:()=>online,
  saveInk:async(value,seq)=>{writes.push(['ink',value,seq]);if(seq!==remote.draw_seq+1)throw Error('CONFLICT: ink');remote={...remote,draw_data:JSON.stringify(value),draw_seq:seq};return{seq};},
  saveNotes:async(value,seq)=>{writes.push(['notes',value,seq]);if(seq!==remote.notes_seq)throw Error('CONFLICT: notes');remote={...remote,typed_notes:value,notes_seq:seq+1};return{notes_seq:seq+1};},
  load:async()=>{reads.push(1);return remote;},...overrides};
 const c=create('draft',cloud,deps);c.restoreLegacy();
 return{c,deps,values,writes,reads,get remote(){return remote;},set remote(v){remote=v;},set active(v){active=v;},set online(v){online=v;}};
}
test('three-way text merge keeps disjoint edits, Unicode and whitespace; overlap is explicit',()=>{
 assert.equal(mergeNotes('甲😀\n中間\n乙','甲😀\n中間\n乙新增','改甲😀\n中間\n乙'),'改甲😀\n中間\n乙新增');
 assert.equal(mergeNotes('abc','axc','ayc'),null);
 assert.equal(mergeNotes('abc','abcX','abcY'),null,'two inserts at the same boundary need a choice');
 assert.equal(mergeNotes(undefined,'local','remote'),null);
 assert.equal(mergeNotes(undefined,'same','same'),'same');
 assert.equal(mergeNotes('abc','','abc'),'');
 assert.equal(rebaseTextPosition('aaa\nbbb','REMOTE aaa\nbbb',7),14);
});
test('append ink merges stable IDs once; destructive/coordinate changes fail closed',()=>{
 const base=ink('base'),local=ink('base','local'),cloud=ink('base','remote');
 assert.deepEqual(mergeInk(base,local,cloud).strokes.map(s=>s.id),['base','remote','local']);
 const device=(value,atY)=>({...value,expansions:[{addedHeight:100,atY}]});
 assert.deepEqual(mergeInk(device(base,800),device(local,300),device(cloud,900)).strokes.map(s=>s.id),['base','remote','local'],'viewport height metadata is not a coordinate conflict');
 assert.deepEqual(mergeInk(base,ink('base','same','local'),ink('base','same','remote')).strokes.map(s=>s.id),['base','same','remote','local']);
 assert.equal(mergeInk(base,ink(),cloud),null);
 assert.equal(mergeInk(base,{...local,baseWidth:500},cloud),null);
 assert.equal(mergeInk(base,{...local,eraserMasks:[{strokeIdx:0,segmentRange:[[0,.5]]}]},cloud),null);
 const legacy={...cloud,strokes:cloud.strokes.map(({id,...s})=>s)};assert.equal(mergeInk(base,local,legacy),null);
 assert.deepEqual(mergeInk(base,base,cloud),cloud);
 const history=rebaseInkHistory(local,mergeInk(base,local,cloud),{strokes:base.strokes,eraserMasks:[]});
 assert.deepEqual(history.strokes.map(s=>s.id),['base','remote'],'undo retains remote additions');
 assert.equal(rebaseInkHistory(local,ink('remote'),{strokes:base.strokes,eraserMasks:[]}),null);
});
test('conflict auto-merges latest in-flight edits after pointer/IME ends',async()=>{
 const gate=defer();let f;const token={};
 f=fixture({load:async()=>{f.reads.push(1);await gate.promise;return f.remote;}});
 try{
  f.c.ink(ink('base','local'));f.c.notes('第一段\n中間段\n最後段新增');
  f.remote={...f.remote,draw_seq:2,notes_seq:2,draw_data:JSON.stringify(ink('base','remote')),typed_notes:'更新第一段\n中間段\n最後段'};
  const saving=f.c.flush();await new Promise(r=>setTimeout(r,0));beginWorkInteraction(token);
  gate.resolve();await new Promise(r=>setTimeout(r,0));
  assert.equal(f.c.getState().ink.strokes.length,2,'do not replace an active pen gesture');
  f.c.ink(ink('base','local','later'));f.c.notes('第一段\n中間段\n最後段新增更多');endWorkInteraction(token);
  await saving;assert.equal(f.c.getState().status,'pending');assert.equal(f.c.getState().cloud,undefined);
  await f.c.flush();assert.deepEqual(JSON.parse(f.remote.draw_data).strokes.map(s=>s.id),['base','remote','local','later']);
  assert.equal(f.remote.typed_notes,'更新第一段\n中間段\n最後段新增更多');assert.equal(f.c.getState().status,'saved');
  assert.equal(f.reads.length,1);assert.equal(f.values.has('draft'),false);
 }finally{endWorkInteraction(token);f.c.stop();}
});
test('persisted common ancestor survives reload and merges against a newer cloud',async()=>{
 const f=fixture();f.online=false;f.c.ink(ink('base','local'));f.c.stop();
 const cloud={...initial(),draw_seq:2,draw_data:JSON.stringify(ink('base','remote'))};
 const g=fixture({},f.values,cloud);
 try{await g.c.flush();await g.c.flush();assert.deepEqual(JSON.parse(g.remote.draw_data).strokes.map(s=>s.id),['base','remote','local']);assert.equal(g.c.getState().status,'saved');}
 finally{g.c.stop();}
});
test('lost acknowledgement plus remote additions does not duplicate our previous stroke',async()=>{
 let lost=true,f;f=fixture({saveInk:async(value,seq)=>{
  if(seq!==f.remote.draw_seq+1)throw Error('CONFLICT: ink');f.remote={...f.remote,draw_data:JSON.stringify(value),draw_seq:seq};
  if(lost){lost=false;throw Error('network');}return{seq};
 }});
 try{f.c.ink(ink('base','local'));await f.c.flush();f.c.ink(ink('base','local','later'));
  f.remote={...f.remote,draw_seq:3,draw_data:JSON.stringify(ink('base','local','remote'))};
  await f.c.flush();assert.deepEqual(JSON.parse(f.remote.draw_data).strokes.map(s=>s.id),['base','local','remote','later']);assert.equal(f.c.getState().status,'saved');
 }finally{f.c.stop();}
});
test('unmergeable changes expose both versions; local choice retains backup and cloud choice clears draft',async()=>{
 const a={},b={};const closeA=registerConflictDialog(a),closeB=registerConflictDialog(b);assert.equal(activeConflictDialog(),a);closeA();assert.equal(activeConflictDialog(),b);closeB();assert.equal(activeConflictDialog(),null);
 for(const choice of ['local','cloud']){
  const f=fixture();try{f.c.notes('本機整段替換');f.remote={...f.remote,notes_seq:2,typed_notes:'雲端整段替換'};
   await f.c.flush();assert.equal(f.c.getState().status,'conflict');assert.equal(f.c.getState().cloud.typed_notes,'雲端整段替換');
   f.active=false;assert.throws(()=>f.c.keepLocal(f.remote),/帳號已變更/);assert.throws(()=>f.c.adoptCloud(f.remote),/帳號已變更/);f.active=true;
   if(choice==='local'){f.c.keepLocal(f.remote);await f.c.flush();assert.equal(f.remote.typed_notes,'本機整段替換');}
   else{f.c.adoptCloud(f.remote);assert.equal(f.c.getState().notes,'雲端整段替換');}
   assert.ok([...f.values.keys()].some(k=>k.includes(':backup:')));assert.equal(f.values.has('draft'),false);
  }finally{f.c.stop();}
 }
});
test('continuous contention stops automatic retries; ordinary writes need no read',async()=>{
 let f,count=0;f=fixture({saveInk:async()=>{f.remote={...f.remote,draw_seq:f.remote.draw_seq+1,draw_data:JSON.stringify(ink('base',...Array.from({length:++count},(_,i)=>'remote'+i)))};throw Error('CONFLICT: ink');}});
 try{f.c.ink(ink('base','local'));for(let i=0;i<4;i++)await f.c.flush();assert.equal(f.c.getState().status,'error');assert.equal(f.reads.length,3);assert.ok(f.c.pending());}
 finally{f.c.stop();}
 const g=fixture();try{g.c.notes('new');await g.c.flush();assert.equal(g.reads.length,0);}finally{g.c.stop();}
});
