import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare,Response as MFResponse } from 'miniflare';

test('upstream AI failures classify billing before quota and never expose input or keys',async()=>{
 await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/ai-errors-'));let mf;
 try{
  const helper=join(dir,'helper.mjs');await build({entryPoints:['worker/services/ai/providerError.ts'],bundle:true,format:'esm',platform:'node',outfile:helper,logLevel:'silent'});
  const {providerError,responseError}=await import(pathToFileURL(helper));
  const key='AIza'+'private-key'.repeat(3),privateText='private question and handwritten answer';
  const sdk=Object.assign(new Error(JSON.stringify({error:{code:402,status:'RESOURCE_EXHAUSTED',message:'Your prepayment credits are depleted. '+key+' '+privateText}})),{status:402});
  const classified=providerError(sdk,{operation:'correction',model:'gemini-3.1-pro-preview'});
  assert.equal(classified.code,'AI_BILLING_REQUIRED');assert.equal(classified.diagnostic.httpStatus,402);assert.equal(classified.diagnostic.providerStatus,'RESOURCE_EXHAUSTED');
  assert.equal(classified.diagnostic.retryable,false);assert.equal(classified.allowFallback,false);assert.match(classified.message,/額度不足/);
  assert(!JSON.stringify(classified).includes(key));assert(!JSON.stringify(classified).includes(privateText));
  let cancelled=false;
  const oversized=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(16384));},cancel(){cancelled=true;}}),{status:502});
  const read=await responseError(oversized);assert(read.message.length<=8192);assert(cancelled,'oversized upstream error bodies are cancelled');
  const worker=await build({stdin:{contents:`
    import {GeminiService} from './worker/services/ai/GeminiService';
    import {emptyLearningData} from './src/types/learning';
    export default {async fetch(request,env){const ai=new GeminiService(env.KEY),op=new URL(request.url).pathname.slice(1);
      try{let data;if(op==='recognition')data=await ai.tagProblem(new Uint8Array([255,216,255]).buffer,[]);
      else if(op==='correction')data=await ai.recognizeCorrection(new Uint8Array([255,216,255]).buffer,{current:emptyLearningData(),notes:'synthetic',saved:false});
      else if(op==='selection')data=await ai.selectAnalysisQuestions({stats:{},catalog:[]});
      else if(op==='report')data=await ai.analyzeLearning({stats:{},evidence:[]});
      else data=await ai.followupLearning({stats:{},interpretation:{},evidence:[],history:[],question:'synthetic'});
      return Response.json({ok:true,data});}catch(error){return Response.json({ok:false,code:error.code,message:error.message,diagnostic:error.diagnostic,allowFallback:error.allowFallback});}}
    }`,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
  let status=402,afterFirst=402;const calls=[], configs=[];
  mf=new Miniflare({modules:true,script:worker.outputFiles[0].text,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],bindings:{KEY:key},outboundService:async request=>{
    calls.push(new URL(request.url).pathname);configs.push((await request.json()).generationConfig);const current=calls.length===1?status:afterFirst;
    if(current===200)return new MFResponse(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({topic_id:null,keywords:[],keyword_tokens:[],ocr_text:'synthetic'})}]}}]}),{headers:{'Content-Type':'application/json'}});
    return new MFResponse(JSON.stringify({error:{code:current,status:current===402||current===429?'RESOURCE_EXHAUSTED':'UNAVAILABLE',message:current===402?'Your prepayment credits are depleted.':'synthetic error'}}),{status:current,headers:{'Content-Type':'application/json'}});
  }});
  for(const operation of ['recognition','correction','selection','report','followup']){
    calls.length=0;configs.length=0;const result=await(await mf.dispatchFetch('https://test/'+operation)).json();
    assert.equal(result.code,'AI_BILLING_REQUIRED',operation);assert.equal(result.diagnostic.httpStatus,402);assert.equal(calls.length,1,'402 must not retry or fall back for '+operation);
    assert(calls[0].includes(operation==='recognition'?'gemini-3.1-flash-lite':'gemini-3.6-flash'),'each operation uses its configured default');
    if(operation!=='recognition') assert.equal(configs[0].thinkingConfig.thinkingLevel,'LOW');
    assert(!JSON.stringify(result).includes(key));
  }
  for(const [http,code]of [[401,'AI_AUTH_FAILED'],[403,'AI_ACCESS_DENIED'],[429,'AI_RATE_LIMITED']]){
    status=http;afterFirst=200;calls.length=0;const result=await(await mf.dispatchFetch('https://test/recognition')).json();assert.equal(result.code,code);assert.equal(calls.length,1);
  }
  for(const http of [404,500]){
    status=http;afterFirst=200;calls.length=0;const result=await(await mf.dispatchFetch('https://test/recognition')).json();assert.equal(result.ok,true);assert.equal(calls.length,2,'model availability/transient errors retain the bounded fallback');
  }
  status=404;afterFirst=402;calls.length=0;const fallback=await(await mf.dispatchFetch('https://test/recognition')).json();assert.equal(fallback.code,'AI_BILLING_REQUIRED');assert.equal(calls.length,2);
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
