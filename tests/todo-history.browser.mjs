// Run against Vite preview on port 4181 using the workspace Playwright runtime.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const now=Date.now(),day=86400000;
const initial=[{id:'todo-pending',text:'未完成事項',completed_at:null},...[0,1,2,3,4,5,6].flatMap(ago=>Array.from({length:ago?3:2},(_,i)=>({id:'todo-day-'+ago+'-'+i,text:'完成測試 '+ago+'-'+i,completed_at:now-ago*day})))].map((item,i)=>({...item,kind:'todo',target_date:null,created_at:now-8*day+i,updated_at:now,row_version:1}));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const width of [390,1280])for(const authenticated of [false,true]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'});
  const account=authenticated?'todo-test-user':'guest',data={items:structuredClone(initial),preferences:{todos_visible:true,countdowns_visible:false,row_version:1}},writes=[],errors=[];
  await context.route('**/api/**',route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   let result={items:[],collections:[],subscriptions:[],keys:[],invitations:[],memberships:{}};
   if(path==='/api/auth/me')result={user:authenticated?{id:account,name:'Todo Test'}:null};
   else if(path==='/api/taxonomy')result={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/progress-plans')result={plans:[],preferences:{visible:false,order:[],row_version:0}};
   else if(path==='/api/home-widgets')result=data;
   else if(path.startsWith('/api/home-widgets/items/')&&request.method()==='PATCH'){
    const body=request.postDataJSON(),item=data.items.find(i=>i.id===path.split('/').at(-1));writes.push(body);
    Object.assign(item,body.patch);item.row_version++;result={item};
   }
   return route.fulfill({json:result});
  });
  await context.addInitScript(({account,data,now})=>{
   Date.now=()=>now;
   localStorage.setItem('rdv:home-widgets:v1:'+account,JSON.stringify({data,format:2}));
   localStorage.setItem('rdv:study-progress:v1:guest',JSON.stringify({data:{plans:[],preferences:{visible:false,order:[],row_version:0}}}));
  },{account,data,now});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4181/');await page.waitForLoadState('networkidle');
  const nav=page.getByRole('navigation',{name:'總覽面板',exact:true}),label=width>=768?'日常工具':'待辦';
  await nav.getByRole('button',{name:label,exact:true}).click();
  await page.waitForFunction(index=>{const e=document.querySelector('[data-dashboard-carousel]');return Math.abs(e.scrollLeft-index*e.clientWidth)<2;},width>=768?1:2);
  const todo=page.getByRole('region',{name:'待辦事項小組件',exact:true}),viewport=todo.locator('[data-todo-scroll]');
  assert(await viewport.evaluate(e=>e.scrollTop)>100,'history initially stays above the current tasks');
  assert.equal(await todo.locator('[data-todo-current] [data-todo-row]').count(),3);
  const today=todo.locator('[data-todo-row="todo-day-0-0"]'),check=today.getByRole('checkbox');
  assert(await check.isEnabled());assert.equal(await check.getAttribute('aria-checked'),'true');
  await check.click();
  assert.equal(await check.getAttribute('aria-checked'),'false');assert.equal(await today.getByRole('button',{name:'恢復待辦：完成測試 0-0',exact:true}).count(),0);
  await check.click();assert(await check.isEnabled());assert.equal(await check.getAttribute('aria-checked'),'true');
  await viewport.evaluate(e=>e.scrollTop=0);
  const old=todo.locator('[data-todo-row="todo-day-6-0"]');
  const oldBox=await old.boundingBox(),visible=await viewport.boundingBox();assert(oldBox.y>=visible.y&&oldBox.y<visible.y+visible.height);
  assert(await old.getByRole('checkbox').isDisabled());
  const oldCheck=await old.getByRole('checkbox').boundingBox();await page.mouse.click(oldCheck.x+oldCheck.width/2,oldCheck.y+oldCheck.height/2);
  assert.equal(await old.getByRole('checkbox').getAttribute('aria-checked'),'true');
  const restore=old.getByRole('button',{name:'恢復待辦：完成測試 6-0',exact:true}),remove=old.getByRole('button',{name:'刪除待辦：完成測試 6-0',exact:true});
  assert((await restore.boundingBox()).x<(await remove.boundingBox()).x);
  await restore.click();
  const confirmation=page.getByRole('dialog',{name:'恢復為未完成？',exact:true});
  assert(await confirmation.isVisible());
  assert.equal(await todo.locator('[data-todo-current] [data-todo-row="todo-day-6-0"]').count(),0,'opening the dialog must not restore the task');
  await confirmation.getByRole('button',{name:'取消',exact:true}).click();assert(await old.getByRole('checkbox').isDisabled());
  await restore.click();await confirmation.getByRole('button',{name:'恢復待辦',exact:true}).click();
  assert.equal(await todo.locator('[data-todo-current] [data-todo-row="todo-day-6-0"]').count(),1,'restored history returns to current tasks');
  await viewport.evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(150);
  await page.screenshot({path:'.wrangler/qa/todo-history-'+width+'-'+authenticated+'.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join('\n'));
  if(authenticated)assert.equal(writes.filter(w=>w.patch.completed_at===null).length,2);
  await context.close();console.log('PASS completed task lock, explicit restore and history scroll',width,authenticated);
 }
}finally{await browser.close();}
