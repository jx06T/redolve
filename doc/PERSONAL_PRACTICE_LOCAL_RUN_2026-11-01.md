# 個人練習與分析：本地試用與資料庫遷移

> 2026-11-03 後續更新：最初分析檢查的 `pending: []` 不包含星號 0020，發布後發現缺漏、由使用者補上；最新統一唯讀檢查已確認正式 0014～0020 完整。三個前端功能開關已移除，後端開關集中至 `wrangler.jsonc`。依[最新本地／雲端操作文件](./ANALYSIS_RELEASE_RUNBOOK_2026-11-03.md)執行，並使用 `node scripts/check-release-schema.mjs --target=remote` 統一檢查，避免混用本地與正式環境。

日期：2026-11-02 更新。分支：`codex/personal-analysis-foundation`。

最新報告流程改為「最新／分析報告」兩標籤、首次基準與階段總結，新增 **0019**。已套用 0014～0018 者仍須補 0019；下方增量腳本已包含此版本，詳見[階段分析實作與遷移](./ANALYSIS_CYCLES_2026-11-02.md)。

最新辨識彈窗、React 更新循環修復與 AI 分析符合性驗證見 [修正紀錄](./PERSONAL_ANALYSIS_ALIGNMENT_2026-11-01.md)。2026-11-02 的整科報告與追問新增 0017，訂正後自動整理再新增 0018；已套用 0014～0016 者仍需補 0017／0018，見 [最新功能紀錄](./PERSONAL_ANALYSIS_GLOBAL_2026-11-02.md)。

目前可在本地試用辨識資料修改、原題抽題、逐次作答紀錄、科目統計與手動產生分析。Queue／辨識自動重試依使用者決策延後；原圖倍率仍是 1.25／1.5／2 倍可切換的試用原型，初值 1.5 倍尚未核定為正式設計。

本文件中的命令須在 `D:\Document_J\redolve` 執行。本次僅整理指令與驗證程式，未套用使用中的本地或正式資料庫。Git 分支不會隔離資料庫，同一 checkout 切分支仍使用 `.wrangler/state`；正式 D1 也是獨立於 Git 的持久資料。

## 1. 本地 D1

先停止本地 Worker，讓備份涵蓋一致的資料庫狀態。建議使用已同步所有必要 migration 的本地初始化腳本：

```powershell
node scripts/init-local-db.mjs --check
node scripts/init-local-db.mjs
node scripts/init-local-db.mjs --check
```

第一個 `--check` 在尚未完成時回非零結束碼是正常的，會列出缺失。第二行會在升級前備份 `.wrangler/state/v3/d1` 至 `.wrangler/local-db-backups/`；偵測到部分套用／不一致定義時會停止，請保留錯誤訊息，不以刪表重建處理。

如果既有基礎 schema 已完整，只想套用這次功能的增量：

```powershell
node scripts/apply-learning-schema.mjs --target=local --apply
node scripts/apply-practice-schema.mjs --target=local --apply
node scripts/init-local-db.mjs --check
```

這兩支腳本依序套用：0014 辨識資料與版本、0015 作答事件、0016 個人報告、0017 報告目錄與追問、0018 訂正整理候選、0019 階段分析。完整套用會跳過，不需重跑整份 `worker/schema.sql`，也不使用已撤回的 0011。`--apply` 改成 `--check` 可先唯讀檢查。

## 2. 舊題文字（選用）

```powershell
node scripts/backfill-learning-text.mjs --target=local --check
node scripts/backfill-learning-text.mjs --target=local --apply
```

每次 `--apply` 最多處理 250 個 FTS rowid，需重複至顯示完成。不呼叫 AI，也不建立虛構作答。**回填舊 OCR 不等於已準備好文字測驗**：舊題仍須手動重新辨識或人工整理後，才會加入抽題候選。沒有正解可自評。

本地 D1、R2 不會自動下載正式資料。若本地沒有題目與圖片，需在本地上傳或存入測試題；登入帳號也需在本地建立 session。

## 3. 開啟本地功能

同站 `/api` 已是前端預設，不必新增 `.env.local`。如需明確指定 API，可以保留以下選用設定：

```dotenv
VITE_API_URL=/api
```

