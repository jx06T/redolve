import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'}),now=Date.now();
try {
 for(const width of [390,768,1280]) {
  const context=await browser.newContext({viewport:{width,height:820},hasTouch:true,serviceWorkers:'block'}),errors=[],writes=[],lastText='待辦21：'+ '這是用來確認長內容會自動換行的待辦'.repeat(8);
  const data={items:Array.from({length:22},(_,i)=>({id:'popover-todo-'+i,kind:'todo',text:i===21?lastText:'待辦'+i,target_date:null,completed_at:null,created_at:now-100+i,updated_at:now,row_version:1})),preferences:{todos_visible:true,countdowns_visible:true,todo_order:[],countdown_order:[],row_version:1}};
  const progress={plans:[{id:'popover-plan-1',name:'複習英文',unit:'回',target_count:12,completed_count:2,created_at:now,updated_at:now,row_version:1}],preferences:{visible:true,order:[],row_version:1}};
  await context.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>route.abort());
  await context.route('**/api/**',route=>{
   const request=route.request(),path=new URL(request.url()).pathname;if(request.method()!=='GET')writes.push(path);
   let result={items:[],collections:[],subscriptions:[],keys:[],invitations:[],memberships:{}};
   if(path==='/api/auth/me')result={user:null};else if(path==='/api/taxonomy')result={tree:[],customNodes:[],counts:{}};
   else if(path==='/api/home-widgets')result=data;else if(path==='/api/progress-plans')result=progress;
   return route.fulfill({json:result});
  });
  await context.addInitScript(({data,progress})=>{localStorage.setItem('rdv:home-widgets:v1:guest',JSON.stringify({data,format:2}));localStorage.setItem('rdv:study-progress:v1:guest',JSON.stringify({data:progress}));},{data,progress});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:4181/');await page.waitForLoadState('networkidle');
  const nav=page.getByRole('navigation',{name:'總覽面板',exact:true});
  const panel=async kind=>{
   const label=width>=768?'日常工具':kind==='todo'?'待辦':kind==='countdown'?'倒數／探索':'計畫',index=width>=768?1:kind==='todo'?2:kind==='countdown'?3:4;
   await nav.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(index=>{const el=document.querySelector('[data-dashboard-carousel]');return Math.abs(el.scrollLeft-index*el.clientWidth)<2;},index);
  };
  const anchored=page.locator('[data-anchored-popover]');
  const assertNear=async trigger=>{
   await anchored.waitFor({state:'visible'});assert.equal(await anchored.count(),1);const b=await trigger.boundingBox(),p=await anchored.boundingBox();
   assert(p.x>=11&&p.x+p.width<=width-11,'popover stays horizontally inside the viewport');
   const top=await page.locator('[data-overlay-edge="top"]').boundingBox(),bottom=page.locator('[data-overlay-edge="bottom"]');
   assert(p.y>=top.y+top.height+11,'popover leaves the top navigation visible');
   const limit=await bottom.isVisible()?(await bottom.boundingBox()).y:820;assert(p.y+p.height<=limit-11,'popover leaves bottom navigation visible');
   assert(Math.min(Math.abs(p.y-b.y-b.height+4),Math.abs(b.y-p.y-p.height+4))<1,'popover is attached to its triggering button');
   const expectedX=b.x+p.width<=width-12?b.x:Math.max(12,b.x+b.width-p.width);
   assert(Math.abs(p.x-expectedX)<1,'prefer extending right from the trigger; flip left only near the edge');
   assert.equal(await anchored.getAttribute('aria-modal'),null,'local actions are nonmodal');
   assert(await anchored.evaluate(el=>el.contains(document.activeElement)),'focus enters the visible popover');
  };
  await panel('todo');const todo=page.getByRole('region',{name:'待辦事項小組件',exact:true}),menu=todo.getByRole('button',{name:'待辦事項選單',exact:true});
  const viewport=todo.locator('[data-todo-scroll]'),current=todo.locator('[data-todo-current]');
  const before=await current.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value));
  await menu.focus();await menu.press('Enter');await assertNear(menu);assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'查看整理說明');
  await page.keyboard.press('Escape');assert.equal(await anchored.count(),0);assert(await menu.evaluate(el=>el===document.activeElement));
  await menu.click();await assertNear(menu);await todo.getByRole('heading',{name:'待辦事項',exact:true}).click();assert.equal(await anchored.count(),0,'outside taps close without a backdrop');
  assert.deepEqual(await current.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value)),before);
  await menu.click();await viewport.evaluate(el=>el.scrollTop=50);await page.waitForFunction(()=>!document.querySelector('[data-anchored-popover]'));
  // Long help keeps its full dialog; returning restores the local menu.
  await menu.click();await page.getByRole('dialog',{name:'待辦事項選單',exact:true}).getByRole('button',{name:'查看整理說明',exact:true}).click();
  const help=page.getByRole('dialog',{name:'待辦整理說明',exact:true});assert.equal(await help.getAttribute('aria-modal'),'true');assert.equal(await anchored.count(),0);
  await help.getByRole('button',{name:'返回選單',exact:true}).click();await assertNear(menu);await page.keyboard.press('Escape');
  // Confirmations near the lower edge flip upward, focus Cancel, and only delete after confirmation.
  await viewport.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(100);
  const last=current.locator('[data-todo-row]').last(),remove=last.getByRole('button',{name:'刪除待辦：'+lastText,exact:true});
  await remove.click();await assertNear(remove);assert.equal(await anchored.getByRole('button',{name:'取消',exact:true}).evaluate(el=>el===document.activeElement),true);
  assert((await anchored.boundingBox()).width<=112);
  const cancelBox=await anchored.getByRole('button',{name:'取消',exact:true}).boundingBox(),deleteButton=anchored.getByRole('button',{name:'刪除待辦',exact:true}),deleteBox=await deleteButton.boundingBox();
  assert(deleteBox.y>=cancelBox.y+cancelBox.height,'confirmation actions are stacked');
  assert.equal(await deleteButton.evaluate(el=>getComputedStyle(el).color),'rgb(169, 111, 111)');
  assert(await anchored.getByRole('heading').evaluate(el=>el.classList.contains('sr-only')),'title is accessible but visually hidden');
  assert(await anchored.evaluate(el=>{const css=getComputedStyle(el);return css.paddingTop==='0px'&&css.paddingLeft==='0px'&&css.borderTopWidth==='1px';}),'no outer padding and a thin brand border');
  assert((await anchored.boundingBox()).height<=100,'simple confirmation remains compact even for long tasks');
  assert.equal(await anchored.getByText(lastText,{exact:true}).count(),0,'the adjacent confirmation does not repeat task contents');
  assert((await last.evaluate(el=>getComputedStyle(el).backgroundColor)).includes('244, 160, 160'),'the targeted task is marked pale red');
  await page.screenshot({path:'.wrangler/qa/dashboard-popover-confirm-'+width+'.png'});
  await page.keyboard.press('Escape');assert.equal(await current.locator('[data-todo-row]').count(),22);assert(await remove.evaluate(el=>el===document.activeElement));
  assert.equal(await last.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','closing clears the target highlight');
  // Simulate a reduced available area (e.g. an on-screen keyboard); a small confirmation can still flip up.
  const anchorBox=await remove.boundingBox();await page.evaluate(y=>{const boundary=document.createElement('div');boundary.dataset.overlayEdge='bottom';boundary.id='popover-test-boundary';Object.assign(boundary.style,{position:'fixed',left:'0',right:'0',top:y+'px',bottom:'0',pointerEvents:'none'});document.body.append(boundary);},anchorBox.y+anchorBox.height+30);
  await remove.click();const flipped=await anchored.boundingBox();assert(flipped.y+flipped.height<=anchorBox.y+4,'insufficient space below flips the confirmation upward');await page.keyboard.press('Escape');await page.evaluate(()=>document.getElementById('popover-test-boundary').remove());
  await remove.click();await anchored.getByRole('button',{name:'刪除待辦',exact:true}).click();assert.equal(await current.locator('[data-todo-row]').count(),21);assert.equal(await anchored.count(),0);
  assert(await viewport.evaluate(el=>el===document.activeElement),'deleting a focused row returns focus to its list');
  for(const [kind,name] of [['countdown','事件倒數選單'],['progress','學習計畫選單']]){
   await panel(kind);const trigger=page.getByRole('button',{name,exact:true});await trigger.click();await assertNear(trigger);await page.screenshot({path:'.wrangler/qa/dashboard-popover-'+kind+'-'+width+'.png'});
   await page.keyboard.press('Escape');assert(await trigger.evaluate(el=>el===document.activeElement));
  }
  assert.equal(writes.length,0,'opening and dismissing local actions never writes to an API');assert.equal(errors.length,0,errors.join('\n'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();console.log('PASS anchored dashboard menus, confirmation, viewport boundaries and keyboard',width);
 }
}finally{await browser.close();}
