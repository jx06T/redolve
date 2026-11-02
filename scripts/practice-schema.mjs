import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
export const practiceMigrations = ['worker/migrations/0015_practice_attempts.sql', 'worker/migrations/0016_personal_analysis.sql', 'worker/migrations/0017_analysis_context_and_followups.sql'];
const normalize = sql => sql.replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
export function practiceSchemaStatus(execute, file) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const definitions = unstable_splitSqlQuery(source).flatMap(sql => {
    const match = sql.match(/^CREATE\s+(TABLE|INDEX|TRIGGER|VIEW)\s+(\w+)/i); return match ? [{ name: match[2], sql }] : [];
  });
  const result = execute(['--command', `SELECT name,sql FROM sqlite_master WHERE name IN (${definitions.map(d => `'${d.name}'`).join(',')});`])[0].results;
  const existing = new Map(result.map(row => [row.name, row.sql]));
  return { present: result.length, missing: definitions.filter(d => !existing.has(d.name) || normalize(existing.get(d.name)) !== normalize(d.sql)).map(d => d.name) };
}
