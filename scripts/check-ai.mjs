// Read-only model checks by default. --generate makes one bounded synthetic text request.
import { readFileSync,existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--generate'))throw new Error('Usage: node scripts/check-ai.mjs [--generate]');
const local={};
if(existsSync('.dev.vars'))for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){
  const match=line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(!match)continue;
  let value=match[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  local[match[1]]=value;
}
const config={...local,...process.env},key=config.GEMINI_API_KEY;
if(!key){console.error('GEMINI_API_KEY is missing from the current environment and .dev.vars.');process.exit(1);}
const safe=value=>String(value||'').replaceAll(key,'[redacted]').replace(/AIza[\w-]+/g,'[redacted]').slice(0,1000);
const models=[...new Set(['gemini-3.1-flash-lite',config.GEMINI_ANALYSIS_MODEL?.trim()||'gemini-3.1-pro-preview',config.GEMINI_CORRECTION_MODEL?.trim()||'gemini-3.1-pro-preview'])];
console.log('Checks this environment/.dev.vars key, not the deployed Worker secret. Metadata success does not verify billing.');
for(const model of models){
  try{
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model.replace(/^models\//,'')),{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
    const data=await response.json();console.log(JSON.stringify({check:'model',model:safe(model),http:response.status,status:data.error?.status,message:safe(data.error?.message),generateContent:data.supportedGenerationMethods?.includes('generateContent')}));
    if(!response.ok)process.exitCode=1;
  }catch(error){console.error(JSON.stringify({check:'model',model:safe(model),error:safe(error.name)}));process.exitCode=1;}
}
if(args.includes('--generate')){
  console.log('One synthetic text generation; maxOutputTokens=64; no question images or personal data.');
  try{
    const client=new GoogleGenAI({apiKey:key,httpOptions:{timeout:20000,retryOptions:{attempts:1}}});
    const result=await client.models.generateContent({model:models[0],contents:'Return only the JSON object {"ok":true}.',config:{responseMimeType:'application/json',maxOutputTokens:64}});
    console.log(JSON.stringify({check:'generation',model:models[0],http:200,textPresent:!!result.text}));
  }catch(error){console.error(JSON.stringify({check:'generation',http:error.status,error:safe(error.name),message:safe(error.message)}));process.exitCode=1;}
}
