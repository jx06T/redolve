# 個人分析合併與本地／雲端設定

日期：2026-11-03。適用於本次個人辨識、訂正整理、原題練習及階段分析版本。

最新配置：已移除三個前端 `VITE_…_ENABLED` 開關；入口與帳號內同步直接提供，功能停用與權限仍由後端控制。後端三個開關集中在 `wrangler.jsonc` 的 `vars`，目前均為 `"true"`，本地與雲端發布使用相同預設；`a2e8592` 已依使用者授權推送至 `main`。

登入後，頂部導覽依序提供「原題練習」「分析」「探索」，各有圖示及目前頁面狀態；行動版導覽選單沿用相同入口。既有「刷題」仍開啟題庫訂正頁。

本次配置與入口調整驗證：TypeScript、將舊三個前端開關全部設為 `false` 的正式建置、Service Worker 建置、34 項相關測試及 Worker 本地打包預演均通過。模擬 API 瀏覽器驗證涵蓋 390／1024／1280px 導覽、登入限制、分析與練習入口，以及舊開關為 `false` 時仍提交訂正合成圖辨識；沒有呼叫正式模型或修改正式資料。

正式遷移修正：使用者最初回報的 `pending: []` 僅涵蓋 0015～0019，不能代表整個 main 已準備完成。2026-11-03 發布後唯讀檢查確認 **0020 星號遷移缺漏**（三個 `starred` 欄位、兩個索引、一個 trigger），搜尋會無條件讀取這些欄位而造成 500。使用者選擇自行執行遷移後，最新統一唯讀檢查已確認 **0014～0020 `pending: []`**；agent 沒有對正式 D1 執行遷移。以下增量命令保留供其他環境檢查，不能重跑整份 schema：

```powershell
node scripts/apply-personal-stars.mjs --remote --check
node scripts/apply-personal-stars.mjs --remote
node scripts/apply-personal-stars.mjs --remote --check
```

套用腳本先保存 Time Travel 書籤，最後應顯示 `Missing: none`。後續發布前使用涵蓋 0014～0020 的統一唯讀檢查（缺漏會回傳非零結束碼）：

```powershell
node scripts/check-release-schema.mjs --target=remote
```

本地改為 `--target=local`；若只需補上本地 0020，使用 `node scripts/apply-personal-stars.mjs --local`。本文下方的早期 0014～0019 檢查保留作為歷史背景。

動態模組事件修正：正式資源探測時，先前報錯的 `QuestionLibraryView-DY3dYGNp.js` 已回傳 200，無法再現先前的 404。但既有恢復程式漏接 Vite 的 `vite:preloadError`：React.lazy 捕獲拒絕後，不會發出 `unhandledrejection`。恢復程式已補上此事件，沿用每分鐘至多一次的重新載入與離線提示，不清除 IndexedDB、筆跡或待同步紀錄。

修正驗證：TypeScript、Vite／Service Worker 建置及 13 項 PWA／遷移 CLI 測試通過。隔離瀏覽器以真實正式建置模擬題目模組首次 404，伺服器紀錄確認一次重載後模組回傳 200、成功顯示刷題頁。尚未使用正式登入帳號重跑搜尋 API，不能以 schema 完整取代完整線上功能驗收。

## 本次實際檢查結果

- 已取得遠端 `origin/main`，版本為 `a76abc8`，並在功能分支整合主線。
- 四個衝突檔案：`ProblemCard.tsx`、`CollectionDetailView.tsx`、集合管理瀏覽器測試與共用進度文件。
- 訂正流程保留單一完成入口：儲存成功／本機保留後、擷取訂正合成圖、排入辨識，再前往下一題；浮動與底部按鈕一致。撤回完成不前進，存入／共用進度失敗不前進、不送出訂正辨識。
- 集合管理保留主線的緊湊卡片、縮圖彈窗、標題前往共用刷題、右下移除按鈕；不恢復已移除的上移／下移及重複原圖連結。
- 0018 的 trigger 僅將 `BEGIN`／`END` 排版為獨立行，供舊 SQL 載入流程正確解析；與既有正規化結構定義相同，不需重套已安裝的 0018。
- **本地唯讀檢查：0014～0018 與既有基礎 schema 已完整，只缺 0019** 的 `analysis_subject_state`、`analysis_report_cycles`、`idx_analysis_completed_subject`、`idx_practice_received`。
- **初次雲端唯讀檢查未成功**：曾回傳 `7403`。後續使用者已成功套用並檢查 0014～0019，最新結果見本文開頭。
- 本次沒有對使用中的本地或正式資料庫執行遷移，也未推送或手動部署。測試使用隔離 Miniflare 與模擬 API。

