# UI/UX 重整發布指南

適用已完成共用 v2（21 張 sharing 表、items 三個 seq 欄位）的 redolve-db。此次新增 0003 的兩個欄位，**先套用，再推送觸發自動部署**。不需新增 secret 或改變 Gemini placement。

## 1. 使用者先執行

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-reader-ux.ps1
if (-not $? -or $LASTEXITCODE -ne 0) { throw '停止發布並保留輸出' }
```

腳本預設為 `-WranglerMode auto`：有專案 `node_modules/wrangler/bin/wrangler.js` 時直接透過 Node 啟動，未安裝時才選擇 npx。啟動失敗會停止，不在資料庫操作途中自動切換 CLI。

腳本先讀正式 schema、確認兩張必要資料表，只新增缺少的欄位；套用前輸出當下 Time Travel bookmark。兩欄都存在會跳過。任一步失敗會停止，可重跑腳本查詢後補缺少的欄位。不要再跑 0001／0002，也不要對已存在兩欄的資料庫直接重跑 0003 SQL。

必須看見 `reader_tables=2`、`starred_column=1`、`classification_column=1`。這兩個欄位是 additive change，舊 Worker 仍可運作。腳本不做還原、不刪除資料、不匯出含 FTS 的 DB。

### 若之前遇到 npm「could not determine executable to run」

2026-10-10 已修正腳本將單一字串展開成逐字 CLI 參數的問題；先前卡在第一次 schema 查詢的這個錯誤尚未執行 ALTER。使用修正後的本機腳本，直接重跑 §1 即可，不需回滾。若需明確指定專案 Wrangler：

```powershell
& .\scripts\apply-reader-ux.ps1 -WranglerMode local
if (-not $? -or $LASTEXITCODE -ne 0) { throw '停止發布並保留輸出' }
```

`local` **只代表 CLI 從本機 node_modules 啟動**；腳本內 D1 目標仍為 `redolve-db --remote`。也可明確使用 `-WranglerMode npx`。CLI、驗權或查詢失敗時，保留完整輸出並停止推送。

如果 PowerShell 的腳本執行政策阻擋，直接在現有終端貼上腳本內容執行即可；不需要改全域政策。

## 2. 推送與自動部署

本次實作尚未推送。確認 §1 成功後再推送已確認的本機提交（或請 agent 推送）：

```powershell
git status --short
git log -3 --oneline
git push origin main
```

到 Cloudflare 確認 Worker、前端都對應該 commit 並成功建置。CI 必須執行完整 `npm run build`，包含 SW manifest/hash 產生；不要只用 `vite build`。健康檢查固定版本不能代替 commit 確認。

```powershell
$readerHealth = Invoke-RestMethod 'https://redolve.jx06t.com/api/health'
if ($readerHealth.status -ne 'ok') { throw 'Worker health 未通過' }
$readerSchemaSql = (Get-Content -Encoding UTF8 .\scripts\reader-ux-schema.sql) -join ' '
npx wrangler d1 execute redolve-db --remote --command "$readerSchemaSql"
if ($LASTEXITCODE -ne 0) { throw 'UI/UX schema 核對失敗' }
```

其他手動查詢若遇到 npx 啟動問題，可將 `npx wrangler` 換為 `node .\node_modules\wrangler\bin\wrangler.js`。第一步的預設腳本已優先使用專案 Wrangler；不要為此改 secrets。

## 3. 功能驗收

- 五導覽：總覽／刷題／搜尋／設定／延伸題目；行動底部無上傳入口，上傳在頂部。
- 刷題與搜尋：三來源；選共用集後只寫自己的共用層；僅訂閱者不得出現在可貢獻清單。
- 延伸題目：未選集不載入題目；只列明確訂閱集合；完整圖片；星號不存入；存入後原卡仍在，可前往綠色私人訂正。
- 存入：官方分類沿用；自訂分類背景辨識，失敗保留未分類題目；手動分類優先；重新整理與撤來源權後自己的版本仍可讀。
- 返回：保留來源、集合、查詢、篩選、排序及題目位置；離開頁面不取消尚未同步作業。
- 集合管理：跨分類選取保留；失敗只重試未成功 ID；Switch 文字不會切換；刪除使用應用內對話框。
- 公開探索：由總覽進入，無查詢也有題圖；搜尋固定公開範圍，不混入私人搜尋。
- iPhone／iPad 實機：一次多選截圖、預覽與右上刪除、重複收合、旋轉裝置、Apple Pencil 書寫與重新開啟後驗證筆跡。
- 離線／403／409：不得顯示已同步；保留本機草稿；換帳號不重播前帳號作業。撤權以後端各次讀寫驗權，已顯示內容無法追溯收回。

題圖資產引用維持既有規則；實體資產自動刪除仍關閉。若要再確認引用，沿用 SHARING_RELEASE_RUNBOOK.md 的 D1/R2 稽核章節，不重新跑分享 migration。

## 4. 本機確認方式

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vite\bin\vite.js build
node .\scripts\build-sw.mjs
node --test tests/sharing-api.test.mjs tests/search.test.mjs tests/sharing-access.test.mjs tests/pwa-release.test.mjs
python tests/sharing-schema.test.py
python tests/reader-migration.test.py
& .\tests\reader-release.test.ps1
```

瀏覽器測試使用 Python Playwright 與已安裝的 Edge，API 全部為測試替身，不碰正式資料。已有 Playwright 時可執行：

```powershell
python .agents/skills/webapp-testing/scripts/with_server.py --server "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4181 --strictPort" --port 4181 -- python tests/reader-ux.browser.py
```

以上本機驗證已由 agent 完成；發布者不必為部署重新安裝測試工具。實機、正式 Gemini 分類成功及部署後的雙帳號協作需於 §3 驗收。


Wrangler 指令參照：[Cloudflare D1 CLI](https://developers.cloudflare.com/d1/wrangler-commands/)。
