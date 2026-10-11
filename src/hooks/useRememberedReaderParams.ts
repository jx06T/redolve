import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams, type NavigateOptions } from 'react-router-dom';
import { readReaderPreferences, rememberReaderPreferences, resolveReaderPreferences,
  type ReaderPreferenceScope } from '../services/readerPreferences';

/** Restore before loading data, then reflect the scope in the URL without adding a history entry. */
export function useRememberedReaderParams(scope: ReaderPreferenceScope | null, account: string) {
  const location = useLocation();
  const [urlParams, setUrlParams] = useSearchParams();
  const owner = useRef(account);
  const explicitEntry = useRef(urlParams.size ? location.key : undefined);
  const foreignLocation = useRef<string>();
  if (owner.current !== account) {
    // Preserve an explicit incoming link during initial authentication hydration.
    if (owner.current !== 'guest' || explicitEntry.current !== location.key) foreignLocation.current = location.key;
    owner.current = account;
  }
  let params = !scope ? urlParams : foreignLocation.current === location.key
    ? readReaderPreferences(scope, account)
    : resolveReaderPreferences(scope, account, urlParams);
  if (scope === 'contributing' && foreignLocation.current === location.key) {
    params = new URLSearchParams(params);
    params.set('source', 'contributing');
  }
  const serialized = params.toString();
  const urlSerialized = urlParams.toString();
  useEffect(() => {
    if (!scope) return;
    if (serialized !== urlSerialized) setUrlParams(new URLSearchParams(serialized), { replace: true });
    else rememberReaderPreferences(scope, account, new URLSearchParams(serialized));
  }, [scope, account, serialized, urlSerialized, setUrlParams]);

  const setParams = (next: URLSearchParams, options?: NavigateOptions) => {
    // Save before navigation so intentionally clearing the URL cannot restore the old filters.
    if (scope) rememberReaderPreferences(scope, account, next);
    setUrlParams(next, options);
  };
  return [params, setParams] as const;
}
