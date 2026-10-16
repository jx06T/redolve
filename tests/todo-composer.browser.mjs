// Real native focus/selection/keyboard events; API responses are controlled fixtures.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const now = Date.now();
try {
 for (const width of [390, 1280]) for (const authenticated of [false, true]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
  const account = authenticated ? 'composer-user' : 'guest', calls = [], errors = [];
  const data = {
   items: ['A', '完成', 'B', '歷史'].map((text, i) => ({ id: 'composer-' + i, kind: 'todo', text, target_date: null,
    completed_at: text === '完成' ? now : text === '歷史' ? now - 86400000 : null, created_at: now - 172800000 + i, updated_at: now, row_version: 1 })),
   preferences: { todos_visible: true, countdowns_visible: false, countdown_order: [], todo_order: [], row_version: 1 },
  };
  let pendingSchema = false;
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  await context.route('**/api/**', async route => {
   const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
   let result = { items: [], collections: [], subscriptions: [], keys: [], invitations: [], memberships: {} }, status = 200;
   if (path === '/api/auth/me') result = { user: authenticated ? { id: account, name: 'Composer' } : null };
   else if (path === '/api/taxonomy') result = { tree: [], customNodes: [], counts: {} };
   else if (path === '/api/progress-plans') result = { plans: [], preferences: { visible: false, order: [], row_version: 0 } };
   else if (path === '/api/home-widgets') result = data;
   else if (path === '/api/home-widgets/items' && method === 'POST') {
    const item = request.postDataJSON(); calls.push({ path, body: item });
    if (!data.items.some(i => i.id === item.id)) data.items.push(item); result = { item };
   } else if (path === '/api/home-widgets/preferences' && method === 'PATCH') {
    const body = request.postDataJSON(); calls.push({ path, body });
    if (pendingSchema) { status = 503; result = { code: 'TODO_ORDER_SCHEMA_PENDING', error: '待辦排序暫時無法同步，請稍後重試' }; }
    else {
     assert.deepEqual(body.base.todo_order, data.preferences.todo_order, 'queued additions keep an accurate order base');
     const owned = new Set(data.items.map(i => i.id)); assert(body.patch.todo_order.every(id => owned.has(id)), 'creates sync before their order');
     Object.assign(data.preferences, body.patch); data.preferences.row_version++; result = { preferences: data.preferences };
    }
   }
   await route.fulfill({ status, json: result });
  });
  await context.addInitScript(({ account, data, now }) => {
   Date.now = () => now;
   const key = 'rdv:home-widgets:v1:' + account;
   if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ data, format: 2 }));
   localStorage.setItem('rdv:study-progress:v1:guest', JSON.stringify({ data: { plans: [], preferences: { visible: false, order: [], row_version: 0 } } }));
   // Observe application .focus() calls without changing native focus behavior.
   const focus = HTMLElement.prototype.focus;
   HTMLElement.prototype.focus = function (...args) { window.applicationFocusCalls = (window.applicationFocusCalls || 0) + 1; return focus.apply(this, args); };
  }, { account, data, now });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  const open = async () => {
   await page.goto('http://127.0.0.1:4181/'); await page.waitForLoadState('networkidle');
   await page.getByRole('navigation', { name: '總覽面板', exact: true }).getByRole('button', { name: width >= 768 ? '日常工具' : '待辦', exact: true }).click();
   await page.waitForFunction(index => { const e = document.querySelector('[data-dashboard-carousel]'); return Math.abs(e.scrollLeft - index * e.clientWidth) < 2; }, width >= 768 ? 1 : 2);
  };
  await open();
  const todo = page.getByRole('region', { name: '待辦事項小組件', exact: true }), composer = todo.locator('[data-todo-composer]');
  const input = composer.getByRole('textbox', { name: '新增待辦', exact: true }), send = composer.getByRole('button', { name: '新增待辦事項', exact: true });
  const hints = composer.locator('[data-todo-input-hints]');
  const direction = () => composer.getAttribute('data-todo-insert-direction');
  const order = () => todo.locator('[data-todo-current] input').evaluateAll(nodes => nodes.map(n => n.value));
  const waitOrder = async expected => page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-todo-current] input')].map(n => n.value)) === JSON.stringify(expected), expected);
  const drained = async () => { if (authenticated) await page.waitForFunction(() => !Object.keys(localStorage).some(k => k.includes(':operation:'))); };
  const tapHalf = async right => {
   await page.evaluate(() => { window.applicationFocusCalls = 0; window.composerElement = document.querySelector('[data-todo-composer] textarea'); });
   const b = await input.boundingBox(); await page.touchscreen.tap(b.x + b.width * (right ? .75 : .25), b.y + b.height / 2);
   assert(await input.evaluate(e => document.activeElement === e));
   assert.equal(await page.evaluate(() => window.applicationFocusCalls), 0, 'initial tap focuses the native textarea without script focus');
   assert(await input.evaluate(e => e === window.composerElement), 'the native textarea is never replaced');
   assert.equal(await hints.count(), 0);
  };
  assert.equal(await input.count(), 1); assert(await hints.isVisible()); assert.equal(await hints.evaluate(e => getComputedStyle(e).pointerEvents), 'none');
  assert.equal(await direction(), 'bottom'); assert(await send.isDisabled());
  assert(Math.abs((await send.boundingBox()).height - (await input.boundingBox()).height) < 1, 'send button matches the input height');
  assert.equal(await composer.getByRole('alert').count(), 0, 'normal input has no limit warning');
  if (width === 390) assert.equal(await input.evaluate(e => getComputedStyle(e).fontSize), '16px', 'mobile input avoids a small font');
  await tapHalf(true); assert.equal(await direction(), 'top'); assert.equal(await send.getAttribute('title'), '新增至上');
  await input.fill('第一件\n第二件'); await input.press('Enter');
  await waitOrder(['第一件', '第二件', 'A', '完成', 'B']);
  assert.equal(await input.inputValue(), ''); assert(await input.evaluate(e => document.activeElement === e)); assert.equal(await hints.count(), 0);
  await input.fill('連續新增'); await input.press('Enter'); await waitOrder(['連續新增', '第一件', '第二件', 'A', '完成', 'B']); await drained();
  assert.equal(await direction(), 'top');
  const rememberKey = 'rdv:todo-insert:v1:' + account;
  assert.equal(await page.evaluate(key => localStorage.getItem(key), rememberKey), 'top');
  // Empty blur restores hints; focus via keyboard keeps the remembered direction.
  await input.blur(); assert(await hints.isVisible()); await input.focus(); assert.equal(await direction(), 'top');
  await input.blur(); await tapHalf(false); assert.equal(await direction(), 'bottom');
  await input.fill('追加'); await send.click(); await waitOrder(['連續新增', '第一件', '第二件', 'A', '完成', 'B', '追加']);
  assert(await input.evaluate(e => document.activeElement === e)); await drained();
  // Caret placement inside an existing draft never changes the insertion direction.
  await input.fill('保留草稿'); await input.blur(); assert.equal(await hints.count(), 0);
  const b = await input.boundingBox(); await input.click({ position: { x: b.width * .8, y: b.height / 2 } });
  assert.equal(await direction(), 'bottom'); assert.equal(await input.inputValue(), '保留草稿');
  await input.press('Alt+ArrowUp'); assert.equal(await direction(), 'top');
  await input.press('Alt+ArrowDown'); assert.equal(await direction(), 'bottom');
  // Newlines and Chinese composition must not submit prematurely.
  await input.fill('多行'); await input.press('Shift+Enter'); await page.keyboard.insertText('輸入');
  assert.equal(await input.inputValue(), '多行\n輸入');
  const before = await order();
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, isComposing: true });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, keyCode: 229 });
  assert.deepEqual(await order(), before); assert.equal(await input.inputValue(), '多行\n輸入');
  await input.press('Enter'); await waitOrder([...before, '多行', '輸入']); await drained();
  // Invalid multiline input is rejected before any partial additions occur.
  await input.fill('有效\n' + '長'.repeat(501)); await input.press('Enter');
  assert.deepEqual(await order(), [...before, '多行', '輸入']); assert((await input.inputValue()).startsWith('有效\n'));
  await composer.getByRole('alert').waitFor(); await input.fill(''); await input.blur();
  await tapHalf(true); await input.fill(''); await input.blur();
  await page.screenshot({ path: '.wrangler/qa/todo-composer-' + width + '-' + authenticated + '.png' });
  await open(); assert.equal(await direction(), 'top', 'last direction survives reload on this account/device');
  await input.focus(); assert.equal(await direction(), 'top');
  if (authenticated && width === 1280) {
   pendingSchema = true; await input.fill('待升級置頂'); await input.press('Enter');
   await todo.getByText('待辦排序暫時無法同步，請稍後重試；草稿仍保留。', { exact: true }).waitFor();
   assert.equal((await order())[0], '待升級置頂');
   assert(data.items.some(i => i.text === '待升級置頂'), 'missing order schema does not lose the created task');
   pendingSchema = false; await todo.getByRole('button', { name: '重試同步', exact: true }).click(); await drained();
   assert.equal(data.items.find(i => i.id === data.preferences.todo_order[0]).text, '待升級置頂');
  }
  if (authenticated && width === 390) {
   // Several fast offline top additions retain both their tasks and successive bases.
   await context.setOffline(true);
   await input.fill('離線第一件'); await input.press('Enter');
   await input.fill('離線第二件'); await input.press('Enter');
   assert.deepEqual((await order()).slice(0, 2), ['離線第二件', '離線第一件']);
   assert(await page.evaluate(() => Object.keys(localStorage).some(k => k.includes(':operation:'))));
   await context.setOffline(false); await drained();
   assert.equal(data.items.find(i => i.id === data.preferences.todo_order[0]).text, '離線第二件');
  }
  // Settings reuses the same composer and device preference, without an extra toggle.
  await input.blur(); await page.goto('http://127.0.0.1:4181/settings?widget=todos#profile'); await page.waitForLoadState('networkidle');
  assert(await hints.isVisible()); assert.equal(await direction(), 'top');
  const settingsOrder = await order();
  await tapHalf(false); await input.fill('設定頁追加'); await send.click();
  try { await waitOrder([...settingsOrder, '設定頁追加']); } catch(e) { await page.screenshot({path:'.wrangler/qa/todo-composer-settings-failed.png'}); console.log({width,authenticated,settingsOrder,current:await order(),input:await input.inputValue(),composer:await composer.innerText(),calls}); throw e; } await drained();
  await open(); assert.equal(await direction(), 'bottom', 'home and settings share the device preference');
  await input.focus(); assert.equal(await direction(), 'bottom');
  assert.equal(await page.evaluate(() => localStorage.getItem('rdv:todo-insert:v1:other-account')), null);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.equal(errors.length, 0, errors.join('\n'));
  if (authenticated) assert(calls.filter(c => c.path.endsWith('/preferences')).length > 0);
  else assert.equal(calls.length, 0, 'guest direction and additions never call a mutation API');
  await context.close(); console.log('PASS native single-input focus, direction, multiline, IME, persistence and sync', width, authenticated);
 }
} finally { await browser.close(); }
