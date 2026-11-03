import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const workspace = resolve('.wrangler/qa');
mkdirSync(workspace, { recursive: true });
const directory = mkdtempSync(join(workspace, 'math-markdown-'));
after(() => {
  if (!resolve(directory).startsWith(workspace + sep)) throw Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true });
});
await build({ entryPoints: ['src/components/MarkdownRenderer.tsx', 'src/utils/mathMarkdown.ts'],
  bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: directory,
  outbase: 'src', outExtension: { '.js': '.mjs' }, jsx: 'automatic', logLevel: 'silent', plugins: [{ name: 'css-in-node-tests', setup(build) {
    build.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'test-css' }));
    build.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: '', loader: 'js' }));
  } }] });
const { default: MarkdownRenderer } = await import(pathToFileURL(join(directory, 'components/MarkdownRenderer.mjs')));
const { normalizeMathDelimiters } = await import(pathToFileURL(join(directory, 'utils/mathMarkdown.mjs')));
const render = (text, inline = false) => renderToStaticMarkup(createElement(MarkdownRenderer, { text, inline }));

test('question and option formulas render as accessible math rather than dollar delimiters', () => {
  const html = render(String.raw`設 $a$ 為實數，方程式 $\lvert 4x-2\rvert=a$ 與 $\sqrt{(-4x+2)^2}=a$ 的解相同。`);
  assert.match(html, /class="katex"/);
  assert.match(html, /<math/);
  assert.match(html, /<msqrt>/);
  assert.doesNotMatch(html, /\$\\sqrt/);
});

test('display equations and legacy delimiters work without rewriting code examples', () => {
  const text = ['行內 \\(x^2\\) 與獨立公式：', '\\[\\frac{a}{b}\\]', '', '`\\(literal\\)`', '', '```text', '\\[code\\]', '```'].join('\n');
  const normalized = normalizeMathDelimiters(text);
  assert.ok(normalized.includes('`\\(literal\\)`'));
  assert.ok(normalized.includes('\\[code\\]'));
  const html = render(text);
  assert.match(html, /katex-display/);
  assert.match(html, /<code>.*literal.*<\/code>/);
});

test('Markdown tables, lists and emphasis coexist with math', () => {
  const html = render('**檢查條件**\n\n- 確認範圍\n\n| 參數 | 範圍 |\n| --- | --- |\n| $a$ | $a \\ge 0$ |');
  assert.match(html, /<strong>檢查條件<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /class="katex"/);
});

test('inline content preserves label semantics and does not inject paragraph blocks', () => {
  const html = render('**選項** $\\sqrt{x^2}$', true);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /<(?:p|div|table|ul)\b/);
});

test('legacy bare TeX answers render fractions without double-wrapping existing math', () => {
  for (const text of [String.raw`-\frac{7}{5}`, String.raw`$-\frac{7}{5}$`, String.raw`\(-\frac{7}{5}\)`]) {
    const html = render(text, true);
    assert.match(html, /<mfrac>/);
    assert.equal((html.match(/class="katex"/g) || []).length, 1);
    assert.doesNotMatch(html, /\$-\\frac/);
  }
  assert.match(render(String.raw`\frac{7}{5}\text{公分}`, true), /<mfrac>/);
});

test('bare TeX compatibility leaves ordinary prose and explicit code literal', () => {
  for (const text of [String.raw`不要把 \frac{7}{5} 當成文字答案`, String.raw`Use \frac{7}{5} here`, '`-\\frac{7}{5}`', 'A/B', 'NT$100']) {
    assert.equal(normalizeMathDelimiters(text), text);
    assert.doesNotMatch(render(text, true), /class="katex"/);
  }
});

test('malformed or recursively expanding math falls back without crashing the page', () => {
  assert.match(render('$\\sqrt{$'), /katex-error/);
  assert.match(render(String.raw`$\def\a{\a}\a$`), /katex-error/);
});

test('HTML, image requests and unsafe Markdown or math links are not enabled', () => {
  const html = render(String.raw`<script>alert(1)</script>

![圖](https://tracker.test/pixel.png)

[連結](javascript:alert%281%29)

$\href{javascript:alert(1)}{執行}$`);
  assert.doesNotMatch(html, /<(?:script|img)\b|href="javascript:/);
  assert.doesNotMatch(html, /src="https:\/\/tracker/);
});
