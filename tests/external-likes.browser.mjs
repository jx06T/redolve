// Vite preview :4181; exercise external likes separately from personal study stars.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const width of [390,1280])for(const mode of ['explore','extended','guest']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'}),writes=[],errors=[];
  const guest=mode==='guest',subscribed=mode==='extended';let liked=subscribed,fail=false;
  const collection={id:'c1',title:'老師的題目集',visibility:'public',lifecycle:'active',is_owner:false};
  const row=()=>({id:'e1',entry_id:'e1',collection_id:'c1',title:'學測練習題',is_starred:liked?1:0,is_subscribed:subscribed?1:0});
  await context.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>route.abort());
  await context.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();let data={items:[],collections:[],subscriptions:[],keys:[],invitations:[]};
   if(method!=='GET')writes.push(path);
   if(path.endsWith('/image'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240"><rect width="800" height="240" fill="white"/><text x="20" y="100">Question image</text></svg>'});
   if(path==='/api/auth/me')data={user:guest?null:{id:'reader',name:'讀者'}};
   else if(path==='/api/taxonomy')data={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/subscriptions')data={subscriptions:subscribed?[{collection_id:'c1',title:collection.title,last_known_title:collection.title,can_read:true,subscribed_at:'2026-11-03'}]:[]};
   else if(path==='/api/public/collections')data={collections:[collection]};
   else if(path==='/api/public/items')data={items:[{...row(),is_liked:liked?1:0}],next_offset:null};
   else if(path==='/api/collections/c1')data={collection,items:url.searchParams.get('state')==='liked'&&!liked?[]:[row()],next_cursor:null};
   else if(path==='/api/collections/c1/items/e1')data={collection,entry:{id:'e1',generation:1},source:{id:'source1',source:row().title,provider_name:'老師',contributor_id:'teacher',keywords:'[]'},layers:[],capabilities:{can_create_share:false}};
   else if(path.endsWith('/like')){
    if(fail)return route.fulfill({status:503,json:{error:{message:'喜歡暫時無法更新'}}});
    liked=req.postDataJSON().liked;data={liked};
   }
   await route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:4181/'+(subscribed?'extended?collection_id=c1': 'explore'));await page.waitForLoadState('networkidle');
  const card=page.locator('article').first(),heart=()=>card.getByRole('button',{name:liked?'取消喜歡':'喜歡此題',exact:true});
  await heart().waitFor();assert.equal(await heart().getAttribute('aria-pressed'),String(liked));
  const buttons=card.locator('header button');assert.equal(await buttons.count(),3);
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,bg:getComputedStyle(node).backgroundColor})));
  assert(boxes.every(box=>box.width===32&&box.height===32),'same compact geometry as the study toolbar');
  if(guest){
   await heart().tap();await page.getByRole('dialog',{name:'登入與帳號',exact:true}).waitFor();assert(!writes.some(path=>path.endsWith('/like')));
  }else{
   await heart().click();await page.waitForFunction(expected=>document.querySelector('article button[aria-pressed]')?.getAttribute('aria-pressed')===String(expected),!subscribed);
   await page.reload();await page.waitForLoadState('networkidle');assert.equal(await heart().getAttribute('aria-pressed'),String(liked),'likes survive a remount');
   fail=true;await heart().click();await page.getByText('喜歡暫時無法更新',{exact:true}).waitFor();
   assert.equal(await heart().getAttribute('aria-pressed'),String(liked),'failed writes keep the previous state');assert(await card.locator('img').isVisible(),'failed likes do not hide the question image');fail=false;
   await card.getByRole('button',{name:'檢舉',exact:true}).click();await page.getByRole('dialog',{name:'檢舉題目',exact:true}).waitFor();await page.getByRole('button',{name:'關閉對話框',exact:true}).click();
   if(subscribed){
    await page.getByRole('button',{name:/搜尋.*篩選/}).first().click();
    await page.getByRole('combobox',{name:'閱讀篩選',exact:true}).selectOption('liked');
    assert.equal(new URL(page.url()).searchParams.get('state'),'liked');
   }
   assert(writes.every(path=>path.endsWith('/like')||path.endsWith('/read')),'liking never saves, subscribes or changes study progress');
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:'.wrangler/qa/external-likes-'+mode+'-'+width+'.png'});await context.close();console.log('PASS external heart and compact actions',width,mode);
 }
}finally{await browser.close();}
