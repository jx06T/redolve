# 刷題恢復與共用個人進度發布

適用已完成 0002／0003 的正式資料庫。本輪只新增 0004 的 collection_item_progress；不需新 secret、R2 複製、Gemini 配置或舊 migration 重跑。

## 使用者操作（推送前）

在目前專案根目錄執行：

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-study-ux.ps1 -CheckOnly
& .\scripts\apply-study-ux.ps1
```

腳本先驗證既有 reader_tables=2、starred_column=1、classification_column=1，再取得當下 Time Travel bookmark，新增進度表並重查。預設使用專案內 Wrangler；local 代表 CLI 來源，資料庫仍為 remote。保留 bookmark 輸出供事故復原，不執行 restore。

完成輸出應為 study_progress_table=1、study_progress_columns=7。已存在的表會跳過新增。這是單一 CREATE TABLE IF NOT EXISTS，失敗或中斷後可重跑；若已存在表缺欄位則停止，不自行刪除或覆寫。

任何例外均停止後續操作，保留原始輸出。CheckOnly 不改資料庫。不要把本機測試結果當成遠端已套用。

## Cloudflare 授權失敗（7403）

若 schema 查詢出現 `The given account is not valid or is not authorized to access this service [code: 7403]`，代表目前 CLI 憑證無法存取 API 路徑內的帳號。原因可能是登入帳號／授權、Token 帳號範圍／D1 權限；單憑 7403 不能判定 Token 已過期。腳本停止於查詢，不會繼續取得 bookmark 或新增表；不用 restore 或重跑 0003。

先使用與腳本相同的本機 CLI：

```powershell
node .\node_modules\wrangler\bin\wrangler.js whoami
```

確認帳號清單包含 `ff06bc9388b298c86623efe1225f0ea9`。若使用 OAuth，重新登入擁有此帳號的 Cloudflare 使用者：

```powershell
node .\node_modules\wrangler\bin\wrangler.js login
node .\node_modules\wrangler\bin\wrangler.js whoami
```

若顯示使用 API Token，Token 環境變數優先於 OAuth；重新 login 不會自動修正 Token。Token 必須可存取上述帳號，套用 schema 需要 Account → D1 → Edit。可修正 Token，或選擇改用 OAuth；改用 OAuth 時僅清除目前 PowerShell 的憑證變數，再登入：

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN, Env:CLOUDFLARE_API_KEY, Env:CLOUDFLARE_EMAIL -ErrorAction SilentlyContinue
node .\node_modules\wrangler\bin\wrangler.js login
node .\node_modules\wrangler\bin\wrangler.js whoami
```

不修改系統／使用者層級環境變數，不輸出或貼上 Token。若 `CLOUDFLARE_ACCOUNT_ID` 設成其他帳號，改用正確帳號；不要為排除授權錯誤而建立另一個資料庫。

登入確認後先執行 CheckOnly；成功才執行下一條套用命令：

```powershell
& .\scripts\apply-study-ux.ps1 -CheckOnly
# 僅在上一條成功後，另外執行：
& .\scripts\apply-study-ux.ps1
```

`whoami` 成功只證明登入可用，仍須遠端 schema 查詢成功才代表能存取目標 D1。最終 table=1、columns=7 才可發布。

來源：[Wrangler login／whoami](https://developers.cloudflare.com/workers/wrangler/commands/general/)、[Wrangler 憑證環境變數](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)。本機 Wrangler 原始碼亦確認有環境憑證時 login 不會替換其憑證。

## 自動部署

確認上述兩個值後，才推送 main 或請 agent 推送：

```powershell
git status --short
git log -5 --oneline
git push origin main
```

本輪未自動推送。CI 使用完整 npm run build，包含 SW/hash 清單。前端與 Worker 均須對應此次推送 commit。舊程式可與新增表共存；回滾程式時保留表，不需回滾整個 DB。

## 發布後驗收

- 刷題無全站頁首；來源／返回懸浮，搜尋與共用集選擇在樹狀側欄。手機用左上角按鈕展開側欄。
- 三來源皆使用原題卡，原題「加入指定共用集」位於封存旁。
- 本輪個人題庫刷題／搜尋先採手動「載入更多題目」。失敗後題目保留、按鈕變成「重試載入更多」；不可連點重複請求。大綱獨立分頁讀取 metadata，不下載所有題圖／筆跡。
- 共用題完成／封存只影響本人、該集合題目的進度。另一成員與原題不變；解除封存恢復原狀態。
- 搜尋簡單／完整皆供查閱；完整檢視無書寫、刪除或訂正狀態操作。前往刷題再返回保留搜尋與位置。
- 設定五項同列，個人檔案整合名稱、預設目的地與 API Key；共用集以列表管理。
- 集合題目管理採精簡列表；已有成員顯示公開暱稱，未設公開名稱者使用帳號暱稱，仍無名稱時顯示未設定暱稱。
- 實機 iPad Pencil／iPhone、慢連線與斷線續載由使用者最後驗收；本機模擬無法代替實機。

實體資產自動刪除維持關閉。既有 iPad／手機刻意操作設計不在本輪調整。
