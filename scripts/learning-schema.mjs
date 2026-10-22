import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';

export const learningMigrationPath = 'worker/migrations/0014_learning_foundation.sql';
const source = readFileSync(new URL('../' + learningMigrationPath, import.meta.url), 'utf8');
const normalize = sql => sql.replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
const definitions = unstable_splitSqlQuery(source).flatMap(sql => {
  const match = sql.match(/^CREATE\s+(TABLE|INDEX|TRIGGER|VIEW)\s+(\w+)/i);
  return match ? [{ name: match[2], sql }] : [];
});
export function learningSchemaStatus(execute) {
  const names = definitions.map(d => `'${d.name}'`).join(',');
  const result = execute(['--command', `SELECT name,sql FROM sqlite_master WHERE name IN (${names});`])[0].results;
  const existing = new Map(result.map(row => [row.name, row.sql]));
  return {
    present: result.filter(row => row.name !== 'asset_reference_inventory').length,
    missing: definitions.filter(d => !existing.has(d.name) || normalize(existing.get(d.name)) !== normalize(d.sql)).map(d => d.name),
  };
}
