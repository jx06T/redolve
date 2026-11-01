# 個人錯題分析：階段 1A 實作紀錄

> 2026-10-23 後續決策：辨識維持手動重試；下列 §4 的 Queue／耐久工作與每日額度改列後續改善，不再阻擋第一版練習與分析。本文仍是 1A 當時的交付紀錄，後續程式以新的實作紀錄為準。

- 日期：2026-10-22
- 分支：`codex/personal-analysis-foundation`
- 範圍：結構化辨識資料、整題確認與修改、本人上傳題及存入題的個人版本。
- 發布狀態：功能開關預設關閉，尚未正式開放。沒有推送、部署、正式 AI 呼叫，也沒有套用到開發者既有本地或正式資料庫。
- 本文記錄已完成程式；其餘需求仍以 [後端計畫](./PERSONAL_ANALYSIS_BACKEND_PLAN_2026-10-21.md) 及 [流程決策](./PERSONAL_ANALYSIS_FLOW_DRAFT_2026-10-22.md) 為準。

## 1. 本批完成

### 資料與 API

- 共用 TypeScript 型別及驗證：題幹、題型、選項、原作答、正解、可能錯因。答案支援任意選項識別與文字；不限定 A／B／C／D。欄位可空，確認只有 `ai`／`confirmed`。
- `learning_questions` 對應使用者及 owned／saved 參照；`learning_question_revisions` 保存不可覆寫的內容與個人答案版本。既有 `QuestionRef` 的 `itemId`／`savedRefId` 不混用。
- 修改使用題目版本與來源版本進行條件寫入；文字投影及分類更新在同一 D1 batch。過期請求回 409；背景 AI 不得更新 confirmed。
- 純確認只更新確認狀態與並行控制版本，不複製題文、不修改來源內容。
- `learning_revision_asset_refs` 納入既有資產引用盤點，避免來源更新後舊版本原圖被清理。
- `item_texts` 提供依主鍵讀取的文字來源；`items_fts` 保持搜尋用途。一般單題辨識資料讀取不掃 FTS。
- 存入題從自己的保留快照讀取，不重讀共享來源最新內容；AI 不把來源作者的原作答與錯因當成存入者資料。
- 原作答／正解／個人錯因不寫入公開題文投影。公開文字由題幹與選項組成。

實際 API（皆須登入、帳號授權及後端開關）：

| 方法及路徑 | 行為 |
| --- | --- |
| `GET /api/learning/:kind/:id` | 讀取個人辨識資料；不存在個人版本時只回可用基礎文字，不製造作答或版本 |
| `PATCH /api/learning/:kind/:id` | 儲存完整資料並確認；須帶 `expectedRowVersion`、`expectedSourceVersion` |
| `POST /api/learning/:kind/:id/confirm` | 確認既有版本；同樣須帶上述版本 |
| `POST /api/learning/:kind/:id/preview` | 讀取原圖取得候選結果；不儲存，採用仍經 PATCH |

`kind` 只有 `owned`／`saved`。後端計畫中的 jobs、attempts、reports 路徑尚未建立。

### AI 與畫面

- 上傳與新存入題沿用同一次分類呼叫，加入結構化擷取。舊題不自動批次呼叫 AI。
- Gemini 每次服務請求最多兩次供應商呼叫，每次逾時 20 秒；關閉 SDK 隱藏重試，錯誤記錄不印完整回應或金鑰。這是請求層保護，**不等於每日帳號額度**。
- 題目詳情的辨識區顯示原作答、正解及確認狀態，可修改或確認。只掛載於目前作用中的個人題目；訪客及共享閱讀器不顯示。
- 重新辨識產生可編輯預覽，取消保持原資料；採用才儲存並 confirmed。
- 欄位空白仍可確認；修改題型時，不相容的答案格式會清空，避免隱藏舊格式答案。錯因保留 AI／使用者的資料來源。
- 此階段修改需連線；尚未加入離線多次作答事件或草稿續作。

### 分析期間

已同步規劃及共用常數：**7／15／30／60／90 天，預設 30 天**。

這是「作答觀察期間」，不是題目的上傳日期限制。分析題目母體為目前持有且符合所選科目／單元的個人題目。分析頁、統計查詢與報告生成尚未實作。

## 2. Migration 與開關

新增 `worker/migrations/0014_learning_foundation.sql`；已同步新資料庫的 `worker/schema.sql`、既有本地初始化與唯讀檢查。未重用 0011。

### 既有本地資料庫

先停用正在寫入本地 D1 的開發程序，再執行：

```powershell
node scripts/apply-learning-schema.mjs --target=local --check
node scripts/apply-learning-schema.mjs --target=local --apply
node scripts/apply-learning-schema.mjs --target=local --check
```

