# 學習計畫發布指南

更新：2026-10-13。實作規格：[STUDY_PROGRESS_WIDGET_PLAN_2026-10-13.md](./STUDY_PROGRESS_WIDGET_PLAN_2026-10-13.md)。

## 已完成

- Dashboard 新增獨立學習計畫頁；預設平板以上三頁、手機五頁，保留最後面板記憶及滑頁間距。
- 每條計畫點左 25% 減一、右 25% 加一；中間 50% 無反應，不顯示加減按鈕。滑頁與捲動不計次。
- 設定 → 個人檔案 → 首頁小組件 → 學習計畫，管理新建、名稱、目標、單位、拖曳排序、移除與顯示開關。首頁三點菜單可直達。
- 已完成保留原位；降低目標保留實際已完成數。無截止日期、批次數值輸入或直接進度編輯。
- 登入資料跨裝置同步，訪客只在本機。40 秒快取、無輪詢；計次只更新自身資料，不重抓題庫或課綱。
- 耐久離線佇列、伺服器原子增減與操作去重；遺失回應後可核對收據，不會把加一重算。
- 隱私政策已補計畫資料及刪除方式；沒有新增 AI、分享、secret 或 binding。

## 驗證與環境

- TypeScript、正式建置／SW、PWA、API、發布腳本合成測試通過。
- 390／1280px、訪客／登入瀏覽器通過：點擊範圍、原生觸控滑頁、鍵盤、離線重整、遺失回應、設定管理／排序、達標及下修目標、衝突採用雲端、帳號隔離。
- 原有待辦／倒數與 Dashboard 滑頁回歸通過；實體裝置與正式跨裝置仍待發布後驗收。
- 本地 DB 已套用 0012，完整 schema 檢查通過；21 題與 15 個原有小組件項目保留，外鍵檢查無錯誤、todo_order 欄位不存在。備份 `.wrangler/local-db-backups/2026-10-13T04-25-49-141Z`；此操作只使用 `--local`，未寫入正式 D1。
- 正式 DB 未由 agent 操作。新表未建立時只會使學習計畫接口回 503 `PROGRESS_SCHEMA_PENDING` 並保留草稿，原有功能正常；migration 後按「重試同步」或重新開啟頁面。

## Migration 規則

- 本次唯一新增：`worker/migrations/0012_study_progress.sql`，三表、兩索引；不重建或替換舊表。
- `0011_todo_order.sql` 已撤回，正式未執行；**不要套用 0011**。本地也維持沒有 todo_order。
- 腳本先唯讀檢查既有 0009 首頁小組件結構；完整才繼續。0010 倒數排序沿用原功能，本次不更動。
- 正式腳本由專案內 Wrangler 啟動；先取得 Time Travel bookmark 再寫入，完成後再次核對。完整狀態重跑會跳過；部分結構或任何 API／JSON／DDL 錯誤會停止，不猜測補表。
- 不使用 `d1 migrations apply` 批量套用歷史 SQL，也不要求匯出含 FTS 的整個資料庫。

## 使用者最後執行

在 PowerShell 執行；保存腳本輸出的 Time Travel bookmark。

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-study-progress.ps1 -CheckOnly
& .\scripts\apply-study-progress.ps1
& .\scripts\apply-study-progress.ps1 -CheckOnly
```

最後結果必須為：

```text
progress_tables=3
progress_indexes=2
plan_columns=10
preference_columns=5
operation_columns=7
```

- `-CheckOnly` 是唯讀；首次尚未套用時五項為 0。完整後正式執行也會提示「0012 已完成，未重複寫入」。
- 若收到 7403，先確認同一 CLI 的登入帳號與 D1 權限：`node .\node_modules\wrangler\bin\wrangler.js whoami`。OAuth 帳號可重新 `login`；若使用 API Token，應修正帳號範圍與 D1 權限。不要在錯誤後繼續部署指令或當成 schema 缺失。
- 新版本沿用 Git push 自動部署。等待部署完成後，在設定新增一個計畫，首頁右側加一／左側減一；兩台裝置分別加一、重新同步後應共增加二。實體手機直接滑過進度列不應計次。
