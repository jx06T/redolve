import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { applyTodoOrganize } from '../scripts/apply-todo-organize.mjs';
const compiled=await build({entryPoints:['src/types/todoOrder.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {orderedCurrentTodos,organizeTodoOrder,todoInsertionTargets}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const items='ABCDE'.split('').map((id,index)=>({id,kind:'todo',text:id,completed_at:null,created_at:index}));
test('explicit destinations support top, middle, bottom, single moves and adjacent swaps',()=>{
 assert.deepEqual(organizeTodoOrder(items,['C','B','E'],'A'),['C','B','E','A','D']);
 assert.deepEqual(organizeTodoOrder(items,['C','B','E'],'D'),['A','C','B','E','D']);
 assert.deepEqual(organizeTodoOrder(items,['C','E'],null),['A','B','D','C','E']);
 assert.deepEqual(organizeTodoOrder(items,['C'],'B'),['A','C','B','D','E']);
 assert.deepEqual(organizeTodoOrder(items,['C','B'],'D'),['A','C','B','D','E']);
 assert.deepEqual(organizeTodoOrder(items,['E','C'],'A'),['E','C','A','B','D']);
 assert.equal(organizeTodoOrder(items,[],'A'),null);
 assert.equal(organizeTodoOrder(items,['C'],'C'),null,'selected tasks cannot be destinations');
 assert.equal(organizeTodoOrder(items,['C'],'missing'),null,'a removed destination must not become an accidental top move');
});
test('destination markers are unique after logically removing the selected tasks',()=>{
 assert.deepEqual(todoInsertionTargets(items,['C','E']),['A','B','D',null]);
 assert.deepEqual(todoInsertionTargets(items,['A','B']),['C','D','E',null]);
 assert.deepEqual(todoInsertionTargets(items,['E','D','C','B','A']),[null]);
 assert.deepEqual(organizeTodoOrder(items,['E','D','C','B','A'],null),['E','D','C','B','A']);
 assert.deepEqual(todoInsertionTargets(items,[]),[]);
});
test('completed tasks stay above the unfinished destination range, history is excluded',()=>{
 const now=Date.now(),today=Math.floor((now+8*3600000)/86400000);
 const complete=items.map(i=>i.id==='D'?{...i,completed_at:now}:i);
 const past={...items[0],id:'past',completed_at:now-86400000};
 assert.deepEqual(orderedCurrentTodos([...complete,past],[],today).map(i=>i.id),['A','B','C','D','E']);
 const order=organizeTodoOrder(complete,['C','B','E'],null);
 assert.deepEqual(order,['D','A','C','B','E']);
 assert.deepEqual(todoInsertionTargets(complete,['C']),['A','B','E',null]);
 assert.equal(organizeTodoOrder(complete,['C'],'D'),null);
 assert.deepEqual(orderedCurrentTodos([...complete,{...items[0],id:'new',created_at:99},past],order,today).map(i=>i.id),['D','A','C','B','E','new']);
});
test('0013 runner checks, backs up, verifies, repeats safely and stops on failures',()=>{
 const json=values=>JSON.stringify(values.map(value=>({success:true,results:[value]})));
 let ready=0,fail='',calls=[];
 const run=args=>{
  assert(!args.includes('--file'));
  if(args[1]==='time-travel'){calls.push('bookmark');if(fail==='bookmark')throw Error('bookmark');return 'bookmark 00000270-00000000-00005100-test';}
  const sql=args[args.indexOf('--command')+1];
  if(sql.startsWith('SELECT COUNT(*) AS widget_tables')){calls.push('schema');if(fail==='schema')throw Error('schema');return json([{widget_tables:2},{todo_order_column:ready}]);}
  if(sql.startsWith('SELECT (SELECT COUNT(*)')){calls.push('counts');return json([{items:35,preferences:1}]);}
  if(sql.startsWith('ALTER TABLE')){calls.push('apply');if(fail==='apply')throw Error('apply');ready=1;return json([]);}
  throw Error('Unexpected SQL');
 };
 const backup=()=>{calls.push('backup');if(fail==='backup')throw Error('backup');};
 const options={local:false,checkOnly:false,run,backup,log:()=>{}};
 assert.equal(applyTodoOrganize({...options,checkOnly:true}),0);assert.deepEqual(calls,['schema']);
 calls=[];assert.equal(applyTodoOrganize(options),1);assert.deepEqual(calls,['schema','counts','bookmark','backup','apply','schema','counts']);
 calls=[];applyTodoOrganize(options);assert.deepEqual(calls,['schema']);
 for(const failure of ['schema','bookmark','backup','apply']){ready=0;fail=failure;calls=[];assert.throws(()=>applyTodoOrganize(options));assert.equal(ready,0);}
 ready=0;fail='';calls=[];applyTodoOrganize({...options,local:true});assert(!calls.includes('bookmark'));assert(calls.indexOf('backup')<calls.indexOf('apply'));
});
