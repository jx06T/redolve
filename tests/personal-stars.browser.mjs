// Vite preview :4181. Personal stars must not write likes, notes or progress.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const width of [390,1280])for(const kind of ['owned','saved','shared','self']){
  const source=['shared','self'].includes(kind)?'contributing':kind,params='source='+source+(source==='contributing'?'&collection_id=c1':'');
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),writes=[],queries=[],errors=[];
  let starred=false,fail=false;
  const collection={id:'c1',title:'星號測試集合',can_contribute:true,is_owner:true,visibility:'public',lifecycle:'active'};
  await context.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>route.abort());
  await context.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();let data={items:[],keys:[],collections:[],memberships:{},subscriptions:[]};
   if(path.endsWith('/image'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="250"><rect width="800" height="250" fill="white"/></svg>'});
   if(method!=='GET')writes.push({path,body:request.postDataJSON()});
   if(path==='/api/auth/me')data={user:{id:'reader',name:'讀者'}};
   else if(path==='/api/taxonomy')data={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/me/public-profile')data={profile:{display_name:'讀者'}};
   else if(path==='/api/my/collections')data={collections:[collection]};
   else if(path.startsWith('/api/learning/'))data={id:null,revisionId:null,rowVersion:0,sourceVersion:'1',confirmationStatus:'ai',ref:{kind:'owned',itemId:'q1'},content:{ocrText:null,questionType:'unknown',options:[],correctAnswer:null},personal:{originalAnswer:null,errorReasons:[]}};
   else if(path==='/api/search'){
    queries.push(Object.fromEntries(url.searchParams));
    const row={id:'q1',origin:source==='contributing'?'shared':kind,title:'星號測試題',collection_id:source==='contributing'?'c1':null,is_starred:starred?1:0};
    if(kind==='owned')row.problem={id:'q1',user_id:'reader',source:'星號測試題',image_url:'fixture',status:'unsolved',review_count:0,starred:starred?1:0,keywords:'[]',draw_data:null,notes_seq:0,vector_clock:'{"seq":0}',created_at:'2026-11-03'};
    data={items:url.searchParams.get('starred')==='yes'&&!starred?[]:[row],next_offset:null,scope:source==='contributing'?'shared':'mine',cache_version:'1'};
   }else if(path==='/api/saved/q1')data={saved:{id:'q1',entry_id:'e1',status:'unsolved',review_count:0,row_version:1,starred:starred?1:0,current_snapshot_id:'ss1'},snapshot:{source_title:'星號測試題',collection_title:collection.title,provider_public_name:'老師'},workspace:{draw_asset_id:null,draw_seq:0,notes_seq:0,typed_notes:''},layers:[],source:{available:true}};
   else if(path==='/api/collections/c1/items/q1')data={collection,entry:{id:'q1',generation:1},progress:{status:'unsolved',review_count:0,row_version:0,starred:starred?1:0},source:{id:'source1',source:'星號測試題',contributor_id:kind==='self'?'reader':'teacher',provider_name:'老師'},layers:[],capabilities:{can_contribute:true,can_save:true}};
   else if(path==='/api/question-stars'){
    if(fail)return route.fulfill({status:503,json:{error:{message:'星號暫時無法更新'}}});
    starred=request.postDataJSON().starred;data={starred};
   }
   await route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:4181/study?'+params);await page.waitForLoadState('networkidle');
  const star=()=>page.getByRole('button',{name:starred?'取消星號':'標記星號',exact:true});
  await star().click();await page.getByRole('button',{name:'取消星號',exact:true}).waitFor();
  const target=writes[0].body.target;
  assert.equal(writes[0].path,'/api/question-stars');assert.equal(target.kind,kind==='self'?'owned':kind);
  if(kind==='self')assert.equal(target.itemId,'source1');
  await page.reload();await page.waitForLoadState('networkidle');assert.equal(await star().getAttribute('aria-pressed'),'true');
  fail=true;await star().click();await page.getByText('星號暫時無法更新',{exact:true}).waitFor();assert.equal(await star().getAttribute('aria-pressed'),'true');fail=false;
  await page.goto('http://127.0.0.1:4181/search?'+params);await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'篩選',exact:true}).click();
  await Promise.all([page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/search'&&url.searchParams.get('starred')==='yes';}),page.getByRole('switch',{name:'只看星號',exact:true}).click()]);
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('starred')==='yes');await page.waitForLoadState('networkidle');
  assert(queries.some(query=>query.starred==='yes'));assert.equal(await star().getAttribute('aria-pressed'),'true');
  await star().click();await page.getByRole('button',{name:'標記星號',exact:true}).waitFor();
  await page.reload();await page.waitForLoadState('networkidle');await page.getByText('目前範圍沒有題目。',{exact:true}).waitFor();
  assert(writes.every(write=>write.path==='/api/question-stars'),'stars never write progress, ink, notes or external likes');assert.equal(errors.length,0,errors.join('\n'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();console.log('PASS personal study/search star, failure and filtering',width,kind);
 }
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),writes=[];
 await context.route('**/api/**',route=>{const request=route.request();if(request.method()!=='GET')writes.push(request.url());return route.fulfill({json:new URL(request.url()).pathname==='/api/auth/me'?{user:null}:{tree:[],customNodes:[],counts:{},items:[],collections:[],subscriptions:[],keys:[]}});});
 const page=await context.newPage();await page.goto('http://127.0.0.1:4181/about');await page.waitForLoadState('networkidle');
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('redolve_offline_db',3);
  request.onupgradeneeded=()=>{for(const name of ['syncQueue','offlineProblems'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('offlineProblems','readwrite');
   tx.objectStore('offlineProblems').put({id:'temp_star',fileData:new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="white"/></svg>').buffer,fileType:'image/svg+xml',source:'本機星號題目',topicId:'',timestamp:Date.now(),status:'unsolved'});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };
 }));
 await page.goto('http://127.0.0.1:4181/study?source=owned');await page.getByRole('button',{name:'標記星號',exact:true}).click();
 await page.getByRole('button',{name:'取消星號',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'取消星號',exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4181/search?source=owned&starred=yes');await page.getByRole('button',{name:'取消星號',exact:true}).click();
 await page.getByRole('button',{name:'標記星號',exact:true}).waitFor();await page.reload();await page.getByText('目前範圍沒有題目。',{exact:true}).waitFor();
 assert(!writes.some(url=>new URL(url).pathname==='/api/question-stars'),'guest stars remain in IndexedDB');await context.close();console.log('PASS persisted guest stars and offline search filtering');
}finally{await browser.close();}
