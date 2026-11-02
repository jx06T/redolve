// Run against preview :4181. Test the card footer, not its floating shortcut.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const user={id:'footer-test',name:'訂正測試'},ink={strokes:[],eraserMasks:[],baseWidth:800,calcSpaceHeight:850};
const collection={id:'c1',title:'共用集',role:'contributor',can_contribute:true,visibility:'public',lifecycle:'active'};
try{
 for(const width of [390,1280])for(const source of ['owned','saved','contributing'])for(const paginated of [false,true]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),progress=new Map(),writes=[],errors=[];let failProgress=false;
  await context.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>route.abort());
  await context.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname,params=url.searchParams,method=request.method();
   const body=method==='GET'?{}:request.postDataJSON()||{};let data={items:[],collections:[],subscriptions:[],keys:[],memberships:{}},status=200;
   if(path.endsWith('/image'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="white"/></svg>'});
   if(method!=='GET')writes.push(path);
   const current=id=>{if(!progress.has(id))progress.set(id,{status:'unsolved',review_count:0,row_version:1,previous_status:'unsolved'});return progress.get(id);};
   if(path==='/api/auth/me')data={user};else if(path==='/api/taxonomy')data={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/me/public-profile')data={profile:{display_name:'訂正測試'}};
   else if(path==='/api/my/collections')data={collections:[collection]};
   else if(path.startsWith('/api/learning/'))data={id:null,revisionId:null,rowVersion:0,sourceVersion:'1',confirmationStatus:'ai',ref:{kind:source==='saved'?'saved':'owned',...(source==='saved'?{savedRefId:path.split('/').at(-1)}:{itemId:path.split('/').at(-1)})},content:{ocrText:null,questionType:'unknown',options:[],correctAnswer:null},personal:{originalAnswer:null,errorReasons:[]}};
   else if(path==='/api/search'){
    const offset=Number(params.get('offset')||0),indices=paginated&&!offset?[0]:paginated?[1,2,3,4,5]:[0,1,2,3,4,5];
    data={items:indices.map(index=>{const id=source+index,row={id,origin:source==='contributing'?'shared':source,title:id,collection_id:source==='contributing'?'c1':null};
     if(source==='owned')row.problem={id,user_id:user.id,source:id,image_url:'fixture',status:current(id).status,review_count:0,keywords:'[]',draw_data:JSON.stringify(ink),vector_clock:'{"seq":0}',notes_seq:0,created_at:'2026-11-02'};return row;
    }),next_offset:paginated&&!offset?30:null,scope:'mine'};
   }else if(/^\/api\/problems\/owned\d\/status$/.test(path)){Object.assign(current(path.split('/').at(-2)),body);data={success:true};}
   else if(/^\/api\/saved\/saved\d$/.test(path)){
    const id=path.split('/').at(-1),state=current(id);
    if(method==='PATCH'){if(failProgress){status=409;data={error:{message:'進度儲存失敗'}};}else Object.assign(state,{status:body.status,review_count:body.review_count,row_version:state.row_version+1});}
    if(status===200)data={saved:{id,entry_id:id,personal_topic_id:null,...state},snapshot:{source_title:id,collection_title:'共用集',provider_public_name:'老師'},workspace:{draw_asset_id:'ink',draw_seq:0,notes_seq:0,typed_notes:''},layers:[],source:{available:true},row_version:state.row_version};
   }else if(/^\/api\/collections\/c1\/items\/contributing\d\/progress$/.test(path)){
    const state=current(path.split('/').at(-2));if(failProgress){status=409;data={error:{message:'進度儲存失敗'}};}else{Object.assign(state,{status:state.status==='resolved'?'unsolved':'resolved',row_version:state.row_version+1});data={progress:state};}
   }else if(/^\/api\/collections\/c1\/items\/contributing\d$/.test(path)){
    const id=path.split('/').at(-1);data={collection,entry:{id,generation:1},progress:current(id),source:{id:'original-'+id,source:id,contributor_id:'teacher',provider_name:'老師'},layers:[{id:'mine',user_id:user.id,author_display:'我',draw_asset_id:'ink',draw_seq:0,notes_seq:0}],capabilities:{can_contribute:true,can_save:true}};
   }else if(path.endsWith('/draw'))data=ink;
   await route.fulfill({status,json:data});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:4181/study?source='+source+(source==='contributing'?'&collection_id=c1':''));await page.waitForLoadState('networkidle');
  const stream=page.locator('[data-reader]'),card=stream.locator('[data-problem-id="'+source+'0"]');
  const complete=()=>card.getByRole('button',{name:'完成訂正',exact:true});
  await complete().waitFor({timeout:8000}).catch(async error=>{console.log('Page:',(await page.locator('body').innerText()).slice(0,1600),'Errors:',errors);throw error;});await page.waitForTimeout(1000);await complete().scrollIntoViewIfNeeded();await page.waitForTimeout(150);
  if(source!=='owned'){
   failProgress=true;const before=await stream.evaluate(el=>el.scrollTop);await complete().click();await page.waitForTimeout(250);
   assert.equal(progress.get(source+'0').status,'unsolved');assert(Math.abs(await stream.evaluate(el=>el.scrollTop)-before)<4,'a failed save does not advance');failProgress=false;
  }
  await stream.evaluate(el=>{window.footerFrames=[el.scrollTop];const start=performance.now();const tick=()=>{window.footerFrames.push(el.scrollTop);if(performance.now()-start<1100)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await complete().click();await page.waitForTimeout(1200);
  const frames=await page.evaluate(()=>window.footerFrames),start=frames[0],end=frames.at(-1);
  assert.equal(progress.get(source+'0').status,'resolved');assert(end-start>100,'footer completion advances to the next card: '+[width,source,paginated]);
  assert(new Set(frames.filter(value=>value>start+3&&value<end-3).map(Math.round)).size>=4,'advance has intermediate smooth-scroll frames');
  assert(Math.max(...frames.slice(1).map((value,index)=>Math.abs(value-frames[index])))<(end-start)*.65,'advance is continuous');
  const target=await stream.locator('[data-index="1"]').boundingBox(),bounds=await stream.boundingBox();assert(Math.abs(target.y-bounds.y)<12,'the next card is aligned');
  const undo=card.getByRole('button',{name:'已訂正完畢',exact:true});await undo.scrollIntoViewIfNeeded();await page.waitForTimeout(150);const beforeUndo=await stream.evaluate(el=>el.scrollTop);
  await undo.click();await page.waitForTimeout(350);assert.equal(progress.get(source+'0').status,'unsolved');assert(Math.abs(await stream.evaluate(el=>el.scrollTop)-beforeUndo)<4,'undo completion stays on the current card');
  assert(writes.some(path=>path.includes(source+'0')));assert.equal(errors.length,0,errors.join('\n'));
  await context.close();console.log('PASS footer smooth advance, undo and save failure',width,source,'pagination='+paginated);
 }
}finally{await browser.close();}
