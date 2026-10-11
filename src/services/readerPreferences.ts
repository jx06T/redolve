export type ReaderPreferenceScope = 'explore' | 'extended' | 'contributing';

const fields: Record<ReaderPreferenceScope, readonly string[]> = {
  explore: ['collection_id', 'q'],
  extended: ['collection_id', 'q', 'state', 'sort', 'list_q'],
  contributing: ['collection_id'],
};
const memory = new Map<string, string>();
const storageKey = (scope: ReaderPreferenceScope, account: string) =>
  `rdv:reader-preferences:${scope}:${encodeURIComponent(account)}`;

function select(scope: ReaderPreferenceScope, params: URLSearchParams) {
  const selected = new URLSearchParams();
  for (const field of fields[scope]) {
    const value = params.get(field);
    if (value) selected.set(field, value);
  }
  return selected;
}

export function readReaderPreferences(scope: ReaderPreferenceScope, account: string) {
  const key = storageKey(scope, account);
  let value = memory.get(key) || '';
  try { value = localStorage.getItem(key) ?? value; } catch { /* Use memory when browser storage is unavailable. */ }
  return select(scope, new URLSearchParams(value));
}

export function rememberReaderPreferences(scope: ReaderPreferenceScope, account: string, params: URLSearchParams) {
  const key = storageKey(scope, account);
  const value = select(scope, params).toString();
  memory.set(key, value);
  if (memory.size > 100) memory.delete(memory.keys().next().value!);
  try { localStorage.setItem(key, value); } catch { /* Navigation remains usable without browser storage. */ }
}

export function resolveReaderPreferences(scope: ReaderPreferenceScope, account: string, params: URLSearchParams) {
  // Explicit reader links define their entire scope; never merge a previous collection or filter into them.
  if (scope !== 'contributing') return params.size ? params : readReaderPreferences(scope, account);
  const next = new URLSearchParams(params);
  if (!next.has('collection_id')) {
    const collection = readReaderPreferences(scope, account).get('collection_id');
    if (collection) next.set('collection_id', collection);
  }
  return next;
}
