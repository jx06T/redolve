import { stripVTControlCharacters } from 'node:util';

const invalid = () => new Error('Invalid Wrangler D1 JSON response. A migration may already have run; use --check before retrying.');
function validate(value) {
  if (!Array.isArray(value) || !value.length || value.some(row => !row || typeof row.success !== 'boolean' || !Array.isArray(row.results))) throw invalid();
  if (value.some(row => !row.success)) throw new Error('D1 reported a failed query; stopped. Use --check before retrying.');
  return value;
}

/** Wrangler 4 may print import/upload progress to stdout even with --json. */
export function parseD1Output(stdout) {
  const text = stripVTControlCharacters(stdout).replace(/^\uFEFF/, '').trim();
  let direct;
  try { direct = { value: JSON.parse(text) }; } catch { /* Locate a complete top-level array after progress lines. */ }
  if (direct) return validate(direct.value);
  const payloads = [];
  const starts = /^[\t ]*\[/gm;
  let match;
  while ((match = starts.exec(text))) {
    const start = text.indexOf('[', match.index);
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '[' || char === '{') depth++;
      else if (char === ']' || char === '}') {
        if (--depth !== 0) continue;
        let value;
        try { value = JSON.parse(text.slice(start, i + 1)); } catch { break; }
        // Do not mistake a progress label or a query's nested results for the response.
        if (Array.isArray(value) && value.some(row => row && Object.hasOwn(row, 'success'))) payloads.push(validate(value));
        starts.lastIndex = i + 1;
        break;
      }
    }
  }
  if (payloads.length !== 1) throw invalid();
  return payloads[0];
}