整合驗證：前端及 Worker 入口 TypeScript、啟用三個功能開關的正式建置、Service Worker 建置與 **87 項測試全部通過**。測試包含辨識／訂正／練習／階段分析、原題作業同步、來源共用、單題分享、集合成員、共用搜尋快取與 PWA。瀏覽器以模擬 API 驗證上傳題／存入題的底部與浮動完成、撤回、儲存失敗、共用題不送個人辨識，以及 390／1280px 集合篩選、草稿、候選選取、圖片彈窗與同頁導航；不等同真實模型或 iPad 實機驗收。

以下命令在 `D:\Document_J\redolve` 執行。沿用現有秘密值，不覆蓋整份環境檔、不重建資料庫。Git 分支不會隔離 `.wrangler/state` 或正式 D1。

### 遠端執行後出現 `Unexpected token '├'`

Wrangler 4.120.0 在 `d1 execute --remote --file ... --json` 執行遠端匯入時，仍可能把上傳進度寫入 stdout。舊腳本直接對整段輸出 `JSON.parse`，會在資料庫已執行成功後報錯。這不代表 D1 自動回復，也不能據此直接重跑該份 SQL 或還原 bookmark。

已改用共用 `scripts/wrangler-d1-output.mjs`：容許進度文字與 ANSI 樣式，只接受完整、每筆 `success: true` 且有 `results` 的 D1 結果；不完整、失敗或多份矛盾結果仍停止。套用後再次檢查實際 schema，重跑腳本會跳過已完整安裝的版本，不自動重送同一份 SQL。

2026-11-03 使用者貼出的後續檢查已顯示 0014、0015 完整，只剩 0016～0019；那是當時狀態，續跑仍以最新 `--check` 為準。使用修正後的腳本執行：

```powershell
node scripts/apply-learning-schema.mjs --target=remote --check
node scripts/apply-practice-schema.mjs --target=remote --apply
node scripts/apply-practice-schema.mjs --target=remote --check
```

若出現真正的 D1 執行失敗或部分／不一致結構，保留輸出並停止；不要刪表、重跑整份 schema 或直接使用還原指令。

## A. 本地

### A1. 遷移目前這份本地資料庫

先停止本地 Worker。唯讀檢查可以在停止前執行；套用／備份前必須停止，以取得一致備份。

```powershell
node scripts/apply-practice-schema.mjs --target=local --check
node scripts/apply-practice-schema.mjs --target=local --apply
node scripts/init-local-db.mjs --check
```

第一行因缺少 0019 回非零屬正常；第二行會備份 `.wrangler/state/v3/d1`，跳過已完整的 0015～0018，只補 0019。第三行應顯示 `Local schema is ready. No migration needed.`。若出現部分套用／定義不一致，停止並保留錯誤，不刪表重做。

若是另一份尚未初始化的本地環境，改用完整初始化流程，它會處理既有基礎 schema 與 0014～0019：

```powershell
node scripts/init-local-db.mjs --check
node scripts/init-local-db.mjs
node scripts/init-local-db.mjs --check
```

### A2. 前端設定

同站 `/api` 已是程式預設，不必新增 `.env.local`。若既有環境需要明確指定 API，保留這個選用鍵：

```dotenv
VITE_API_URL=/api
```

三個舊的前端功能開關已不再讀取，可從 `.env.local` 與雲端 Build variables 移除；即使暫時留著也不影響功能。前端入口仍受登入／題目來源規則限制，不會在進頁時自動產生 AI 報告。

### A3. 後端設定與 `.dev.vars`

