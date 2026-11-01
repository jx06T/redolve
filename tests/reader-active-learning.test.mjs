import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(file) {
  const { outputFiles }=await build({entryPoints:[file],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {readerActiveRow}=await load('src/services/readerActiveRow.ts');
const {learningDataIssues}=await load('src/services/learningDataIssues.ts');
test('active reader does not oscillate while the boundary is remeasured',()=>{
  let active='a';
  for(const boundary of [498,503,497,505,500,496,502]) {
    active=readerActiveRow([{index:0,start:0,end:boundary},{index:1,start:boundary,end:1000}],['a','b'],active,400,800);
    assert.equal(active,'a');
  }
  active=readerActiveRow([{index:0,start:0,end:500},{index:1,start:500,end:1000}],['a','b'],active,450,800);assert.equal(active,'b');
  assert.equal(readerActiveRow([{index:2,start:1000,end:1500}],['a','b'],null,1000,800),null,'stale virtual rows cannot dereference removed items');
});
test('AI state alone does not raise a dot, missing personal saver answer and optional error reasons are allowed',()=>{
  const question={ref:{kind:'owned',itemId:'q'},revisionId:'r',confirmationStatus:'ai',content:{ocrText:'題目',questionType:'single_choice',options:[{id:'a'},{id:'b'}],correctAnswer:{kind:'choice',optionIds:['a']}},personal:{originalAnswer:{kind:'choice',optionIds:['b']},errorReasons:[]}};
  assert.deepEqual(learningDataIssues(question),[]);
  const saved=structuredClone(question);saved.ref={kind:'saved',savedRefId:'s'};saved.personal.originalAnswer=null;assert.deepEqual(learningDataIssues(saved),[]);
  saved.content.correctAnswer=null;assert.ok(learningDataIssues(saved).some(issue=>issue.includes('正解')));
  const legacy=structuredClone(question);legacy.revisionId=null;assert.ok(learningDataIssues(legacy).some(issue=>issue.includes('結構化')));
});
