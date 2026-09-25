let waitingWorker: ServiceWorker | null = null;

export function getWaitingServiceWorker(): ServiceWorker | null {
  return waitingWorker;
}

function announceUpdate(worker: ServiceWorker | null) {
  if (!worker || worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
  waitingWorker = worker;
  window.dispatchEvent(new Event('redolve:pwa-update-available'));
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    waitingWorker = null;
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      announceUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => announceUpdate(installing));
      });
      await registration.update();
      announceUpdate(registration.waiting);
    } catch (error) {
      console.warn('[PWA] Service Worker registration failed:', error);
    }
  };

  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
}
