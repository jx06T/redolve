// Real HTTP image cache: Playwright route interception would disable it.
// Uses the Python Playwright bundle already installed in the workspace QA runtime.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root=resolve('dist'), user={id:'reader-user',name:'Reader'};
const css=(await readFile(resolve(root,'index.html'),'utf8')).match(/href="([^"]+\.css)"/)[1];
const fixture=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {ExternalQuestionCard} from './src/components/ExternalQuestionCard';import {QuestionStream} from './src/components/QuestionStream';import {useStore} from './src/store/useStore';useStore.getState().setCurrentUser({id:'reader-user',name:'Reader'});function Fixture(){const[subscribed,setSubscribed]=useState(false);return <><button onClick={()=>setSubscribed(v=>!v)}>Toggle context</button><QuestionStream items={[{id:'entry-0'}]} busy={false} hasMore={false} loadMore={()=>{}} render={row=><ExternalQuestionCard id={row.id} collectionId="sub" subscribed={subscribed}/>}/></>;}createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
let imageRequests=0;
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><head><link rel="stylesheet" href="'+css+'"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');return;}
  if(path==='/fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(fixture.outputFiles[0].text);return;}
  if(path.startsWith('/api/')) {
   let value={items:[],collections:[],subscriptions:[],keys:[],memberships:{},invitations:[],subject_destinations:[]};
   if(path.endsWith('/image')) {
    imageRequests++;await new Promise(done=>setTimeout(done,80));
    res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, max-age=3600'});
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="160"><rect width="800" height="160" fill="white"/><text x="20" y="80">Question</text></svg>');return;
   }
   const collection=id=>({id,title:'集合 '+id,visibility:'public',is_owner:false});
   const rows=id=>[0,1,2].map(i=>({id:'entry-'+i,entry_id:'entry-'+i,collection_id:id,title:'原題',is_subscribed:id==='sub'}));
   if(path==='/api/auth/me')value={user};
   else if(path==='/api/taxonomy')value={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/public/items')value={items:rows('sub'),next_offset:null};
   else if(path==='/api/public/collections')value={collections:[collection('public')]};
   else if(path==='/api/subscriptions')value={subscriptions:[{collection_id:'sub',title:'集合 sub',last_known_title:'集合 sub',can_read:true,subscribed_at:'2026-10-13',last_viewed_at:null,unread_count:0}]};
   else if(/^\/api\/collections\/[^/]+$/.test(path)){const id=path.split('/').at(-1);value={collection:collection(id),items:rows(id),next_cursor:null};}
   else if(/^\/api\/collections\/[^/]+\/items\/[^/]+$/.test(path)){
    const parts=path.split('/');value={collection:collection(parts[3]),entry:{id:parts[5],generation:1},source:{id:'q',source:'原題',provider_name:'作者',contributor_id:'author',keywords:'[]'},capabilities:{can_create_share:false},layers:[]};
   }
   else if(path==='/api/progress-plans')value={plans:[],preferences:{visible:false,order:[],row_version:0}};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));return;
  }
  let file=resolve(root,'.'+decodeURIComponent(path));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(!extname(file))file=resolve(root,'index.html');
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(await readFile(file));
 }catch {if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  // Metadata/context can refresh while the already-loaded image node stays mounted.
  await page.goto(url+'/fixture');await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>document.querySelector('article')?.dataset.readerLoading==='false');
  await page.getByRole('button',{name:'Toggle context',exact:true}).click();await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('article').getAttribute('data-reader-loading'),'false','same loaded image must remain ready when subscription context changes');
  // Populate the actual extended preference by navigating before exercising SPA tabs.
  await page.goto(url+'/extended?collection_id=sub');await page.waitForLoadState('networkidle');
  const check=async(name)=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('article[data-reader-loading]')].length===3&&[...document.querySelectorAll('article[data-reader-loading]')].every(e=>e.querySelector('img')?.complete&&e.querySelector('img')?.naturalWidth>0&&e.querySelector('h2')?.textContent.includes('作者')));
   await page.waitForTimeout(150);
   const metrics=await page.locator('article[data-reader-loading]').evaluateAll(rows=>rows.map(e=>({loading:e.dataset.readerLoading,height:e.getBoundingClientRect().height,blank:e.getBoundingClientRect().bottom-Math.max(...[...e.children].filter(c=>c.getBoundingClientRect().height>0).map(c=>c.getBoundingClientRect().bottom))})));
   assert(metrics.every(m=>m.loading==='false'&&m.blank<32),name+' '+JSON.stringify(metrics));
  };
  await check('cold extended');
  const navigate=async name=>{if(width<1024&&name!=='延伸題目')await page.getByRole('button',{name:'開啟導覽選單',exact:true}).click();await page.getByRole('link',{name,exact:true}).first().click();await page.waitForLoadState('networkidle');};
  for(let cycle=0;cycle<5;cycle++){
   await navigate('探索');await check('explore '+cycle);
   await navigate('延伸題目');await check('extended '+cycle);
   await navigate('關於');
   await navigate('探索');await check('remount explore '+cycle);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:'.wrangler/qa/reader-height-'+width+'.png'});
  await context.close();console.log('PASS cached image card height after repeated tab switches',width);
 }
 assert(imageRequests<=12,'cached navigations should reuse image bodies: '+imageRequests);
}finally{await browser.close();await new Promise(done=>server.close(done));}
