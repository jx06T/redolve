# PWA 發版與靜態檔案一致性

## 問題與原則

Cloudflare 的 SPA fallback 可能讓已移除的 `/assets/*.css` 或 `.js` 回傳 `200 text/html`。若 HTML、Service Worker 與靜態檔案分屬不同次建置，已安裝的 PWA 會出現全域 CSS 失效或空白畫面。

- `npm run build` 先產生 Vite 檔案，再由 `scripts/build-sw.mjs` 用同一份 `dist` 生成 `sw.js`。版本 ID 由所有預快取檔案的路徑與內容計算；不要手動維護版本字串。
- 安裝新版 SW 時，HTML、CSS、JS 與其餘公開靜態檔案必須全部取得且 MIME 正確，才算安裝成功。不要把失敗的資源吞掉後啟用不完整快取。
- 新版 SW 等待使用者按「更新」才接管。已開啟分頁可能仍引用舊 hash，所以不在啟用時刪除舊版靜態快取。API 回應與使用者圖片不進入 SW 快取。
- 導航時向網路取得最新 HTML；離線時只使用目前完整建置的 `/index.html`。`/` 與 `/index.html` 不應長期快取；帶 hash 的 `/assets/*` 可長期快取。
- `/assets/*` 先經 Worker 驗證 MIME。遺失或回傳 HTML 的路徑應是 `404`，不能偽裝成有效的 CSS/JS。
- `pwa-recover.js` 在 Vite 入口檔之前執行。若入口資源無法載入，線上時限次重載，離線或持續失敗時顯示可讀提示。

## 發版前驗證

1. 執行 `npm run build`；這會檢查 HTML 中的靜態檔案參照是否都存在於同次建置。
2. 執行 `wrangler deploy --dry-run`，確認 Worker 與靜態檔案一起打包。
3. 在本機 Worker 檢查 `/assets/<本次 CSS hash>.css` 為 `200 text/css`，不存在的舊 hash 為 `404`，`/` 與 `/sw.js` 不長期快取。
4. 安裝 PWA 後再建置新版，確認更新提示出現；按「稍後」仍可使用舊頁，按「更新」後重新載入新版本。再用離線模式確認已安裝版本可開啟。

`doc/guide/pwa-sw-scroll.md` 的 PWA 程式碼範例是舊版歷史資料；目前以此文件及實際程式碼為準。其 iPad 捲動與 viewport 設計仍維持現狀。
