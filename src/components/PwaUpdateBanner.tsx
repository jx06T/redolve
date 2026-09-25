import { useEffect, useState } from 'react';
import { getWaitingServiceWorker } from '../services/swRegister';

export function PwaUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(getWaitingServiceWorker);

  useEffect(() => {
    const onUpdate = () => setWaiting(getWaitingServiceWorker());
    window.addEventListener('redolve:pwa-update-available', onUpdate);
    return () => window.removeEventListener('redolve:pwa-update-available', onUpdate);
  }, []);

  if (!waiting) return null;

  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-primary-200 bg-surface px-4 py-3 text-xs text-text-main shadow-xl">
      <span className="flex-1">新版本已準備好。儲存目前筆跡後再更新。</span>
      <button type="button" className="rounded-xl bg-primary px-3 py-2 font-semibold text-white" onClick={() => waiting.postMessage('SKIP_WAITING')}>
        更新
      </button>
      <button type="button" className="rounded-xl px-2 py-2 text-text-muted" onClick={() => setWaiting(null)}>
        稍後
      </button>
    </div>
  );
}
