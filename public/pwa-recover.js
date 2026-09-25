// Stable bootstrap: it runs before Vite's hashed CSS/JS, even when that entry fails.
(() => {
  const key = 'rdv-pwa-recovery-at';
  let recovering = false;

  function showHelp() {
    const render = () => {
      if (!document.body || document.getElementById('rdv-recovery-help')) return;
      const notice = document.createElement('div');
      notice.id = 'rdv-recovery-help';
      notice.setAttribute('role', 'alert');
      notice.style.cssText = 'position:fixed;inset:1rem auto auto 1rem;z-index:9999;max-width:24rem;padding:1rem;border-radius:1rem;background:#fff;color:#374151;box-shadow:0 8px 30px #0003;font:14px/1.5 system-ui';
      notice.textContent = '更新檔案暫時無法載入。請連上網路後關閉並重新開啟 Redolve。';
      document.body.append(notice);
    };
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  function recover() {
    if (recovering) return;
    recovering = true;
    const now = Date.now();
    try {
      const previous = Number(sessionStorage.getItem(key) || 0);
      if (!navigator.onLine || now - previous < 60_000) {
        showHelp();
        return;
      }
      sessionStorage.setItem(key, String(now));
    } catch {
      // The query marker still prevents a reload loop when storage is blocked.
      if (new URL(location.href).searchParams.has('rdv_reload')) {
        showHelp();
        return;
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
    }
    const url = new URL(location.href);
    url.searchParams.set('rdv_reload', String(now));
    location.replace(url.href);
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    const assetUrl = target?.src || target?.href;
    if (!assetUrl) return;
    try {
      if (new URL(assetUrl, location.href).pathname.startsWith('/assets/')) recover();
    } catch { /* Ignore malformed third-party URLs. */ }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (/dynamically imported module|failed to fetch module/i.test(String(event.reason))) recover();
  });

  window.addEventListener('load', () => {
    const url = new URL(location.href);
    if (url.searchParams.has('rdv_reload')) {
      url.searchParams.delete('rdv_reload');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }, { once: true });
})();
