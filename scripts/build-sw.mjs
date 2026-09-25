import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const template = await readFile(join(root, 'public', 'sw.js'), 'utf8');
const html = await readFile(join(dist, 'index.html'), 'utf8');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const files = await listFiles(dist);
const precache = files
  .map((file) => `/${relative(dist, file).split(sep).join('/')}`)
  .filter((url) => !['/sw.js', '/_headers'].includes(url))
  .sort();

const assets = new Set(precache);
const referencedAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)(?:\?[^\"]*)?"/g)]
  .map((match) => match[1]);
if (!assets.has('/index.html') || !referencedAssets.length || referencedAssets.some((asset) => !assets.has(asset))) {
  throw new Error('The built HTML and static asset manifest do not match');
}

const digest = createHash('sha256').update(template);
for (const url of precache) {
  digest.update(url);
  digest.update(await readFile(join(dist, url.slice(1))));
}
const buildId = digest.digest('hex').slice(0, 16);

const buildToken = "'__REDOLVE_BUILD_ID__'";
const manifestToken = '/* __REDOLVE_PRECACHE__ */ []';
if (!template.includes(buildToken) || !template.includes(manifestToken)) {
  throw new Error('Service Worker build placeholders are missing');
}

const worker = template
  .replace(buildToken, JSON.stringify(buildId))
  .replace(manifestToken, JSON.stringify(precache));
await writeFile(join(dist, 'sw.js'), worker);
console.log(`PWA build ${buildId}: ${precache.length} matching files precached`);