一般功能開關已集中於 `wrangler.jsonc`，不必在 `.dev.vars` 重複設定。若已有同名本地覆寫，請核對是否仍要保留；設為 `false` 會在本地停用對應 API。模型亦沿用程式預設，只有要切換模型時才需要加入：

```dotenv
GEMINI_ANALYSIS_MODEL=gemini-3.1-pro-preview
GEMINI_CORRECTION_MODEL=gemini-3.1-pro-preview
```

兩個模型鍵可省略，以上是目前程式預設值。一般上傳辨識維持既有模型。`.dev.vars` 仍保存有效的 `GEMINI_API_KEY`、`JWT_SECRET`、Google OAuth 等秘密值；不要貼出金鑰或提交 `.dev.vars`／`.env.local`。功能開關不授予 Pro 付費會員資格，這版也不包含生成新題。

### A4. 啟動

兩個終端機分別執行：

```powershell
# 終端機一：API，與遷移使用相同持久目錄
node node_modules/wrangler/bin/wrangler.js dev --local --persist-to .wrangler/state
```

```powershell
# 終端機二：Vite
node node_modules/vite/bin/vite.js
```

開啟 `http://localhost:3000`。本地 Google callback 應為 `http://localhost:3000/api/auth/callback/google`，詳見[配置指南](./CONFIGURATION_GUIDE.md)。修改環境檔後重啟程序。本地沒有正式題庫或圖片時，使用本地測試題；本地遷移不會下載正式 D1／R2 資料。

## B. 雲端正式環境

### B1. 先解決帳號／憑證並檢查 schema

目前儲存庫使用同一個 `redolve-api` Worker 提供 `dist` 靜態資源與 `/api`，D1 binding 是 `DB`，資料庫名稱為 `redolve-db`；ID 以 `wrangler.jsonc` 為準。這份配置沒有命名的 `production` 環境，不要直接加 `--env production`。

```powershell
node node_modules/wrangler/bin/wrangler.js whoami
node scripts/apply-learning-schema.mjs --target=remote --check
```

若仍是 `7403`，核對目前登入／API token、資料庫所屬 Cloudflare 帳號、必要的 D1 讀寫權限，以及 `CLOUDFLARE_ACCOUNT_ID` 是否指向正確帳號。不要把 D1 ID 改成別的資料庫來繞過錯誤。先讓唯讀檢查成功，再進行套用。

### B2. 依依賴順序補缺失版本

下列 `--apply` **會修改正式 D1**，在確認正確帳號與資料庫、準備發布時執行。這些步驟不由 Git 合併或推送自動完成。

```powershell
# 先處理 0014；已完整時直接跳過，不寫入
node scripts/apply-learning-schema.mjs --target=remote --check
node scripts/apply-learning-schema.mjs --target=remote --apply
node scripts/apply-learning-schema.mjs --target=remote --check

# 0014 完整後，再檢查／補上 0015～0019
node scripts/apply-practice-schema.mjs --target=remote --check
node scripts/apply-practice-schema.mjs --target=remote --apply
node scripts/apply-practice-schema.mjs --target=remote --check
```

檢查因「缺少」回非零時，可執行對應套用；認證、網路、前置結構或部分定義不一致的錯誤必須先處理。兩支腳本在遠端有缺失需要套用時，會先讀取 Time Travel 資訊；請保存完整輸出／bookmark 及發布前 Worker 版本。腳本以實際結構檢查跳過已安裝增量，不依賴猜測的 migration 執行紀錄。

| 版本 | 用途 |
| --- | --- |
| 0014 | 個人辨識資料、不可變版本、題文保存與資產引用 |
| 0015 | 逐次練習、判分依據、明確更正與冪等 |
| 0016 | 私人分析報告、來源刪除連動 |
| 0017 | 固定選題目錄與報告追問 |
| 0018 | 訂正後辨識候選、版本與併發保護 |
| 0019 | 科目階段基準、生成間隔、接收時間索引 |
| 0020 | 上傳題、存入題與個人共用進度的星號欄位、索引及搜尋版本更新 |

不重跑 `worker/schema.sql`、0001／0002 或歷來全部 migration；不使用已撤回的 0011。若 0014 的既有分享結構前置檢查失敗，先核對基礎部署，不能直接批次套用舊遷移。

