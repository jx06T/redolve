export const LIST_FRESHNESS_MS = 40_000;

const abortError = () => new DOMException('Request cancelled', 'AbortError');

// Cancelling a view must not cancel a request another view is using.
function consume<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(abortError()); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Plain JSON response objects; consumers treat nested DTOs as immutable.
export function createListCache({ now = Date.now, limit = 40 } = {}) {
  let account = 'guest', generation = 0, accountGeneration = 0;
  let stamps = new WeakMap<object, { receivedAt: number; generation: number }>();
  let cacheHits = new WeakSet<object>();
  const values = new Map<string, { value: unknown; receivedAt: number; generation: number }>();
  const pending = new Map<string, Promise<unknown>>();
  const controllers = new Set<AbortController>();
  const listeners = new Set<() => void>();

  function invalidate() {
    generation++;
    values.clear(); pending.clear();
    listeners.forEach(listener => listener());
  }
  function reuse<T extends object>(cached: { value: unknown; receivedAt: number; generation: number }): T {
    const value = { ...(cached.value as T) };
    stamps.set(value, { receivedAt: cached.receivedAt, generation: cached.generation }); cacheHits.add(value);
    return value;
  }
  async function read<T extends object>(key: string, loader: (signal: AbortSignal, cached?: T) => Promise<T>, signal?: AbortSignal, validate = false): Promise<T> {
    if (signal?.aborted) throw abortError();
    const candidate = values.get(key);
    const cached = candidate && now() - candidate.receivedAt < LIST_FRESHNESS_MS ? candidate : undefined;
    if (cached && !validate) {
      // LRU access changes eviction order, never the freshness timestamp.
      values.delete(key); values.set(key, cached);
      return reuse<T>(cached);
    }
    values.delete(key);
    let request = pending.get(key) as Promise<T> | undefined;
    if (!request) {
      const epoch = generation, identity = accountGeneration;
      const controller = new AbortController(); controllers.add(controller);
      request = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError();
        return loader(controller.signal, cached?.value as T | undefined);
      }).then(value => {
        if (identity !== accountGeneration) throw abortError();
        // A successful mutation overtook this GET. Fetch current data instead of caching the old response.
        if (epoch !== generation) return read(key, loader, undefined, validate);
        // A validated unchanged response keeps the original 40-second deadline.
        if (validate && cached && value === cached.value) {
          if (now() - cached.receivedAt >= LIST_FRESHNESS_MS) {
            if (pending.get(key) === request) pending.delete(key);
            return read(key, loader, undefined, true);
          }
          values.set(key, cached);
          if (values.size > limit) values.delete(values.keys().next().value!);
          return reuse<T>(cached);
        }
        const receivedAt = now(); stamps.set(value, { receivedAt, generation: epoch });
        values.set(key, { value, receivedAt, generation: epoch });
        if (values.size > limit) values.delete(values.keys().next().value!);
        return value;
      }).finally(() => {
        controllers.delete(controller);
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
    }
    return consume(request, signal);
  }
  return {
    read, invalidate,
    readValidated: <T extends object>(key: string, loader: (signal: AbortSignal, cached?: T) => Promise<T>, signal?: AbortSignal) => read(key, loader, signal, true),
    onInvalidate(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => generation,
    receivedAt: (value: object) => stamps.get(value)?.receivedAt ?? now(),
    versionOf: (value: object) => stamps.get(value)?.generation,
    wasCached: (value: object) => cacheHits.has(value),
    setAccount(next: string) {
      if (next === account) return;
      account = next; accountGeneration++; invalidate(); stamps = new WeakMap(); cacheHits = new WeakSet();
      controllers.forEach(c => c.abort()); controllers.clear();
    },
  };
}

// Memory only: private lists are never persisted to Cache API, localStorage or the service worker.
export const questionListCache = createListCache();
