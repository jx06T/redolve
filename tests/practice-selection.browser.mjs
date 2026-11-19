// Run against the local production preview on port 4183.
import { chromium } from '../.wrangler/qa/python/playwright/driver/package/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 960 }, serviceWorkers: 'block' });
  const requests = [], errors = []; let user = 'alice';
  await context.route(url => ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname), route => route.abort());
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; let json = {};
    if (path.endsWith('/auth/me')) json = { user: { id: user, name: user } };
    else if (path.endsWith('/taxonomy')) json = { tree: [{ id: 'math', label: '數學', children: [] }], counts: {}, customNodes: [] };
    else if (path.endsWith('/practice/sessions')) {
      const body = route.request().postDataJSON(); requests.push(body);
      const id = `q${requests.length}`;
      json = { id: `session${requests.length}`, policy: 'mixed-v2', candidateCount: 100, questions: [{
        id, ref: { kind: 'owned', itemId: id }, revisionId: 'revision', sessionItemId: id,
        rowVersion: 1, sourceVersion: '1', confirmationStatus: 'confirmed', topicId: 'math', imageUrl: '/image',
        content: { ocrText: '請計算 1+1', questionType: 'calculation', options: [], correctAnswer: { kind: 'text', text: '2' } },
        personal: { originalAnswer: null, errorReasons: [] },
      }] };
    }
    await route.fulfill({ json });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4183/practice?subject=math', { waitUntil: 'networkidle' });
  const start = page.getByRole('button', { name: '開始練習', exact: true });
  await start.click(); await page.getByRole('button', { name: '離開練習', exact: true }).click();
  await start.click(); await page.getByRole('button', { name: '離開練習', exact: true }).waitFor();
  assert.deepEqual(requests[0].recentQuestionIds, []);
  assert.deepEqual(requests[1].recentQuestionIds, ['q1']);
  await page.reload({ waitUntil: 'networkidle' });
  await start.click(); await page.getByRole('button', { name: '離開練習', exact: true }).waitFor();
  assert.deepEqual(requests[2].recentQuestionIds, ['q2', 'q1']);
  user = 'bob'; await page.reload({ waitUntil: 'networkidle' });
  await start.click(); await page.getByRole('button', { name: '離開練習', exact: true }).waitFor();
  assert.deepEqual(requests[3].recentQuestionIds, [], 'another account must have its own exposure history');
  assert.deepEqual(errors, []); console.log('Practice exposure history survives rounds and reload, with account isolation.');
  await context.close();
} finally { await browser.close(); }