### B3. 後端執行設定：放進版本控制

正式 D1 的分析與星號遷移 0014～0020 已經統一唯讀檢查確認完整。以下三個開關已加入 `wrangler.jsonc` 的現有 `vars`，透過 CI 發布後生效；不必另在 Cloudflare 後台重複填寫。`GOOGLE_CLIENT_ID` 和其他原值保留：

```jsonc
"LEARNING_ENABLED": "true",
"PRACTICE_ENABLED": "true",
"ANALYSIS_ENABLED": "true"
```

此片段是既有 `vars` 的成員，不是完整設定檔。若要停用，修改對應值為 `"false"` 並經既有流程發布。`GEMINI_ANALYSIS_MODEL`／`GEMINI_CORRECTION_MODEL` 可在需要覆寫時加入，未設定沿用程式預設。

保留原 D1／R2／KV／速率限制 binding、`placement.region: "gcp:asia-east1"`、靜態資源與 Cron 設定。日排程 `0 19 * * *` 是 UTC 19:00，即台灣隔日 03:00，負責分批清理到期報告。

正式 Worker 必須已有有效的 `GEMINI_API_KEY` secret，及原有登入 secrets。只核對或在 Cloudflare 的 Variables & Secrets 安全填入缺少者，不輪替既有值、不把秘密填進 `vars`。單純變更 secret 也可能影響線上版本，應放在發布窗口內處理。

Wrangler 預設會以設定檔覆蓋後台的一般變數；因此這些非秘密開關建議以 `wrangler.jsonc` 為準。若刻意採後台維護，需明確配置 `keep_vars: true` 並核對發布後結果，不能只填後台就假設會永久保留。[Cloudflare 設定來源說明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)

### B4. 前端建置設定：Cloudflare Builds

不再需要為辨識、練習與分析設定任何前端建置開關。可以刪除既有的三個 `VITE_…_ENABLED` Build variables；即使有殘留 `false` 值，新程式也不會讀取。API 與前端同站時不必另設建置變數；需要明確指定時可保留：

```dotenv
VITE_API_URL=/api
```

只有這類需要改變前端打包內容的值才放在 Build variables；功能是否允許執行由後端三個開關判斷。後端停用時，前端保留入口並顯示 API 回傳的未開放訊息，已有離線資料不刪除。不要將 Gemini、JWT 等秘密加上 `VITE_` 前綴。[Cloudflare 建置設定說明](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

核對 Git 監聽分支為 `main`。建置命令使用既有 `npm run build`，它包含 TypeScript、Vite 與 `scripts/build-sw.mjs`；發布命令沿用既有自動部署設定（例如 Cloudflare Builds 內的 `npx wrangler deploy`），不要另外在本機手動部署。這份 repo 沒有 `.github/workflows`，不能假設 GitHub Actions 會自動跑所有測試。

### B5. 發布與回復

1. 執行 `node scripts/check-release-schema.mjs --target=remote`，確認整批 0014～0020 無缺漏，再核對已提交的後端開關與原有金鑰。0014～0019 完整不代表 0020 已安裝。
2. 本地 main 合併驗證後，僅在使用者授權時推送，讓既有 CI 執行。
3. 確認部署對應提交與建置成功，檢查桌面／iPad PWA 更新；驗證上傳題與存入題各走一次訂正、確認、練習、分析、引用與追問。
4. 確認訂正失敗可手動重試、空白答案可確認、已確認內容不被覆蓋、重作紀錄存在、最新天數篩選不呼叫 AI、生成間隔與歷史閱讀正常；再檢查既有共用／集合功能。
5. 若需停用，保留資料與新增表，關閉對應功能開關並透過既有發布流程處理。回復程式與回復 D1 是兩件事；不要以刪表回退。D1 Time Travel 回復可能覆蓋發布後的新資料，須另行評估及授權。

舊 OCR 回填仍是選用操作，不會自動建立答案、錯因或練習事件，也不是此版本啟用的必要前提。完整功能行為見[階段分析紀錄](./ANALYSIS_CYCLES_2026-11-02.md)。
