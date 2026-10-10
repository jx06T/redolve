// Optional browser regression suite. Build first; install Playwright or expose it
// through NODE_PATH. PLAYWRIGHT_CHANNEL=msedge uses an installed Windows Edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOmcAAAAASUVORK5CYII=', 'base64');
const user = { id: 'browser-user', email: 'browser@example.test', name: '測試' };
const originalDraw = { baseWidth: 800, baseHeight: 1000, calcSpaceHeight: 850,
  strokes: [{ color: '#222222', width: 1, tool: 'pen', points: [[10, 900, .5], [40, 920, .5]] }], eraserMasks: [] };
const item = { id: 'browser-item', user_id: user.id, type: 'problem', image_url: 'test.png',
  source: '測試題', keywords: '[]', topic_id: null, status: 'unsolved', review_count: 0,
  draw_data: JSON.stringify(originalDraw), typed_notes: '保留筆記', vector_clock: '{"seq":3}',
  created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z' };

test('image multi-selection and scratchpad folding preserve user content', async t => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const base = 'http://127.0.0.1:4181';
    const fixture = async (context, loggedIn, writes = []) => {
      await context.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png });
        let body;
        if (path === '/api/auth/me') body = { user: loggedIn ? user : null };
        else if (path === '/api/taxonomy/tree') body = { tree: [], tags: [] };
        else if (path === '/api/problems/browser-item/draw') {
          writes.push(request.postDataJSON()); body = { status: 'ok' };
        } else if (path === '/api/problems/browser-item') body = { item };
        else if (path === '/api/search') body = { scope: 'mine', next_offset: null,
          items: [{ origin: 'owned', id: item.id, title: item.source, problem: item }] };
        else if (path === '/api/me/upload-preference') body = { collection_id: null };
        else if (path === '/api/collections') body = { collections: [] };
        else body = { items: [], tree: [], tags: [] };
        await route.fulfill({ json: body });
      });
    };
    await t.test('iPhone guest can select several images once, append, preview and remove one', async () => {
      const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
      try {
        await fixture(context, false);
        const page = await context.newPage();
        await page.goto(base + '/search');
        await page.waitForLoadState('networkidle');
        await page.locator('button[title="上傳錯題"]').first().click();
        const input = page.getByLabel('選擇考卷圖片');
        assert.equal(await input.getAttribute('multiple'), '');
        const file = name => ({ name, mimeType: 'image/png', buffer: png });
        await input.setInputFiles([file('one.png'), file('two.png')]);
        await page.getByText('待上傳圖片清單 (2 張)', { exact: true }).waitFor();
        await input.setInputFiles([file('three.png')]);
        await page.getByText('待上傳圖片清單 (3 張)', { exact: true }).waitFor();
        await page.getByRole('button', { name: '預覽 one.png', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: /^預覽 .*\.png$/ }).count(), 3);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '移除 two.png', exact: true }).click();
        await page.getByText('待上傳圖片清單 (2 張)', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '預覽 one.png', exact: true }).count(), 1);
        assert.equal(await page.getByRole('button', { name: '預覽 three.png', exact: true }).count(), 1);
      } finally { await context.close(); }
    });
    await t.test('custom height survives repeated folds, responsive resize, saved resize and reload', async () => {
      const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
      try {
        const writes = [];
        await fixture(context, true, writes);
        const page = await context.newPage();
        await page.goto(base + '/search?scope=mine&q=測試');
        await page.waitForLoadState('networkidle');
        const area = page.locator('#problem-browser-item .transition-\\[height\\]');
        const height = async () => (await area.boundingBox()).height;
        await page.waitForTimeout(350);
        const initial = await height();
        assert.ok(initial > 400);
        for (let i = 0; i < 3; i++) {
          await page.getByTitle('收合推導區（保留高度與筆跡）', { exact: true }).click();
          await page.waitForTimeout(250);
          assert.ok(await height() <= 1);
          await page.getByTitle('展開推導區 (850px)', { exact: true }).click();
          await page.waitForTimeout(250);
          assert.ok(Math.abs(await height() - initial) <= 1);
        }
        assert.equal(writes.length, 0, 'folding must not write a zero height');
        await page.setViewportSize({ width: 390, height: 844 });
        // Card padding animates for 300ms; the width observer then retargets the
        // 200ms height transition. Measure after both have settled.
        await page.waitForTimeout(750);
        const mobileHeight = await height();
        assert.ok(mobileHeight < initial);
        await page.getByTitle('收合推導區（保留高度與筆跡）', { exact: true }).click();
        await page.getByTitle('展開推導區 (850px)', { exact: true }).click();
        await page.waitForTimeout(350);
        assert.ok(Math.abs(await height() - mobileHeight) <= 1,
          JSON.stringify({ mobileHeight, reopened: await height(), style: await area.getAttribute('style') }));
        await page.getByTitle(/^擴增草稿空間/).click();
        await page.waitForTimeout(650);
        assert.equal(writes.length, 1);
        assert.ok(writes[0].draw_data.calcSpaceHeight > 850);
        assert.deepEqual(writes[0].draw_data.strokes, originalDraw.strokes);
        assert.equal(writes[0].draw_data.baseWidth, 800);
        item.draw_data = JSON.stringify(writes[0].draw_data);
        const expandedHeight = await height();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(350);
        assert.ok(Math.abs(await height() - expandedHeight) <= 1);
        // Resize immediately after a stroke, before the 400ms save debounce.
        const canvas = page.locator('#problem-browser-item canvas');
        await canvas.scrollIntoViewIfNeeded();
        const bounds = await canvas.boundingBox();
        await canvas.dispatchEvent('pointerdown', { pointerType: 'mouse', pointerId: 1,
          clientX: bounds.x + 30, clientY: bounds.y + 30, buttons: 1, pressure: .5 });
        await canvas.dispatchEvent('pointermove', { pointerType: 'mouse', pointerId: 1,
          clientX: bounds.x + 65, clientY: bounds.y + 50, buttons: 1, pressure: .5 });
        await canvas.dispatchEvent('pointerup', { pointerType: 'mouse', pointerId: 1,
          clientX: bounds.x + 65, clientY: bounds.y + 50, buttons: 0, pressure: .5 });
        await page.getByTitle(/^擴增草稿空間/).click();
        await page.waitForTimeout(650);
        assert.equal(writes.at(-1).draw_data.strokes.length, originalDraw.strokes.length + 1,
          'height edits must retain a stroke whose save is still pending');
      } finally { await context.close(); }
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
