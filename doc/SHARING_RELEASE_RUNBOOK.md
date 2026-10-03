# 共用／訂閱 v2 發布操作（2026-10-04）

目前尚未推送或套用遠端 0002。這份指令只供完成 `SHARING_IMPLEMENTATION_PROGRESS.md` 的上線門檻後執行；執行前先確認工作樹內容、遠端資料庫與自動部署設定。

在 `D:\Document_J\redolve` 的 PowerShell 執行：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/build-sw.mjs
node --test tests/sharing-api.test.mjs tests/sharing-access.test.mjs tests/pwa-release.test.mjs
& 'C:\Users\jx06t\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tests/sharing-schema.test.py
node node_modules/wrangler/bin/wrangler.js d1 time-travel info redolve-db
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('collections','assets','owner_transfers','d1_migrations') ORDER BY name;"
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --command "SELECT COUNT(*) AS item_count, COUNT(DISTINCT image_url) AS unique_image_keys FROM items;"
```

先保存當下 Time Travel bookmark 與輸出；四個查詢表名都應為空。若表已出現或資料量與預期差異很大，先停止並檢查，勿重複套用。`0001_auth_sessions.sql` 曾手動執行，遠端沒有 `d1_migrations` 紀錄，因此這次使用 `d1 execute --file` 套用單獨的 0002，不使用 `d1 migrations apply --remote` 重跑 0001。Time Travel 是可回到過去狀態的機制；還原會覆寫 bookmark 以後的寫入，不等同可無損還原的獨立備份。

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --file=.\worker\migrations\0002_sharing_collections.sql
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --command "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM assets) AS assets, (SELECT COUNT(*) FROM asset_refs WHERE role='source_image') AS source_refs;"
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --file=.\scripts\sharing-asset-audit.sql
```

遷移後必須核對每個 `items.image_url` 都有 ready 資產與 `source_image` 引用。若稽核中的 `missing_*` 非 0，先停止部署並修復。`unreferenced_ready_assets` 只作觀察，不可直接刪除；SQL 稽核無法證明 R2 物件存在。

推送 `main` 會觸發自動部署。分享功能目前已保存為本地預發布提交；確認目前分支、提交內容及工作樹無未提交改動後：

```powershell
git status --short
git log -1 --oneline
git diff origin/main..HEAD --stat
git push origin main
```

部署成功後立即補上舊 Worker 在遷移與部署間上傳的題目，確認輸出 `missing_source_links=0`，並再次執行稽核：

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --file=.\scripts\sharing-backfill-late-uploads.sql
node node_modules/wrangler/bin/wrangler.js d1 execute redolve-db --remote --file=.\scripts\sharing-asset-audit.sql
```

最後以登入及訪客裝置檢查集合、訂閱、個人存入／來源更新、舊單題連結、圖片上傳、PWA 更新與缺失 CSS hash 的 404。不要啟用實體資產 GC；R2 全量對帳與安全回收機制仍未完成。

管理者登入後開啟 `/admin/sharing`，按「檢查 D1 與 R2 圖片」，等雙向掃描完成；`找不到` 必須為 0。未登記於 D1 的 R2 物件須人工判斷是否為舊檔、staging 或真正孤兒，不可直接刪除。
