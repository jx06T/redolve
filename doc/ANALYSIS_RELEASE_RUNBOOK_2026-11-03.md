# 個人分析合併與本地／雲端設定

日期：2026-11-03。適用於本次個人辨識、訂正整理、原題練習及階段分析版本。

## 本次實際檢查結果

- 已取得遠端 `origin/main`，版本為 `a76abc8`，並在功能分支整合主線。
- 四個衝突檔案：`ProblemCard.tsx`、`CollectionDetailView.tsx`、集合管理瀏覽器測試與共用進度文件。
- 訂正流程保留單一完成入口：儲存成功／本機保留後、擷取訂正合成圖、排入辨識，再前往下一題；浮動與底部按鈕一致。撤回完成不前進，存入／共用進度失敗不前進、不送出訂正辨識。
- 集合管理保留主線的緊湊卡片、縮圖彈窗、標題前往共用刷題、右下移除按鈕；不恢復已移除的上移／下移及重複原圖連結。
- 0018 的 trigger 僅將 `BEGIN`／`END` 排版為獨立行，供舊 SQL 載入流程正確解析；與既有正規化結構定義相同，不需重套已安裝的 0018。
- **本地唯讀檢查：0014～0018 與既有基礎 schema 已完整，只缺 0019** 的 `analysis_subject_state`、`analysis_report_cycles`、`idx_analysis_completed_subject`、`idx_practice_received`。
- **雲端唯讀檢查未成功**：Cloudflare 回傳 `7403`，目前帳號／憑證無權存取設定的正式 D1。正式 schema 缺哪些版本仍未知，不能把本地結果套用到雲端。
- 本次沒有對使用中的本地或正式資料庫執行遷移，也未推送或手動部署。測試使用隔離 Miniflare 與模擬 API。

整合驗證：前端及 Worker 入口 TypeScript、啟用三個功能開關的正式建置、Service Worker 建置與 **87 項測試全部通過**。測試包含辨識／訂正／練習／階段分析、原題作業同步、來源共用、單題分享、集合成員、共用搜尋快取與 PWA。瀏覽器以模擬 API 驗證上傳題／存入題的底部與浮動完成、撤回、儲存失敗、共用題不送個人辨識，以及 390／1280px 集合篩選、草稿、候選選取、圖片彈窗與同頁導航；不等同真實模型或 iPad 實機驗收。

以下命令在 `D:\Document_J\redolve` 執行。沿用現有秘密值，不覆蓋整份環境檔、不重建資料庫。Git 分支不會隔離 `.wrangler/state` 或正式 D1。

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

### A2. 前端 `.env.local`

新增或更新這些鍵，保留其他設定：

```dotenv
VITE_API_URL=/api
VITE_LEARNING_ENABLED=true
VITE_PRACTICE_ENABLED=true
VITE_ANALYSIS_ENABLED=true
```

### A3. 後端 `.dev.vars`

新增或更新：

```dotenv
LEARNING_ENABLED=true
PRACTICE_ENABLED=true
ANALYSIS_ENABLED=true
GEMINI_ANALYSIS_MODEL=gemini-3.1-pro-preview
GEMINI_CORRECTION_MODEL=gemini-3.1-pro-preview
```

兩個模型鍵可省略，以上是目前程式預設值。一般上傳辨識維持既有模型。保留有效的 `GEMINI_API_KEY`、`JWT_SECRET`、Google OAuth 等原設定；不要貼出金鑰或提交 `.dev.vars`／`.env.local`。功能開關不授予 Pro 付費會員資格，這版也不包含生成新題。

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

不重跑 `worker/schema.sql`、0001／0002 或歷來全部 migration；不使用已撤回的 0011。若 0014 的既有分享結構前置檢查失敗，先核對基礎部署，不能直接批次套用舊遷移。

### B3. 後端執行設定：放進版本控制

本次合併保留既有開關配置，**沒有直接替正式環境開啟功能**。正式 D1 檢查完整後，將以下鍵合併至 `wrangler.jsonc` 的現有 `vars`，保留 `GOOGLE_CLIENT_ID` 和其他原值，再提交設定變更：

```jsonc
"LEARNING_ENABLED": "true",
"PRACTICE_ENABLED": "true",
"ANALYSIS_ENABLED": "true",
"GEMINI_ANALYSIS_MODEL": "gemini-3.1-pro-preview",
"GEMINI_CORRECTION_MODEL": "gemini-3.1-pro-preview"
```

此片段是 `vars` 內的成員，不是完整設定檔；前一個既有成員需有逗號。模型鍵亦可省略使用程式預設。

保留原 D1／R2／KV／速率限制 binding、`placement.region: "gcp:asia-east1"`、靜態資源與 Cron 設定。日排程 `0 19 * * *` 是 UTC 19:00，即台灣隔日 03:00，負責分批清理到期報告。

正式 Worker 必須已有有效的 `GEMINI_API_KEY` secret，及原有登入 secrets。只核對或在 Cloudflare 的 Variables & Secrets 安全填入缺少者，不輪替既有值、不把秘密填進 `vars`。單純變更 secret 也可能影響線上版本，應放在發布窗口內處理。

Wrangler 預設會以設定檔覆蓋後台的一般變數；因此這些非秘密開關建議以 `wrangler.jsonc` 為準。若刻意採後台維護，需明確配置 `keep_vars: true` 並核對發布後結果，不能只填後台就假設會永久保留。[Cloudflare 設定來源說明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)

### B4. 前端建置設定：Cloudflare Builds

在 `redolve-api` 的 **Settings → Build → Build variables and secrets** 設定：

```dotenv
VITE_API_URL=/api
VITE_LEARNING_ENABLED=true
VITE_PRACTICE_ENABLED=true
VITE_ANALYSIS_ENABLED=true
```

這些變數須在 Vite 建置時存在；後端 `vars` 或本機 `.env.local` 不會代替雲端建置設定。不要將 Gemini、JWT 等秘密加上 `VITE_` 前綴。[Cloudflare 建置設定說明](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

核對 Git 監聽分支為 `main`。建置命令使用既有 `npm run build`，它包含 TypeScript、Vite 與 `scripts/build-sw.mjs`；發布命令沿用既有自動部署設定（例如 Cloudflare Builds 內的 `npx wrangler deploy`），不要另外在本機手動部署。這份 repo 沒有 `.github/workflows`，不能假設 GitHub Actions 會自動跑所有測試。

### B5. 發布與回復

1. 先完成正式 D1 檢查／遷移，再提交後端開關並備妥建置變數。
2. 本地 main 合併驗證後，僅在使用者授權時推送，讓既有 CI 執行。
3. 確認部署對應提交與建置成功，檢查桌面／iPad PWA 更新；驗證上傳題與存入題各走一次訂正、確認、練習、分析、引用與追問。
4. 確認訂正失敗可手動重試、空白答案可確認、已確認內容不被覆蓋、重作紀錄存在、最新天數篩選不呼叫 AI、生成間隔與歷史閱讀正常；再檢查既有共用／集合功能。
5. 若需停用，保留資料與新增表，關閉對應功能開關並透過既有發布流程處理。回復程式與回復 D1 是兩件事；不要以刪表回退。D1 Time Travel 回復可能覆蓋發布後的新資料，須另行評估及授權。

舊 OCR 回填仍是選用操作，不會自動建立答案、錯因或練習事件，也不是此版本啟用的必要前提。完整功能行為見[階段分析紀錄](./ANALYSIS_CYCLES_2026-11-02.md)。