三個前端功能開關已不再讀取，可從本地與雲端建置環境移除。後端 `LEARNING_ENABLED`／`PRACTICE_ENABLED`／`ANALYSIS_ENABLED` 已在 `wrangler.jsonc` 預設設為 `"true"`，本地／發布共用；`.dev.vars` 不必重複填寫。既有同名本地覆寫仍會生效，停用對應 API 時請留意。

`.env.local` 與 `.dev.vars` 均已被 Git 忽略。整科報告與追問預設使用 `gemini-3.1-pro-preview`，可用後端 `GEMINI_ANALYSIS_MODEL` 覆寫；一般題目辨識維持原設定。訂正整理可用獨立 `GEMINI_CORRECTION_MODEL` 覆寫，流程見 [訂正後整理](./CORRECTION_RECOGNITION_FLOW_2026-11-02.md)。AI 辨識／報告另需 `.dev.vars` 內有效的 `GEMINI_API_KEY`；登入沿用現有 `JWT_SECRET`、Google OAuth 設定。本地 Google callback 應含 `http://localhost:3000/api/auth/callback/google`，詳見配置指南。

分別開兩個終端機：

```powershell
# 終端機一：本地 API，明確指定與遷移相同的持久資料目錄
node node_modules/wrangler/bin/wrangler.js dev --local --persist-to .wrangler/state

# 終端機二：Vite（預設 port 3000）
node node_modules/vite/bin/vite.js
```

開啟 `http://localhost:3000/analysis` 查看各科總覽，點科目先進入「最新」統計，切換「分析報告」可建立首次基準、查看歷次總結與追問；`http://localhost:3000/practice` 為獨立原題練習頁，首頁也提供入口。修改環境檔後重啟兩個開發程序。只開前端不會同時啟動 API；直接開 8787 則使用既有 `dist`，前端程式修改須先重新建置。

目前資料量保護：抽題使用至多 500 個候選；每科分析至多 2,000 題，最新統計只讀所選天數，至多 10,000 筆有效事件。階段報告至多 10,000 筆有效新作答、20,000 筆接收依據，超限明示協助處理，不默默截斷。AI 先讀全科可用題文目錄，再挑最多 30 題深讀並限制輸入大小；解讀項目依有效資料量提供，不固定三項。統計使用全部範圍內題目，不能把代表題數視為全部題數。

## 4. 正式 D1 與預覽環境

`--target=local` 只處理本地；不會升級 Cloudflare 上的 D1。正式發布時應先對正確環境核對 schema，再依序套用 0014、0015、0016、0017、0018、0019：

```powershell
node scripts/apply-learning-schema.mjs --target=remote --check
# 0014 檢查缺失時，先完成下一行，再檢查／套用 practice
node scripts/apply-learning-schema.mjs --target=remote --apply
node scripts/apply-practice-schema.mjs --target=remote --check
node scripts/apply-practice-schema.mjs --target=remote --apply
```

遠端套用腳本會先取得 Time Travel 資訊。本次未執行以上遠端命令；勿把本地試用流程當成正式發布授權。不要在已有資料庫重跑整份 `schema.sql`，也不要直接批次套用歷來所有 migration。

Cloudflare 預覽網址還需要對應的 Worker API、三個後端開關，以及建置時的三個前端開關。只切換預覽分支，不會完成這些設定。若預覽綁到正式 D1，測試提交也會寫入正式資料；獨立測試應使用隔離的 D1／R2／KV。

## 5. 本次驗證與限制

已重新通過 TypeScript 檢查，以及 `tests/learning-foundation.test.mjs`、`tests/practice-analysis.test.mjs` 共 18 項測試；涵蓋權限、版本、判分、更正、事件去重、統計與報告刪除／到期。測試使用暫存 Miniflare 資料庫。

瀏覽器先前以模擬 API 驗證同題兩筆離線提交不互相覆蓋、切帳號不送出前帳號資料、切回後兩筆同步。這不等於已完成整站真實模型或 iPad 實機驗收；2026-11-02 已用人造題實際驗證 Gemini 3.1 Pro 的選題與報告格式，實際題庫品質仍需驗收。可以先試用，尚未宣布正式上線。
