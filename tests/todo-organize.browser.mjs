// Run against Vite preview :4181; real UI with controlled per-account API replies.
import {chromium} from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const now=Date.now(),day=86400000;
try{
 for(const width of [390,1280])for(const authenticated of [false,true]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'}),account=authenticated?'organize-test-user':'guest';
  const initial=['A','B','完成','C','D','E','歷史'].map((text,i)=>({id:'todo-organize-'+i,kind:'todo',text,target_date:null,completed_at:text==='完成'?now:text==='歷史'?now-day:null,created_at:now-day*2+i,updated_at:now,row_version:1}));
  const data={items:structuredClone(initial),preferences:{todos_visible:true,countdowns_visible:false,countdown_order:['existing-event'],todo_order:[],row_version:1}};
  let pendingSchema=false;const calls=[],errors=[];
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
   let result={items:[],collections:[],subscriptions:[],keys:[],invitations:[],memberships:{}},status=200;
   if(path==='/api/auth/me')result={user:authenticated?{id:account,name:'Organize Test'}:null};
   else if(path==='/api/taxonomy')result={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/progress-plans')result={plans:[],preferences:{visible:false,order:[],row_version:0}};
   else if(path==='/api/home-widgets')result=data;
   else if(path==='/api/home-widgets/preferences'&&method==='PATCH'){
    const body=request.postDataJSON();calls.push({path,body});
    if(pendingSchema&&Object.hasOwn(body.patch,'todo_order')){status=503;result={code:'TODO_ORDER_SCHEMA_PENDING',error:'待辦排序暫時無法同步，請稍後重試'};}
    else if(Object.keys(body.patch).some(key=>JSON.stringify(data.preferences[key])!==JSON.stringify(body.base[key])&&JSON.stringify(data.preferences[key])!==JSON.stringify(body.patch[key]))){status=409;result={current:data.preferences,error:'設定已變更'};}
    else{Object.assign(data.preferences,body.patch);data.preferences.row_version++;result={preferences:data.preferences};}
   }else if(path.startsWith('/api/home-widgets/items/')&&method==='PATCH'){
    const body=request.postDataJSON(),item=data.items.find(i=>i.id===path.split('/').at(-1));calls.push({path,body});Object.assign(item,body.patch);item.row_version++;result={item};
   }else if(path==='/api/home-widgets/items'&&method==='POST'){
    const item=request.postDataJSON();calls.push({path,body:item});data.items.push(item);result={item};
   }
   await route.fulfill({status,json:result});
  });
  await context.addInitScript(({account,data,now})=>{
   Date.now=()=>now;if(!localStorage.getItem('rdv:home-widgets:v1:'+account))localStorage.setItem('rdv:home-widgets:v1:'+account,JSON.stringify({data,format:2}));
   localStorage.setItem('rdv:study-progress:v1:guest',JSON.stringify({data:{plans:[],preferences:{visible:false,order:[],row_version:0}}}));
  },{account,data,now});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4181/');await page.waitForLoadState('networkidle');
  const nav=page.getByRole('navigation',{name:'總覽面板',exact:true});
  const openPanel=async()=>{await nav.getByRole('button',{name:width>=768?'日常工具':'待辦',exact:true}).click();await page.waitForFunction(index=>{const e=document.querySelector('[data-dashboard-carousel]');return Math.abs(e.scrollLeft-index*e.clientWidth)<2;},width>=768?1:2);};
  await openPanel();
  const todo=page.getByRole('region',{name:'待辦事項小組件',exact:true}),current=todo.locator('[data-todo-current]');
  const order=()=>current.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value));
  const waitOrder=async expected=>{await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('[data-todo-current] input')].map(e=>e.value))===JSON.stringify(expected),expected);};
  const enter=()=>todo.getByRole('button',{name:'整理',exact:true}).click();
  const choose=text=>todo.getByRole('button',{name:'排序選取：'+text,exact:true});
  const selected=async(text,number)=>assert.equal(await choose(text).innerText(),String(number));
  const original=await order();assert.deepEqual(original,['A','B','完成','C','D','E']);
  const draft=todo.getByRole('textbox',{name:'新增待辦',exact:true});await draft.fill('未送出的草稿');
  const before=await todo.evaluate(e=>getComputedStyle(e).backgroundColor);
  await enter();assert.equal(await todo.getAttribute('data-todo-organizing'),'true');
  await page.waitForTimeout(220);assert.notEqual(await todo.evaluate(e=>getComputedStyle(e).backgroundColor),before);
  assert(await todo.getByRole('button',{name:'已完成：完成',exact:true}).isDisabled());assert(await draft.isDisabled());
  assert(await todo.getByRole('button',{name:'刪除待辦：A',exact:true}).isDisabled());
  assert.equal(await current.getByRole('textbox').first().isEditable(),false);
  assert(await todo.getByRole('button',{name:'置頂 Top',exact:true}).isDisabled());
  for(const text of ['C','B','E'])await choose(text).click();
  await selected('C',1);await selected('B',2);await selected('E',3);assert.deepEqual(await order(),original);
  await choose('B').click();await selected('E',2);assert.equal(await choose('B').getAttribute('aria-pressed'),'false');
  await choose('B').click();await selected('B',3);
  assert.equal(calls.length,0,'numbering never mutates task state or order');
  await page.screenshot({path:'.wrangler/qa/todo-organize-'+width+'-'+authenticated+'.png'});
  await todo.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await order(),original);assert.equal(await draft.inputValue(),'未送出的草稿');
  await enter();await page.keyboard.press('Escape');assert.equal(await todo.getAttribute('data-todo-organizing'),'false');assert.equal(calls.length,0);
  await enter();for(const text of ['C','B','E'])await choose(text).click();await todo.getByRole('button',{name:'排序 Sort',exact:true}).click();
  await waitOrder(['完成','A','C','B','E','D']);assert.equal(await todo.getAttribute('data-todo-organizing'),'false');
  if(authenticated)await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rdv:home-widgets:v1:organize-test-user')).data.preferences.todo_order.length>0);
  assert(!calls.some(c=>c.path.includes('/items')),'organizing only changes order preferences');
  const times=Object.fromEntries(initial.map(i=>[i.id,i.completed_at]));for(const item of data.items)assert.equal(item.completed_at,times[item.id]);
  await page.reload();await page.waitForLoadState('networkidle');await openPanel();await waitOrder(['完成','A','C','B','E','D']);
  await enter();for(const text of ['D','E'])await choose(text).click();await todo.getByRole('button',{name:'置頂 Top',exact:true}).click();
  await waitOrder(['完成','D','E','A','C','B']);
  await draft.fill('新事項');await todo.getByRole('button',{name:'新增待辦事項',exact:true}).click();await waitOrder(['完成','D','E','A','C','B','新事項']);
  if(authenticated)await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
  if(width===1280&&authenticated){
   // Missing migration keeps the order durable and lets independent item edits sync.
   pendingSchema=true;await enter();await choose('B').click();await todo.getByRole('button',{name:'置頂 Top',exact:true}).click();await waitOrder(['完成','B','D','E','A','C','新事項']);
   await todo.getByText('待辦排序暫時無法同步，請稍後重試；草稿仍保留。',{exact:true}).waitFor();
   await todo.getByRole('checkbox',{name:'完成：A',exact:true}).click();
   await page.waitForFunction(()=>!Object.keys(localStorage).filter(k=>k.includes(':operation:')).some(k=>JSON.parse(localStorage.getItem(k)).id==='todo-organize-0'));
   assert(calls.some(c=>c.path.endsWith('/todo-organize-0')),'pending order does not block completion writes');
   pendingSchema=false;await todo.getByRole('button',{name:'重試同步',exact:true}).click();await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
   await waitOrder(['完成','A','B','D','E','C','新事項']);
   const cloud=[...data.preferences.todo_order].reverse();data.preferences.todo_order=cloud;data.preferences.row_version++;
   await enter();await choose('C').click();await todo.getByRole('button',{name:'置頂 Top',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'小組件修改需要確認',exact:true});await dialog.waitFor();assert(!(await dialog.innerText()).includes('todo-organize-'));
   await dialog.getByRole('button',{name:'採用雲端版本',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   assert.equal(await todo.getAttribute('data-todo-organizing'),'false');
   await enter();await choose('B').click();data.preferences.todo_order=[...cloud].reverse();data.preferences.row_version++;
   await todo.getByRole('button',{name:'置頂 Top',exact:true}).click();await dialog.waitFor();await dialog.getByRole('button',{name:'保留本機修改',exact:true}).click();
   await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));assert((await order()).indexOf('B')<(await order()).indexOf('D'));
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join('\n'));
  await context.close();console.log('PASS organize numbering, cancel, Top/Sort, persistence and sync',width,authenticated);
 }
}finally{await browser.close();}
