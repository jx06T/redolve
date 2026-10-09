# 共用／訂閱 v2：本次部署後操作指南

更新：2026-10-09。適用正式環境 `redolve-api`／`redolve-db`。

## 本次狀態與執行順序

- 使用者已提供正式 D1 七項資產引用稽核，全部為 0。此環境不再按舊流程重跑 `0002_sharing_collections.sql`。
- 推送 `main` 會自動建置並部署 Worker 與前端；**推送成功不等於部署成功**。
- 依序完成：確認自動部署 → 核對 schema → 回填晚到上傳 → D1 稽核 → 管理端 D1/R2 掃描 → 功能驗收。
- 本次搜尋與 UI 修復沒有新增 migration、secret 或搜尋服務。`placement.region` 已固定為 `gcp:asia-east1`。
- 以下命令在你已登入 Cloudflare 的 PowerShell 執行；任一步失敗或結果不符合預期，停止後續步驟並保留輸出。

## 1. 等待自動部署完成

在 Cloudflare `Workers 和 Pages → redolve-api → 部署` 確認這次 `main` 最新提交的建置及部署成功。建置須包含 `npm run build`（含 `scripts/build-sw.mjs`），部署須使用 repository 的 `wrangler.jsonc`。

```powershell
Set-Location D:\Document_J\redolve
git log -1 --format="%H %s"
$sharingHealth = Invoke-RestMethod 'https://redolve.jx06t.com/api/health'
if ($sharingHealth.status -ne 'ok') { throw 'Worker 健康檢查未通過' }
$sharingHealth
```

`/api/health` 的固定 `version` 不能辨識本次提交；請以 Cloudflare 部署頁的 commit 為準。若建置失敗，先處理建置，不要執行 migration 重試。

## 2. 唯讀確認分享 schema

```powershell
$sharingSchemaSql = "SELECT 'sharing_tables' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('assets','asset_refs','public_profiles','collections','collection_grants','grant_holders','invitations','owner_transfers','collection_items','shared_layers','collection_events','subscriptions','collection_item_reads','saved_refs','saved_snapshots','saved_snapshot_layers','personal_workspaces','user_upload_preferences','sharing_audit','maintenance_jobs','content_reports'); SELECT 'item_seq_columns' AS metric, COUNT(*) AS count FROM pragma_table_info('items') WHERE name IN ('content_seq','draw_seq','notes_seq');"
npx wrangler d1 execute redolve-db --remote --command "$sharingSchemaSql"
if ($LASTEXITCODE -ne 0) { throw '分享 schema 查詢失敗' }
```

預期：`sharing_tables=21`、`item_seq_columns=3`。若不同，停止並檢查實際 DDL，**不要直接重跑 0002**。先前 0001／0002 使用手動 execute，沒有 `d1_migrations` 也不代表未套用；本次不要執行 `d1 migrations apply --remote`。

## 3. 回填 migration 與部署間的晚到上傳

本腳本可重複執行，只補齊舊 Worker 尚未寫入的圖片資產／引用。

```powershell
$sharingBackfillSql = (Get-Content -Encoding UTF8 .\scripts\sharing-backfill-late-uploads.sql | Where-Object { $_ -notmatch '^\s*--' }) -join ' '
npx wrangler d1 execute redolve-db --remote --command "$sharingBackfillSql"
if ($LASTEXITCODE -ne 0) { throw '晚到題目回填失敗，停止後續驗收' }
```

最後一項必須顯示 `missing_source_links=0`。非 0 時保留輸出並處理引用異常。

## 4. 執行 D1 圖片引用稽核

```powershell
$sharingAuditSql = (Get-Content -Encoding UTF8 .\scripts\sharing-asset-audit.sql | Where-Object { $_ -notmatch '^\s*--' }) -join ' '
npx wrangler d1 execute redolve-db --remote --command "$sharingAuditSql"
if ($LASTEXITCODE -ne 0) { throw 'D1 圖片稽核失敗，停止後續驗收' }
```

需看見 **7 張結果表**：

| 指標 | 本次預期 |
|---|---|
| missing_source_asset_or_ref | 0 |
| missing_current_snapshot_image_ref | 0 |
| missing_current_snapshot_draw_ref | 0 |
| missing_shared_draw_ref | 0 |
| missing_personal_draw_ref | 0 |
| unreferenced_ready_assets | 0；若非 0，記錄並人工查原因，勿直接刪除 |
| nonready_referenced_assets | 0 |

所有 `missing_*` 及 `nonready_referenced_assets` 必須為 0。只有命令成功、沒有指標表，不能算通過。

