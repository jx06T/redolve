# 共用中清單快取發布指南（2026-10-11）

## 範圍與順序

1. 既有分享 schema、reader UX、study progress（0002～0004）須已完成。
2. 先記錄正式 D1 的 Time Travel bookmark。
3. 套用 **0005_shared_search_cache.sql**，驗證結果。
4. 使用已核准的 Git 推送流程觸發自動部署；不需新增 secret / binding。
5. 新版部署後驗收 Network 與權限。

0005 僅新增 3 張版本表、28 個版本計數 trigger 與既有集合的版本回填，不刪除題目、筆跡或 R2 圖片。可重複執行；不重設已有 revision。中途失敗時 ready 保持 0；成功完成才設為 1。新版在缺表／ready=0 時仍執行完整搜尋，不用舊快取。

## 正式 D1：PowerShell 指令

在專案根目錄執行。使用已安裝的 Wrangler，避免 npx executable 問題。不要套用整份 worker/schema.sql 到既有正式庫。

```powershell
Set-Location D:\Document_J\redolve

node .\node_modules\wrangler\bin\wrangler.js d1 time-travel info redolve-db
if ($LASTEXITCODE -ne 0) { throw '無法取得正式 D1 bookmark；停止' }
# 保存上方 current bookmark，再執行下一步。

node .\node_modules\wrangler\bin\wrangler.js d1 execute redolve-db --remote --file=.\worker\migrations\0005_shared_search_cache.sql
if ($LASTEXITCODE -ne 0) { throw '0005 套用失敗；不要部署，保留輸出並重新檢查' }

$sharedCacheCheck = "SELECT schema_version,ready FROM collection_search_cache_config WHERE id=1; SELECT COUNT(*) AS version_tables FROM sqlite_master WHERE type='table' AND name IN ('collection_search_cache_config','collection_search_versions','collection_search_user_versions'); SELECT COUNT(*) AS version_triggers FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_version_%'; SELECT COUNT(*) AS missing_versions FROM collections co LEFT JOIN collection_search_versions v ON v.collection_id=co.id WHERE v.collection_id IS NULL;"
node .\node_modules\wrangler\bin\wrangler.js d1 execute redolve-db --remote --command "$sharedCacheCheck"
if ($LASTEXITCODE -ne 0) { throw '0005 驗證查詢失敗；停止' }
```

必須確認輸出：

| 欄位 | 預期 |
|---|---:|
| schema_version | 1 |
| ready | 1 |
| version_tables | 3 |
| version_triggers | 28 |
| missing_versions | 0 |

既有 collections 為空也須 missing_versions=0。不要只看程序 exit code；SQL 查詢成功不代表上表的數字正確。Wrangler --file 可能要求確認短暫資料庫不可查詢，依終端提示處理。

## 本地 D1

停止本地 Worker，再執行（只使用 .wrangler/state，會先備份已有本地庫）：

```powershell
node .\scripts\init-local-db.mjs
if ($LASTEXITCODE -ne 0) { throw '本地 schema 初始化失敗' }
node .\scripts\init-local-db.mjs --check
if ($LASTEXITCODE -ne 0) { throw '本地 schema 檢查未通過' }
npm run worker:dev
```

## 部署後驗收

- Network：在搜尋／刷題的「共用中」選擇一個可貢獻集合，首次 search 為 200，帶 ETag 與 X-Redolve-Collection-Version。
- 40 秒內切換來源再回來：仍發送 search（驗權），If-None-Match 命中時為 304；原分頁可還原。不應把 304 當成錯誤。
- 別的裝置修改標籤、來源、共用筆記、集合名稱／權限後返回：應為 200 並取得新內容。
- 對方撤銷我的貢獻權限：不可返回 304 或舊清單；目前 API 契約為 200 空結果，沒有 ETag。已有題圖／筆跡 API 仍各自驗權。
- 他人的貢獻授權自然到期，不能因沒有寫入而沿用其失效內容。
- 我的完成訂正／封存與存入狀態會失效我的清單；不應改變別人的個人進度。
- 到期／手動重新整理／切換登入帳號後，不帶旧 ETag 直接取得資料。
- 探索、延伸題目及一般觀看模式不啟用此快取。
- 不啟用瀏覽器「Disable cache」作為日常 UX 模擬；這是應用記憶體驗證，HTTP 與 SW 仍維持 no-store。
- 正式 D1 比較完整搜尋與版本查詢指紋的 rows_read、calls、rows_written、P50/P99。合成資料成效不是正式成本保證。

## 停用／回退

若需停用版本驗證，可由管理者執行下面單一設定；清單立即改為完整查詢，既有內容不變。先修復原因再啟用，勿刪 trigger／版本表而保留 ready=1。

```powershell
node .\node_modules\wrangler\bin\wrangler.js d1 execute redolve-db --remote --command "UPDATE collection_search_cache_config SET ready=0 WHERE id=1;"
```

回退前端／Worker 至舊版本時可保留這些新增表與 trigger。D1 Time Travel 還原是整庫操作，會涉及 bookmark 之後的其他寫入；不作為日常關閉快取的方法。

參考：[Wrangler D1 指令](https://developers.cloudflare.com/d1/wrangler-commands/)、[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。
