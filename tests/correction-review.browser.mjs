// Run against the local production preview on port 4183.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [390, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, serviceWorkers: 'block' });
    const date = '2026-11-18T08:00:00Z';
    const job = { id: 'job', status: 'complete', model: 'qa-model', promptVersion: 'correction-v9', createdAt: date, cleaned: true, error: null,
      items: [{ id: 'one', ref: { kind: 'owned', itemId: 'q1' }, status: 'complete', adopted: false }, { id: 'two', ref: { kind: 'saved', savedRefId: 'q2' }, status: 'complete', adopted: false }] };
    const writes = [], states = new Map();
    const learning = (kind, id) => {
      if (!states.has(id)) states.set(id, {
        ref: kind === 'owned' ? { kind, itemId: id } : { kind, savedRefId: id }, id, rowVersion: 0, sourceVersion: '1:image', confirmationStatus: 'ai',
        content: { ocrText: '計算平均速率', questionType: 'fill_blank', options: [], correctAnswer: null }, personal: { originalAnswer: null, errorReasons: [] },
        correction: { id: kind === 'owned' ? 'one' : 'two', status: 'complete', baseRowVersion: 0, sourceVersion: '1:image', adopted: false, stale: false, createdAt: date,
          data: { content: { ocrText: '計算平均速率', questionType: 'fill_blank', options: [], correctAnswer: { kind: 'text', text: '3' } },
            personal: { originalAnswer: null, correctionSummary: '先統一時間單位。', errorReasons: [{ text: '代入速率公式前未統一時間單位', origin: 'ai' }] } } },
      });
      return states.get(id);
    };
    await context.route(url => ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname), route => route.abort());
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let json = {};
      if (path.endsWith('/auth/me')) json = { user: { id: 'qa', name: 'QA' } };
      else if (path.endsWith('/taxonomy')) json = { tree: [], customNodes: [], counts: {} };
      else if (path.endsWith('/admin/me')) json = { isAdmin: true };
      else if (path.endsWith('/correction-batches')) json = { jobs: [job] };
      else if (path.endsWith('/correction-batches/job')) json = job;
      else if (path.includes('/correction-batches/input/')) json = { imagePath: '/problems/q1/image', notes: '我忘了將分鐘換成秒。',
        ink: JSON.stringify({ strokes: [{ color: '#dc2626', width: 4, tool: 'pen', points: [[100, 120, 0.5], [250, 170, 0.5], [400, 130, 0.5]] }], eraserMasks: [], baseWidth: 800, calcSpaceHeight: 300 }) };
      else if (path.endsWith('/image')) {
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><text x="40" y="65" font-size="30">120 m / 40 s = ?</text></svg>' }); return;
      } else if (path.includes('/learning/')) {
        const [, , , kind, id] = path.split('/');
        json = learning(kind, id);
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON(); writes.push(body);
          json = { ...json, ...body.data, rowVersion: 1, confirmationStatus: 'confirmed', correction: { ...json.correction, adopted: true } };
          states.set(id, json); job.items.find(item => item.id === json.correction.id).adopted = true;
        }
      } else if (path.includes('/practice/')) json = { attempts: [], nextCursor: null };
      await route.fulfill({ json });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4183/admin/correction-batches', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: '開啟校正工作區' }).click();
    await page.getByRole('heading', { name: '批次校正', exact: true }).waitFor();
    const viewer = page.getByRole('region', { name: '原圖與本人訂正', exact: true });
    await viewer.getByAltText('原圖與本人訂正筆跡', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await viewer.getByRole('button', { name: '並排比較', exact: true }).click();
    await viewer.getByAltText('原圖', { exact: true }).waitFor();
    assert.equal(await viewer.locator('img').count(), 2);
    await viewer.getByRole('button', { name: '放大圖片' }).click();
    await viewer.getByText('125%', { exact: true }).waitFor();
    await viewer.getByText('本人訂正筆記', { exact: true }).click();
    await viewer.getByText('我忘了將分鐘換成秒。', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: '正解', exact: true }).fill('4');
    const dismiss = dialog => dialog.dismiss(); page.on('dialog', dismiss);
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    assert.ok(page.url().includes('question=one'));
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '採用並確認', exact: true }).click();
    await page.getByText('已儲存並確認，可以繼續下一題。', { exact: true }).waitFor();
    assert.equal(writes.length, 1); assert.equal(writes[0].data.content.correctAnswer.text, '4');
    assert.equal(writes[0].data.personal.errorReasons[0].accepted, true);
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await page.waitForURL('**question=two');
    await viewer.getByAltText('原圖與本人訂正筆跡', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    assert.ok(page.url().includes('question=two'));
    await page.getByRole('textbox', { name: '正解', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    const sizes = await page.evaluate(() => {
      const a = document.querySelector('[aria-label="原圖與本人訂正"]'), b = document.querySelector('[aria-label="校正辨識資料"]');
      return [a.getBoundingClientRect().height, b.getBoundingClientRect().height];
    });
    assert.ok(sizes.every(size => size > 200));
    await page.screenshot({ path: `.wrangler/qa/batch-review-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []); console.log(JSON.stringify({ width, passed: true }));
    await context.close();
  }
} finally { await browser.close(); }