使用七條獨立 SELECT 避免 compound SELECT 限制。遠端 `--file` 使用匯入流程，不顯示 SELECT 結果，因此本次稽核／回填使用 `--command`。PowerShell 去除整行註解並合成單行，避免多行 native 參數解析問題。

## 5. 管理端檢查 R2 實際圖片

1. 使用 `ADMIN_EMAILS` 中的管理者帳號登入，開啟 [資產稽核頁](https://redolve.jx06t.com/admin/sharing)。
2. 按「檢查 D1 與 R2 圖片」，等待兩個方向都完成全部分頁。
3. **D1 → R2**：針對 D1 已登記的 ready 圖片，用 R2 `head` 確認物件存在；`找不到` 必須為 0。
4. **R2 → D1**：列出 R2 物件，找出未登記在 D1 的檔案。它們可能是舊檔或 staging，須人工判斷，不能直接視為可刪除孤兒。
5. 保存兩個方向的結果。權限錯誤、網路失敗或只跑完部分分頁，都不算完成。

SQL 稽核只驗證資料庫引用，不能證明 R2 圖片存在。此頁只做報告，沒有刪除動作；實體資產自動 GC 維持關閉。

## 6. 功能驗收

| 項目 | 操作與預期 |
|---|---|
| 圖片多選 | iPhone Chrome 非 PWA、iPad Safari／PWA：一次選取 2 張截圖，應出現 2 張縮圖；再選 1 張變 3 張。點縮圖開預覽，右上角垃圾桶只刪該張。確認上傳後可開啟全部圖片；另驗訪客模式。 |
| 草稿高度 | 將推導草稿區延伸至非預設高度並書寫；反覆收合／展開後高度與筆跡一致。收合只隱藏區域。調整高度、等待存檔後重新整理，仍保留調整值。 |
| 集合與貢獻 | A 建立啟用集合，邀請 B 為貢獻者並由 B 接受；B 只能加入自己的原題。A/B 可書寫各自共用層，能看到對方獲准顯示的筆記。修改來源文字／標籤即時反映；不支援替換原圖。 |
| 訂閱與存入 | C 以觀看者訂閱，看到既有及新增題目；共用頁有綠色識別。存入一題後可在「我的題庫」開啟自己的版本與訂正；更新來源保留自己的筆跡／筆記。 |
| 撤權 | 暫停集合或撤掉 C 的觀看權：C 不能再讀來源或取得新下載；已存入的版本、圖片與自己的筆記仍可使用。C 不可寫入共用層。 |
| 搜尋 | `/search?scope=mine` 搜尋原題與已存；`/search?scope=shared&subscribed=yes` 含訂閱前已有題目；`/search?scope=public` 只顯示啟用且列入探索的公開集合。撤權後共用結果消失，已存仍可在 mine 搜尋；他人私人筆記不能被搜尋。 |
| 舊功能 | Google 登入／登出、Gemini 分析、guest 上傳、舊單題分享連結及撤銷仍正常。 |
| PWA／CSS | 已安裝 PWA 收到更新後重新開啟仍有完整樣式；瀏覽器 Network 的本次 CSS／JS 皆為 200、類型正確。不存在的 `/assets/index-release-audit-missing.css` 必須為 404，不能是 200 HTML。 |

本機無頭 Edge 已測試 iPhone UA 的多選／預覽／刪除與桌面／390px 草稿高度；不能取代實機系統選圖、Apple Pencil、Safari/PWA 的驗收。

## 失敗時

- SQL 稽核失敗：只修正／重試稽核；不要因此重跑 migration。
- 自動部署失敗：保留 Cloudflare 建置輸出，可於你已登入的終端以 `npx wrangler tail redolve-api --format=pretty` 觀察請求。設定目前未啟用持久 Workers Logs，僅看 Observability 歷史頁可能沒有錯誤紀錄。
- 功能驗收失敗：記錄操作、帳號角色、裝置、HTTP 狀態及 tail 訊息，再決定是否回退 Worker 版本。
- D1 Time Travel 還原是額外的資料覆寫操作，會撤銷 bookmark 之後的寫入，**不是本指南的正常步驟**。若考慮還原，須先確認目前可還原時段及新資料的處置；不要把下方歷史 bookmark 當成永遠有效。[Cloudflare Time Travel 文件](https://developers.cloudflare.com/d1/reference/time-travel/)

## 歷史發布準備紀錄（不用執行）

使用者於本次準備提供的 bookmark：`0000025b-00000000-000050ff-ed84be0adeee5723fa0da8a8bf9bd70a`。保留作查核；它不是最新 bookmark，也沒有在本次操作中執行 restore。

首次 migration 的舊流程已移出本次執行步驟。若日後建立全新環境，依完整 `worker/schema.sql` 或該環境的遷移歷史初始化；不要直接套用此正式環境的既有狀態假設。
