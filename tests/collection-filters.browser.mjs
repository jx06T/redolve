// Vite preview :4181; verify scoped list refresh with controlled API responses.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'}),requests=[],errors=[];
  const collection={id:'c1',title:'集合篩選測試',public_name:'老師',visibility:'public',lifecycle:'active',is_owner:true,can_contribute:true,row_version:1};
  const entries=[{id:'e1',title:'轉煎題目',keywords:'["轉煎練習"]',display_order:1},{id:'e2',title:'幾何題目',keywords:'["幾何"]',display_order:2},{id:'e3',title:'第三題',keywords:'["幾何"]',display_order:3}];
  await context.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>route.abort());
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname,params=url.searchParams;requests.push({path,tag:params.get('tag'),after:params.get('after_order'),method:route.request().method()});
   if(path.endsWith('/image'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="white"/><text x="20" y="60">Question preview</text></svg>'});
   let data={};
   if(path==='/api/auth/me')data={user:{id:'owner',name:'老師',email:'owner@example.test'}};
   else if(path==='/api/taxonomy')data={tree:[{id:'math',label:'高中數學',children:[]}],customNodes:[],counts:{}};
   else if(path==='/api/collections/c1'){
    if(params.get('tag')==='慢'||params.has('after_order'))await new Promise(resolve=>setTimeout(resolve,650));
    const tag=params.get('tag')||'',contains=params.get('tag_match')==='contains';
    const filtered=tag==='慢'?[entries[2]]:entries.filter(entry=>!tag||JSON.parse(entry.keywords).some(value=>contains?value.includes(tag):value===tag));
    const page=params.has('after_order')?filtered.slice(2):filtered.slice(0,2);
    data={collection,items:page,next_cursor:!params.has('after_order')&&filtered.length>2?{display_order:2,id:'e2'}:null};
   }else if(path.endsWith('/candidates')){
    const tag=params.get('tag')||'';data={items:!tag||params.get('tag_match')==='contains'&&'轉煎練習'.includes(tag)?[{id:'candidate',title:'待加入原題',question_text:'候選題內容',created_at:'2026-11-02'}]:[],next_cursor:null};
   }else if(path.endsWith('/owner-transfer'))data={transfer:null};
   else if(path.endsWith('/grants'))data={grants:[]};
   else if(path.endsWith('/links'))data={links:[]};
   else if(path.endsWith('/stats'))data={stats:{item_count:3,contributor_count:1,subscriber_count:0,saved_count:0}};
   else if(path==='/api/me/public-profile')data={profile:{display_name:'老師'}};
   await route.fulfill({json:data}).catch(error=>{if(!route.request().failure())throw error;});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:4181/settings/collections/c1');await page.waitForLoadState('networkidle');
  await page.getByRole('heading',{name:'題目管理',exact:true}).waitFor();
  const included=page.getByRole('region',{name:'已加入集合的題目',exact:true});
  const preview=included.getByRole('button',{name:'檢視 轉煎題目 圖片',exact:true});
  await preview.scrollIntoViewIfNeeded();
  assert.equal(await preview.locator('img').getAttribute('src'),'/api/collections/c1/items/e1/image');
  await preview.click();await page.getByRole('img',{name:'轉煎題目',exact:true}).waitFor();
  assert.equal(await page.getByRole('img',{name:'轉煎題目',exact:true}).getAttribute('src'),'/api/collections/c1/items/e1/image');
  await page.getByRole('button',{name:'關閉檢視器 (Esc)',exact:true}).click();
  const original=included.getByRole('link',{name:'開啟 轉煎題目 原圖（新分頁）',exact:true});
  assert.equal(await original.getAttribute('href'),'/api/collections/c1/items/e1/image');assert.equal(await original.getAttribute('target'),'_blank');
  const picker=page.getByRole('heading',{name:'加入我上傳的原題',exact:true}).locator('..');
  const candidateTag=page.getByRole('textbox',{name:'篩選原題標籤',exact:true});
  await candidateTag.fill('轉煎');await picker.getByRole('button',{name:'套用搜尋與分類',exact:true}).click();
  const selected=picker.getByRole('checkbox',{name:'選取 待加入原題',exact:true});await selected.check();
  assert(requests.some(request=>request.path.endsWith('/candidates')&&request.tag==='轉煎'));
  const title=page.getByRole('textbox',{name:'集合名稱',exact:true});await title.fill('尚未儲存的集合名稱');
  const tag=page.getByLabel('依來源標籤篩選',{exact:true}),list=page.getByRole('region',{name:'已加入集合的題目',exact:true});
  await page.evaluate(()=>{window.originalCandidate=document.querySelector('[aria-label="篩選原題標籤"]');window.originalFilter=document.querySelector('[aria-label="依來源標籤篩選"]');});
  const count=path=>requests.filter(request=>request.path===path).length;
  const counts=Object.fromEntries(['/api/collections/c1/owner-transfer','/api/collections/c1/grants','/api/collections/c1/links','/api/collections/c1/stats','/api/collections/c1/candidates','/api/me/public-profile'].map(path=>[path,count(path)]));
  const beforeTyping=count('/api/collections/c1');
  await tag.focus();await tag.pressSequentially('轉煎',{delay:50});
  await page.waitForFunction(()=>document.querySelector('[aria-label="已加入集合的題目"]')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('[aria-label="已加入集合的題目"] > div').length===1);
  assert.equal(count('/api/collections/c1'),beforeTyping+1,'typing a tag fetches one debounced list page');
  assert(await tag.evaluate(el=>el===document.activeElement),'typing keeps focus');
  assert(await selected.isChecked(),'filtering the included list preserves candidate selections');assert.equal(await candidateTag.inputValue(),'轉煎');assert.equal(await title.inputValue(),'尚未儲存的集合名稱');
  assert(await page.evaluate(()=>window.originalCandidate.isConnected&&window.originalFilter.isConnected),'filtering never unmounts the page or candidate picker');
  assert((await list.innerText()).includes('轉煎題目'));assert(!(await list.innerText()).includes('幾何題目'));
  for(const [path,before]of Object.entries(counts))assert.equal(count(path),before,'no management or candidate refresh for '+path);
  // A delayed obsolete filter must not overwrite a newer result.
  await Promise.all([page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/collections/c1'&&url.searchParams.get('tag')==='慢';}),tag.fill('慢')]);
  await tag.fill('轉');await page.waitForTimeout(1000);
  assert((await list.innerText()).includes('轉煎題目'));assert(!(await list.innerText()).includes('第三題'));
  // Switching filters also cancels a pending next page instead of appending it to the new scope.
  await tag.fill('');assert.equal(await list.getByRole('button',{name:'上移',exact:true}).count(),0,'reordering stays disabled until the unfiltered list arrives');await page.getByRole('button',{name:'載入更多題目',exact:true}).waitFor();
  await Promise.all([page.waitForRequest(request=>new URL(request.url()).searchParams.has('after_order')),page.getByRole('button',{name:'載入更多題目',exact:true}).click()]);
  await tag.fill('轉煎');await page.waitForTimeout(1000);
  assert(!(await list.innerText()).includes('第三題'));assert(await selected.isChecked());
  for(const [path,before]of Object.entries(counts))assert.equal(count(path),before);
  assert.equal(await title.inputValue(),'尚未儲存的集合名稱');assert.equal(errors.length,0,errors.join('\n'));assert(!requests.some(request=>request.method!=='GET'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.wrangler/qa/collection-filters-'+width+'.png'});await context.close();console.log('PASS partial collection filters, scoped requests, preserved selection/drafts/focus and stale-response guards',width);
 }
}finally{await browser.close();}
