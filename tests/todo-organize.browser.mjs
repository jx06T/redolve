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
   const nativeAnimate=Element.prototype.animate;window.todoMotion=[];
   Element.prototype.animate=function(frames,options){const animation=nativeAnimate.call(this,frames,options);if(this.hasAttribute('data-todo-row')){window.todoMotion.push({node:this,frames,animation});if(window.holdTodoMotion)animation.pause();}return animation;};
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
  const destinations=()=>todo.locator('[data-todo-insert-index]');
  const sortTo=()=>todo.getByRole('button',{name:'Sort to…',exact:true}).click();
  const insertBefore=text=>todo.locator('[data-todo-insert-before="'+data.items.find(i=>i.text===text).id+'"]').click();
  const moveTop=async()=>{await sortTo();await destinations().first().click({position:{x:100,y:28}});};
  const layout=()=>todo.evaluate(root=>{const viewport=root.querySelector('[data-todo-scroll]'),current=root.querySelector('[data-todo-current]');const box=viewport.getBoundingClientRect();return {top:box.top,height:box.height,scrollHeight:viewport.scrollHeight,currentHeight:current.getBoundingClientRect().height,rows:[...current.querySelectorAll('[data-todo-row]')].map(row=>({id:row.dataset.todoRow,top:row.getBoundingClientRect().top-box.top+viewport.scrollTop,height:row.getBoundingClientRect().height}))};});
  const settle=()=>page.waitForFunction(()=>![...document.querySelectorAll('[data-todo-current] [data-todo-row]')].some(row=>row.getAnimations().some(a=>a.playState==='running'||a.playState==='paused')));
  const geometry=value=>({...value,rows:value.rows.map(({top,height})=>({top,height})).sort((a,b)=>a.top-b.top)});
  const originalLayout=await layout();
  const original=await order();assert.deepEqual(original,['A','B','完成','C','D','E']);
  const draft=todo.getByRole('textbox',{name:'新增待辦',exact:true});await draft.fill('未送出的草稿');
  const before=await todo.evaluate(e=>getComputedStyle(e).backgroundColor);
  await page.evaluate(()=>{window.holdTodoMotion=true;window.todoMotion=[];});
  await enter();assert.equal(await todo.getAttribute('data-todo-organizing'),'true');
  assert.deepEqual(await order(),['完成','A','B','C','D','E'],'completed tasks are grouped before any numbering');
  assert(await page.evaluate(()=>window.todoMotion.length>0),'entry cleanup has real native row animations');
  const frames=await page.evaluate(()=>{const record=window.todoMotion[0],animation=record.animation;animation.currentTime=0;const start=new DOMMatrixReadOnly(getComputedStyle(record.node).transform).m42;animation.currentTime=110;const middle=new DOMMatrixReadOnly(getComputedStyle(record.node).transform).m42;return {start,middle,duration:animation.effect.getTiming().duration};});
  assert.equal(frames.duration,220);assert(Math.abs(frames.start)>Math.abs(frames.middle)&&Math.abs(frames.middle)>0,'the row moves continuously between old and new positions');
  await page.evaluate(()=>{window.holdTodoMotion=false;window.todoMotion.forEach(record=>record.animation.finish());});await settle();
  assert.deepEqual(geometry(await layout()),geometry(originalLayout),'entry cleanup changes order without resizing the list');
  const organizedLayout=await layout(),organizedOriginal=['完成','A','B','C','D','E'];
  assert.equal(await todo.getByText('依序選取現在或稍後想做的事。',{exact:true}).count(),0);
  await page.waitForTimeout(220);assert.notEqual(await todo.evaluate(e=>getComputedStyle(e).backgroundColor),before);
  assert(await todo.getByRole('button',{name:'已完成：完成',exact:true}).isDisabled());assert(await draft.isDisabled());
  assert(await todo.getByRole('button',{name:'刪除待辦：A',exact:true}).isDisabled());
  assert.equal(await current.getByRole('textbox').first().isEditable(),false);
  assert(await todo.getByRole('button',{name:'Sort to…',exact:true}).isDisabled());
  for(const text of ['C','B','E'])await choose(text).click();
  await selected('C',1);await selected('B',2);await selected('E',3);assert.deepEqual(await order(),organizedOriginal);
  await choose('B').click();await selected('E',2);assert.equal(await choose('B').getAttribute('aria-pressed'),'false');
  await choose('B').click();await selected('B',3);
  assert.equal(calls.length,0,'numbering never mutates task state or order');
  await page.screenshot({path:'.wrangler/qa/todo-organize-'+width+'-'+authenticated+'.png'});
  await sortTo();assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination');
  assert.deepEqual(await order(),organizedOriginal,'showing destinations keeps every preview row in place');
  assert.deepEqual(await layout(),organizedLayout,'virtual insertion targets do not add row gaps or scroll height');
  await todo.getByRole('button',{name:'待辦事項選單',exact:true}).click();
  await page.getByRole('dialog',{name:'待辦事項選單',exact:true}).getByRole('button',{name:'查看整理說明',exact:true}).click();
  const help=page.getByRole('dialog',{name:'待辦整理說明',exact:true});await help.waitFor();
  assert((await help.innerText()).includes('插入線'));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination','closing help must not cancel selection or destination mode');
  await selected('C',1);await selected('E',2);await selected('B',3);assert.deepEqual(await layout(),organizedLayout);
  assert(await choose('C').isDisabled());assert.equal(await destinations().count(),3);
  assert.equal((await destinations().allTextContents()).join('').trim(),'','destinations have no per-location visible labels');
  await page.screenshot({path:'.wrangler/qa/todo-sort-to-'+width+'-'+authenticated+'.png'});
  await todo.getByRole('button',{name:'返回選取',exact:true}).click();await selected('C',1);await selected('E',2);await selected('B',3);
  const beforeCancelMotion=await page.evaluate(()=>window.todoMotion.length);
  await todo.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await order(),original);assert((await page.evaluate(()=>window.todoMotion.length))>beforeCancelMotion,'cancelling animates completion grouping back to its original order');assert.equal(await draft.inputValue(),'未送出的草稿');
  await enter();await page.keyboard.press('Escape');assert.equal(await todo.getAttribute('data-todo-organizing'),'false');assert.equal(calls.length,0);
  await enter();for(const text of ['C','B','E'])await choose(text).click();await sortTo();assert.deepEqual(await order(),organizedOriginal);assert.equal(await destinations().count(),3);const beforeApplyMotion=await page.evaluate(()=>{window.holdTodoMotion=true;return window.todoMotion.length;});await insertBefore('D');
  assert((await page.evaluate(()=>window.todoMotion.length))>beforeApplyMotion,'applying the selected move has real row animations');
  await page.evaluate(()=>{window.holdTodoMotion=false;window.todoMotion.forEach(record=>{if(record.animation.playState==='paused')record.animation.finish();});});await settle();
  await waitOrder(['完成','A','C','B','E','D']);assert.equal(await todo.getAttribute('data-todo-organizing'),'false');
  if(authenticated)await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rdv:home-widgets:v1:organize-test-user')).data.preferences.todo_order.length>0);
  await enter();await choose('B').click();await sortTo();await insertBefore('C');await waitOrder(['完成','A','B','C','E','D']);
  await enter();for(const text of ['C','B'])await choose(text).click();await sortTo();await insertBefore('E');await waitOrder(['完成','A','C','B','E','D']);
  await enter();for(const text of ['A','C','B','E','D'])await choose(text).click();await sortTo();assert.equal(await destinations().count(),1,'all selected tasks have only one distinct destination');
  await page.keyboard.press('Escape');assert.equal(await todo.getAttribute('data-todo-organize-step'),'selection');await selected('A',1);await page.keyboard.press('Escape');
  assert(!calls.some(c=>c.path.includes('/items')),'organizing only changes order preferences');
  const times=Object.fromEntries(initial.map(i=>[i.id,i.completed_at]));for(const item of data.items)assert.equal(item.completed_at,times[item.id]);
  await page.reload();await page.waitForLoadState('networkidle');await openPanel();await waitOrder(['完成','A','C','B','E','D']);
  await enter();for(const text of ['D','E'])await choose(text).click();await moveTop();
  await waitOrder(['完成','D','E','A','C','B']);
  await draft.fill('新事項');await todo.getByRole('button',{name:'新增待辦事項',exact:true}).click();await waitOrder(['完成','D','E','A','C','B','新事項']);
  if(authenticated)await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
  // Completion itself, cancellation and a reload must not regroup the list.
  const stableOrder=await order();
  const beforeCompleteMotion=await page.evaluate(()=>window.todoMotion.length);
  await todo.getByRole('checkbox',{name:'完成：C',exact:true}).click();await waitOrder(stableOrder);assert.equal(await page.evaluate(()=>window.todoMotion.length),beforeCompleteMotion,'ordinary completion does not trigger reorder animation');
  if(authenticated)await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
  await page.reload();await page.waitForLoadState('networkidle');await openPanel();await waitOrder(stableOrder);
  await page.emulateMedia({reducedMotion:'reduce'});const priorMotion=await page.evaluate(()=>window.todoMotion.length);
  await enter();assert.deepEqual((await order()).slice(0,2),['完成','C']);await choose('B').click();assert.equal(await choose('B').innerText(),'1');
  assert.equal(await page.evaluate(()=>window.todoMotion.length),priorMotion,'reduced motion skips entry animation');
  await todo.getByRole('button',{name:'取消',exact:true}).click();await waitOrder(stableOrder);assert.equal(await page.evaluate(()=>window.todoMotion.length),priorMotion);await page.emulateMedia({reducedMotion:'no-preference'});
  await enter();await choose('B').click();await moveTop();await waitOrder(['完成','C','B','D','E','A','新事項']);
  await todo.getByRole('checkbox',{name:'完成：C',exact:true}).click();await waitOrder(['完成','C','B','D','E','A','新事項']);
  await enter();for(const text of ['D','E','A','C','B','新事項'])await choose(text).click();await moveTop();await waitOrder(stableOrder);
  if(authenticated)await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
  if(width===1280&&authenticated){
   // Missing migration keeps the order durable and lets independent item edits sync.
   pendingSchema=true;await enter();await choose('B').click();await moveTop();await waitOrder(['完成','B','D','E','A','C','新事項']);
   await todo.getByText('待辦排序暫時無法同步，請稍後重試；草稿仍保留。',{exact:true}).waitFor();
   await todo.getByRole('checkbox',{name:'完成：A',exact:true}).click();
   await page.waitForFunction(()=>!Object.keys(localStorage).filter(k=>k.includes(':operation:')).some(k=>JSON.parse(localStorage.getItem(k)).id==='todo-organize-0'));
   assert(calls.some(c=>c.path.endsWith('/todo-organize-0')),'pending order does not block completion writes');
   pendingSchema=false;await todo.getByRole('button',{name:'重試同步',exact:true}).click();await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));
   await waitOrder(['完成','B','D','E','A','C','新事項']);
   const cloud=[...data.preferences.todo_order].reverse();data.preferences.todo_order=cloud;data.preferences.row_version++;
   await enter();await choose('C').click();await moveTop();
   const dialog=page.getByRole('dialog',{name:'小組件修改需要確認',exact:true});await dialog.waitFor();assert(!(await dialog.innerText()).includes('todo-organize-'));
   await dialog.getByRole('button',{name:'採用雲端版本',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   assert.equal(await todo.getAttribute('data-todo-organizing'),'false');
   await enter();await choose('B').click();data.preferences.todo_order=[...cloud].reverse();data.preferences.row_version++;
   await moveTop();await dialog.waitFor();await dialog.getByRole('button',{name:'保留本機修改',exact:true}).click();
   await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.includes(':operation:')));assert((await order()).indexOf('B')<(await order()).indexOf('D'));
  }
  if(width===390&&!authenticated){
   // Long lists keep the visible row anchored across destination/back transitions.
   await draft.fill(Array.from({length:30},(_,i)=>'長清單'+i).join('\n'));await todo.getByRole('button',{name:'新增待辦事項',exact:true}).click();
   await enter();await choose('B').click();const viewport=todo.locator('[data-todo-scroll]');
   await viewport.evaluate(e=>e.scrollTop=260);
   const anchor=await viewport.evaluate(e=>{const top=e.getBoundingClientRect().top;const row=[...e.querySelectorAll('[data-todo-current] [data-todo-row]')].find(n=>n.getBoundingClientRect().bottom>top+1);return {id:row.dataset.todoRow,offset:row.getBoundingClientRect().top-top};});
   const offset=()=>viewport.evaluate((e,id)=>e.querySelector('[data-todo-row="'+id+'"]').getBoundingClientRect().top-e.getBoundingClientRect().top,anchor.id);
   await sortTo();assert(Math.abs(await offset()-anchor.offset)<2,'destination step preserves visible row');
   await todo.getByRole('button',{name:'返回選取',exact:true}).click();assert(Math.abs(await offset()-anchor.offset)<2,'back preserves visible row');await sortTo();
   const visiblePoint=async()=>{const bounds=await viewport.boundingBox();for(const point of await destinations().all()){const b=await point.boundingBox();if(b.y>bounds.y+40&&b.y+b.height<bounds.y+bounds.height-10)return {point,box:b};}throw new Error('no visible insertion target');};
   const cdp=await context.newCDPSession(page);
   let {point,box}=await visiblePoint();
   // A real touch scroll beginning on an insertion marker must not reorder.
   const top=await viewport.evaluate(e=>e.scrollTop);let x=box.x+box.width/2,y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*14}]});await page.waitForTimeout(30);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(800);
   assert((await viewport.evaluate(e=>e.scrollTop))>top,'touch scroll remains native');assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination');
   // Dragging out and back with a mouse also must not apply on release.
   ({point,box}=await visiblePoint());x=box.x+box.width/2;y=box.y+box.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+2,{steps:5});await page.mouse.move(x,y,{steps:5});await page.mouse.up();assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination');
   // Horizontal swipe from a marker still navigates the Dashboard, without applying.
   ({box}=await visiblePoint());x=box.x+box.width*.8;y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*30,y:y+2}]});await page.waitForTimeout(25);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>[...document.querySelectorAll('nav[aria-label="總覽面板"] button')].some(e=>e.textContent==='倒數／探索'&&e.getAttribute('aria-current')==='page'));
   await openPanel();assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination');await selected('B',1);
   // Keyboard activation applies at the exact same target as pointer activation.
   const target=destinations().last();await target.focus();await page.keyboard.press('Enter');assert.equal(await todo.getAttribute('data-todo-organizing'),'false');assert.equal((await order()).at(-1),'B');
   // A native scroll cancels in-flight row transforms without changing the preview.
   await viewport.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(100);
   await todo.getByRole('checkbox',{name:'完成：長清單1',exact:true}).click();
   await page.evaluate(()=>window.holdTodoMotion=true);await enter();
   assert(await page.evaluate(()=>window.todoMotion.some(record=>record.animation.playState==='paused')),'long-list cleanup starts row animations');
   await viewport.evaluate(e=>e.scrollTop=80);await settle();await page.evaluate(()=>window.holdTodoMotion=false);
   assert.equal(await todo.getAttribute('data-todo-organize-step'),'selection','scrolling cancels motion without cancelling organization');
   await todo.getByRole('button',{name:'取消',exact:true}).click();await settle();await todo.getByRole('checkbox',{name:'完成：長清單1',exact:true}).click();

  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0,errors.join('\n'));
  await page.goto('http://127.0.0.1:4181/settings?widget=todos#profile');await page.waitForLoadState('networkidle');await page.waitForTimeout(400);
  const managementLayout=await layout();await enter();await settle();assert.deepEqual(geometry(await layout()),geometry(managementLayout),'settings organization keeps list geometry');const managementPreview=await layout();
  const firstText=(await order()).find(text=>!['完成','A'].includes(text));await choose(firstText).click();await sortTo();assert.deepEqual(await layout(),managementPreview,'settings insertion markers do not expand the list');
  await todo.getByRole('button',{name:'待辦事項選單',exact:true}).click();await page.getByRole('dialog',{name:'待辦事項選單',exact:true}).getByRole('button',{name:'查看整理說明',exact:true}).click();await page.getByRole('dialog',{name:'待辦整理說明',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await todo.getAttribute('data-todo-organize-step'),'destination');
  await todo.getByRole('button',{name:'取消',exact:true}).click();
  await context.close();console.log('PASS Sort to destinations, stable geometry, help, swaps, back/cancel and sync',width,authenticated);
 }
}finally{await browser.close();}
