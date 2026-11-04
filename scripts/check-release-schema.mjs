import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { learningSchemaStatus } from './learning-schema.mjs';
import { practiceMigrations, practiceSchemaStatus } from './practice-schema.mjs';
import { personalStarMigration, personalStarSchemaStatus } from './personal-star-schema.mjs';
import { parseD1Output } from './wrangler-d1-output.mjs';

// Read-only release gate: an analysis-only check does not cover other main changes.
const args = process.argv.slice(2);
const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1];
if (!['local', 'remote'].includes(target) || args.length !== 1) {
  throw new Error('Use --target=local|remote. This command never applies migrations.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
function execute(options) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'redolve-db', '--' + target,
    ...(target === 'local' ? ['--persist-to', path.join(root, '.wrangler/state')] : []),
    ...options, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Wrangler failed; stopped.');
  return parseD1Output(result.stdout);
}
const stages = [
  { file: 'worker/migrations/0014_learning_foundation.sql', ...learningSchemaStatus(execute) },
  ...practiceMigrations.map(file => ({ file, ...practiceSchemaStatus(execute, file) })),
  { file: personalStarMigration, ...personalStarSchemaStatus(execute) },
];
const pending = stages.filter(stage => stage.missing.length).map(({ file, missing }) => ({ file, missing }));
console.log(JSON.stringify({ target, scope: 'release: 0014–0021', pending }, null, 2));
if (pending.length) process.exitCode = 1;
