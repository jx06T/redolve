# 獨立單題分享發布指南

狀態：本機實作與驗證完成；2026-10-11 使用者確認遠端 0007 就緒，已授權推送；自動部署結果待確認。必讀規則：SHARING_SPEC Q01–Q11。

本次遠端確認：`allow_reshare=1, reshare_allowed=1, share_tables=2, share_trigger=1, share_view=1, share_indexes=4`；套用流程 `missing_share_refs=0`。本環境不需重複套用 migration。以下部署前指令保留供尚未套用的環境使用。

## 部署前，由你在專案 PowerShell 執行

正式 D1 需要新增 **0007**。原本 0005／0006 必須已完成。不要向既有正式庫套用整份 schema.sql，也不要重跑完整 one-time migration。

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-independent-shares.ps1 -CheckOnly
& .\scripts\apply-independent-shares.ps1
& .\scripts\apply-independent-shares.ps1 -CheckOnly
```

- `-CheckOnly` 只讀。未完成時會列出缺少的欄位／物件；以輸出指標為準，不能只看退出碼。
- 完整指標：`allow_reshare=1, reshare_allowed=1, share_tables=2, share_trigger=1, share_view=1, share_indexes=4`。
- 套用腳本先取得 **當次** Time Travel bookmark；請保存輸出。只有取得成功才新增欄位／表／引用 trigger／view／索引。
- 成功時 `missing_share_refs=0`。中斷可重跑同一腳本，已存在欄位不重複 ALTER。
- 如果出現 7403，使用同一 CLI 執行 `node .\node_modules\wrangler\bin\wrangler.js whoami` 確認帳號；OAuth 使用者重新 `login`。API Token 使用者確認帳號與 D1 權限。腳本失敗會停止；先修正授權。
- 不需新增或修改 secrets、環境變數、R2 bucket、定時工作。

確認後再要求推送，由原本 Git CI/CD 自動部署前端及 Worker。migration 是加法，舊版本仍可服務；新版本依賴新 schema，必須先 migration。

## 部署後

### 引用稽核

```powershell
$sharingAuditSql = (Get-Content -LiteralPath .\scripts\sharing-asset-audit.sql -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*--' }) -join ' '
node .\node_modules\wrangler\bin\wrangler.js d1 execute redolve-db --remote --command "$sharingAuditSql"
```

- 新增 `missing_share_asset_ref`，所有 `missing_*` 必須 0；`nonready_referenced_assets` 的非 0 需確認是否刻意 quarantine。
- `unreferenced_ready_assets` 可能包含已撤銷／更新後的待回收資產，不可直接據此刪圖。物理 GC 維持關閉。
- 稽核改用 `asset_reference_inventory` 保留根聯集；此最新版 SQL 要在 **0007 後**執行。
- `/admin/sharing` 雙向掃描依舊用於確認 D1 記錄與 R2 物件是否存在；SQL 引用稽核不代表題圖 bytes 一定存在。

### 操作驗收

1. 新建 public／指定對象／持連結集合：「允許存入後再分享」預設開啟，可於建立前關閉。
2. 既有集合預設關閉。作者在管理頁開啟；舊存入題按右上「檢查來源更新」→「更新來源內容」，才取得再分享授權，個人訂正保持。
3. 我上傳／我存入／共用中：右上分享按鈕開啟同一視窗；未完成同步時不能建立。分別測試包含／排除本人筆跡、筆記。
4. 無痕開啟 `/share/qs_...`：直接讀圖／本人作業；私人來源不顯示集合名稱或入口。登入有權帳號後才顯示前往來源；登入回到同一分享頁。
5. 分享版本不隨來源編輯／撤權／下架或刪除個人已存版本而改動。檢視來源集合仍受 ACL 限制。
6. 設定→個人檔案→「我的單題分享連結」：即使原題或已存版本刪除，仍可撤銷。撤銷後 metadata／image 不可讀。
7. 過期分享顯示已過期；「清除我的過期連結」移除保存文字及引用。該清理不直接刪除 R2 題圖。
8. 舊 share token 仍讀活原題；原集合題連結仍需集合觀看權，兩者保持相容。

## 本地

本輪已備份並套用 0007，保留 21 題／7 份筆跡／4 份文字筆記。備份：`.wrangler/local-db-backups/2026-10-11T06-14-12-317Z`。

```powershell
node .\scripts\init-local-db.mjs --check
# 在其他本機缺少 schema 時才執行，僅處理 local D1，會先備份：
node .\scripts\init-local-db.mjs
# 重啟本地 Worker；另一終端啟動前端：
npm run worker:dev
npm run dev
```

## 邊界與後續

- 目前只新增分享者管理與過期清理；不新增全站 cron，也不啟用物理 R2 GC。最後引用消失後仍需既有稽核／後續 GC 才釋放實體 bytes。
- 若有人另行下載內容，撤銷網站連結不能回收對方已下載的檔案。
- 治理操作 quarantine 能停止新式獨立分享；一般來源下架不會等同 quarantine。
- 正式環境 0007 migration 已由使用者完成並核對。自動部署、真實 OAuth 成功換帳號與實體 iPhone／iPad 觸控驗收仍需確認。本地瀏覽器回歸使用合成 API；權限／交易／資產保存由實際 Miniflare D1/R2 回歸驗證。