- `--check` 預設唯讀；缺失會回非零結束碼。
- `--apply` 先備份 `.wrangler/state/v3/d1`，只套用 0014，不重跑整份 schema。已完整套用則不寫入。
- 部分套用或定義不符時停止，不能以重跑或刪表「修復」。
- 全新本地資料庫仍可用 `node scripts/init-local-db.mjs`；只檢查用 `node scripts/init-local-db.mjs --check`。

舊 OCR 採顯式回填，每次最多讀取 250 個 FTS rowid，執行一次只處理一批：

```powershell
node scripts/backfill-learning-text.mjs --target=local --check
node scripts/backfill-learning-text.mjs --target=local --apply
```

重複 `--apply` 直到顯示完成。checkpoint 保留進度；中斷重跑不覆蓋較新的 legacy 文字或任何 AI／使用者文字，不產生作答，也不把舊 OCR 視為已清理的可練習題文。回填期間應維持來源文字寫入流程穩定；之後若停用功能再累積舊格式資料，須另外規劃增量回填，不能直接假設已完成的 checkpoint 仍涵蓋它們。

正式環境日後採同一腳本、明確指定 `--target=remote`：先 `--check`，經發布流程授權後再 `--apply`。遠端套用前腳本取得 Time Travel recovery 資訊。本次沒有執行這些遠端命令。

### 本地驗收開關

- Worker：`LEARNING_ENABLED=true`。
- Vite：`VITE_LEARNING_ENABLED=true`，更改後重啟開發伺服器／重新建置。
- 必須先完成 schema 檢查，兩端才一起開啟。AI 預覽另需既有模型金鑰及 `UPLOAD_LIMITER` 綁定。
- 本批沒有修改環境設定或啟用正式功能。關閉開關可隱藏新介面／停用新 API，保留已存資料。
- 關閉開關時，既有分類仍會使用擴充後的模型 schema 及呼叫上限；這部分需在正式發布前進行供應商樣本驗證。

## 3. 驗證結果

測試採用暫存 Miniflare D1／R2，沒有更動使用中的資料庫。

```powershell
node --test tests/learning-foundation.test.mjs tests/question-text.test.mjs tests/local-migration-sql.test.mjs tests/pwa-release.test.mjs tests/sharing-access.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/build-sw.mjs
```

- 上述測試共 22 項通過。涵蓋帳號隔離、本人／存入兩來源、並行修改、已確認保護、不可覆寫歷史、資產保留、缺正解確認、既有分享／全文／PWA 回歸。
- 升級測試先建立含既有題目的前版 schema，再套用 0014；比對原資料與新定義。回填驗證重複 FTS、錯誤 owner、中斷重播、跨批更新及人工文字優先。
- TypeScript、Vite、Service Worker 建置通過。環境全域 npm 啟動器損壞，因此直接執行專案內程式，未修改全域環境。
- 瀏覽器以真實 `LearningDataPanel` 加模擬 API 驗證：候選不儲存、取消保留原答案、編輯採用後只儲存一次且變成已確認。這不是整站實機或真實供應商辨識準確率驗收。
- 未實際執行既有資料庫的 CLI migration／backfill；已在暫存資料庫驗證它們使用的 SQL 與 schema 檢查邏輯。

## 4. 下一個交付與正式開放條件

**階段 1 尚未全部完成。** 1A 先建立可驗證的資料及操作；以下 1B 仍須完成後，才考慮正式開啟新功能：

1. 按後端計畫加入 durable job／Queue、帳號呼叫額度與預留、重送去重及失敗恢復。目前上傳仍沿用 `waitUntil`，手動預覽為有界同步呼叫。
2. 真實供應商樣本驗證：單選、複選、文字答案、缺正解、手寫、同圖多題及模糊圖片；核對 schema 支援、品質與 token 成本。
3. 整站連線驗收：上傳背景完成後的資料更新、來源快照更新與個人版本的呈現、帳號切換及實際平板操作。來源新版的採用仍在既有刷題頁，不新增分析來源流程。
4. 既有資料 migration／回填正式演練及 D1 `rows_read` 量測；此次測試不宣稱已完成正式成本 gate。

後續階段順序：

- 階段 2：`practice_attempts`、事件 outbox／冪等同步、原題抽題、判分／自評、補正解及歷史更正。
- 階段 3：科目統計、報告保存、受限內容取樣、引用授權與原題推薦。
- 裁切拆題與 Pro 新題生成：另依未決設計及後續範圍處理。本批未實作。

未決 UI／UX 仍集中在批閱表與流程草案；本批沒有替報告保留期限、裁切完整流程或 Pro 方案做決定。
