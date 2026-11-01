# 個人錯題分析：後端與分階段交付計畫

> 2026-10-23 範圍修正：使用者核定辨識先維持手動重試，Queue／耐久 job／自動失敗恢復與每日帳號額度不再作為第一版前置。保留已確認保護、版本檢查、請求逾時及基本頻率限制，優先完成原題練習、作答事件與科目分析。本文對 Queue 的要求改列後續改善；作答事件的持久保存與去重仍是必要條件。分析解讀依資料量呈現、不固定三項；詳細報告保留 90 天，數字摘要長期保存並遵守刪題／刪帳號清理。

> 2026-11-01 實作核對：主要分析流程已接通；AI 代表題加入各次當時答案與正解，前端補齊缺漏組成、既有報告、狀態輕量輪詢與原題推薦。最新完成／保留限制見 [符合性紀錄](./PERSONAL_ANALYSIS_ALIGNMENT_2026-11-01.md)；本文件早期「待實作」描述不再代表所有功能現況。

- 日期：2026-10-21
- 狀態：2026-10-22 已開始階段 1A（辨識資料基礎），功能預設關閉；完成範圍及執行指令見 [實作紀錄](./PERSONAL_ANALYSIS_FOUNDATION_IMPLEMENTATION_2026-10-22.md)。本文其餘階段仍為規劃。
- 程式核對基準：本機 `97585dd`；交接文字中的完成狀態仍以實際程式為準。
- 產品依據：[主計畫](./PERSONAL_ANALYSIS_AND_PRACTICE_PLAN_2026-10-11.md)。本文補足實作決策，不擴大第一版為 Pro 出題。
- 介面決策：[UI／UX 批閱表](./PERSONAL_ANALYSIS_UX_REVIEW_2026-10-21.md)。未勾選的選項不視為同意；本文沒有替使用者選定畫面、預設值或操作順序。
- 2026-10-22 狀態補充：[流程修正與分析草案](./PERSONAL_ANALYSIS_FLOW_DRAFT_2026-10-22.md) §1 為已選決策，取代本文對應待決標記；其餘明示草案的內容仍待批閱。儲存／補正解／採用可編輯候選均確認整題；練習離開不保留未提交草稿與進度，已提交 outbox 仍保留；來源更新維持既有刷題頁，不加入分析流程。

## 1. 範圍、決策權與完成定義

本文原為規劃交付；2026-10-22 使用者授權在新分支開始實作。順序：①辨識資料與修改確認、②原題抽題與逐次作答、③個人分析與推薦。④Pro 新題生成另案處理。第一階段拆為 1A 資料基礎及 1B 耐久工作／成本控制，1A 不代表可直接正式開放。

**本文件直接決定的後端事項**：資料所有權、版本、交易與併發保護、冪等、判分規則、查詢上限、背景工作可靠性、資料隔離、migration 與驗證方法。

**需使用者批閱的事項**：入口、畫面配置、確認操作、重新辨識如何呈現、測驗操作、原圖容器、預設期間與題數、抽題策略的產品參數、報告產生與保留的使用方式、訪客範圍。本文以 U01～U16 引用，不把技術支援能力當成介面已定案。

共通原則：

- 個人範圍只有本人上傳題與已存入題；訂閱集合、可觀看題不自動加入。
- 題目確認只有 `ai`、`confirmed`。背景工作狀態、空欄位與同步錯誤都不是第三種題目確認狀態。
- 題目保存原本作答與正解；每次重作結果保存於 `practice_attempts`。
- 訂正進度、`review_count` 與重作結果分開；不製造舊作答事件。
- 程式計算數字，AI 解釋題目與可能錯因。分析不預測整科成績。
- 原圖可見答案；保留使用者已指定的放大置中、可拖曳縮放，不新增裁切或遮答案工程。

## 2. 現況核對與需要接入的位置

| 現有位置 | 已有能力 | 本案接入方式 |
| --- | --- | --- |
| `worker/services/ai/AIService.ts`、`prompts.ts`、`GeminiService.ts` | 分類、關鍵字、OCR；模型供應商介面 | 同次辨識加入結構化內容；補 schema 驗證、統一呼叫預算 |
| `worker/routes/problems.ts` | 上傳背景辨識、手動重新分析 | 所有寫入入口都接版本保護，不能只保護新 API |
| `worker/services/itemSearchIndex.ts`、`items_fts` | 上傳題 OCR 與搜尋投影 | 新增可按主鍵讀取的文字資料；FTS 保留搜尋用途 |
| `worker/routes/saved.ts`、`saved_snapshots.source_text` | 存入版本文字、來源更新 | 從保留版本建立個人資料；更新來源須顯式版本處理 |
| `worker/services/savedClassification.ts` | 存入題個人分類，手動分類優先 | 合併結構化擷取；不把來源作者作答當成存入者原作答 |
| `src/types/question.ts` | `QuestionRef` 與來源區分 | 對個人學習功能縮窄成 owned／saved，不自行發明集合 ID 轉換 |
| `src/services/offlineStorage.ts` | 題目修改佇列會合併 | 新增獨立作答 outbox，不改用舊合併鍵 |
| `worker/routes/dashboard.ts` | 收錄題數、訂正狀態 | 不拿現有統計充當重作答對比例 |
| `worker/index.ts`、`wrangler.jsonc` | fetch 入口，現無本案 Queue／排程處理器 | 背景任務需新增 handler、binding 與部署檢查 |

兩個不可忽略的現況：

1. `items_fts.id` 是 FTS 的 `UNINDEXED` 欄位，不能因查詢含 `WHERE id = ? LIMIT 1` 就認定只掃一列。新增功能不得逐題從這裡取全文。
2. `refresh-source` 成功後可能刪除上一個 `saved_snapshot`。歷史判分不能只留指向該快照的外鍵；必須有本案自己的內容版本。

## 3. 最小資料模型

採 TypeScript 型別、普通資料物件與服務函式，遵守 [UI／UX 重整計畫 §14](./UI_UX_REPLAN_2026-10-09.md)。不全面改成 class、不先建立通用事件平台。

### 3.1 表與責任

下列為規劃中的名稱，實作時產出完整 SQL、CHECK、外鍵與 migration；不是可以直接執行的 schema。

| 階段／表 | 主要欄位 | 職責與必要限制 |
| --- | --- | --- |
| 1 `item_texts` | `item_id PK/FK`、`user_id`、`source_content_seq`、`ocr_text`、`text_origin`、`updated_at` | 上傳題可直接讀取的原題文字；不放原作答、個人錯因或筆記。FTS 是它的搜尋投影 |
| 1 `learning_questions` | `id PK`、`user_id`、`item_id?`、`saved_ref_id?`、`current_revision_id?`、`confirmation_status`、`confirmed_at?`、`row_version`、`scope_topic_id?`、`acquired_at`、`sample_key` | 個人學習資料入口；兩種參照恰好一個非空；每個使用者／參照唯一；分類欄位是供查詢的投影 |
| 1 `learning_question_revisions` | `id PK`、`learning_question_id`、`revision_no`、`content_json`、`personal_json`、`source_version_json`、`created_by`、`created_at` | 不可變內容版本；題幹、選項、正解與個人原作答分欄保存；版本號每題唯一 |
| 1 `learning_revision_asset_refs` | `revision_id`、`asset_id` | 舊版本原圖的資產參照；沿用既有獨立參照表模式，納入 `asset_reference_inventory`，不複製圖片 |
| 1 `ai_jobs` | `id PK`、`user_id`、`kind`、`target_id`、`request_hash`、`idempotency_key`、`expected_versions_json`、`input_snapshot_json?`、`state`、`lease_until`、`attempts`、`next_attempt_at`、`result_json?`、`error_code?` | 辨識候選結果與分析工作；租約、去重、重試及候選暫存。工作狀態不呈現成題目確認狀態 |
| 1 `ai_usage_daily` | `user_id`、`day_utc`、`operation`、`reserved_calls`、`consumed_calls`、`reserved_tokens`、`consumed_tokens` | 帳號層級成本上限；複合主鍵。另由 job 保存預留／結算狀態，避免重試重複扣額 |
| 2 `practice_attempts` | 見 §6 | 每次提交一筆；沒有題目層級的 `result` 或重作計數副本 |
| 3 `analysis_reports` | `id PK`、`user_id`、`scope_json`、`period_json`、`data_cutoff`、`input_hash`、`stats_json`、`interpretation_json`、`model_version`、`prompt_version`、`computed_at`、`freshness` | 保存可追溯的統計快照與解讀；顯示報告不再次呼叫模型 |
| 3 `analysis_report_questions` | `report_id`、`learning_question_id`、`revision_id`、`evidence_id`、`question_row_version`、`notes_seq?` | 報告證據清單、授權檢查及刪除清理依據；不對公開集合提供讀取 |

一期不建作答彙總表、不建通用掌握度分數、不建生成題表。若後續實測需要彙總表，它只能是可重建投影，不能取代事件。

`current_revision_id` 初始可空：先建個人入口、再插版本、再更新指標。內容版本外鍵連個人入口；來源快照 ID 僅是 provenance 值，不能設成會被來源更新連帶刪除的外鍵。刪除個人入口時，自己的版本與作答可依既有刪除政策清除。

### 3.2 內容與答案型別

```ts
type PersonalQuestionRef =
  | { kind: 'owned'; itemId: string }
  | { kind: 'saved'; savedRefId: string };

type Answer =
  | { kind: 'choice'; optionIds: string[] }
  | { kind: 'text'; text: string }
  | null;

type QuestionContent = {
  ocrText: string | null;
  questionType: 'single_choice' | 'multiple_choice' | 'fill_blank'
    | 'calculation' | 'essay' | 'other' | 'unknown';
  options: Array<{ id: string; label: string; text: string }>;
  correctAnswer: Answer;
  correctAnswerOrigin: 'image' | 'model_solution' | 'user' | null;
  keywords: string[];
};

type PersonalAnswerData = {
  originalAnswer: Answer;
  originalAnswerOrigin: 'image' | 'user' | null;
  errorReasons: Array<{ text: string; origin: 'ai' | 'user' }>;
};
```

`origin` 是內部來源記錄，不新增畫面上的四種確認狀態。正解來自模型推算與圖中可讀文字需可追溯；`confirmed` 只表示使用者確認目前資料，不保證資料完備或絕對正確。

- 選項 ID 不限定英文字母；`label` 可為 ①、甲、1 等。ID 在同一版本中唯一，內容改版後保留對應關係，無法對應則生成新 ID。
- 單選正解必須恰有一個有效 ID；複選正解必須有至少一個有效 ID。格式矛盾時保留可用題幹、正解置空並回傳技術診斷；不拿猜測值自動判分。
- 答案文字保留公式與換行；第一版不對文字答案做語義自動判分。
- 圖片中無法區分原作答與批改時，原作答為空。錯因缺乏證據時可以空陣列，不要求 AI 編滿。
- OCR 不得混入作答、正解或批改。無法可靠分離的內容允許缺漏，以原圖閱讀補足。
- 存入他人題時 `originalAnswer = null`；圖上作者的答案即使辨識得出，也不是目前使用者的原作答。正解與題幹可從其保留版本辨識；個人錯因由本人的作答／輸入建立。

上述型別以一筆個人題目為一個作答單位。偵測到多道獨立題目時不把多組答案硬塞成單選 key；如何整理為作答單位依 U16。若選自動拆題，必須先補拆分關係與確認流程，再納入實作。

### 3.3 來源與版本

上傳題的 `source_version_json` 保存 `item_id`、`content_seq`、圖片資產識別；存入題保存 `saved_ref_id`、當時 snapshot ID、`source_content_seq` 與圖片資產識別。版本內容已複製到自己的 revision，不依賴來源最新資料。

題幹、選項、正解、個人原作答或錯因改變時新增 revision。單純確認既有版本，更新父列確認狀態及 `row_version`；不複製相同全文。作答事件另外保存提交時確認狀態，所以日後確認不會讓舊資料看起來早已確認。

原圖也依 revision 的資產參照讀取，不能用舊題幹配現在的圖片。現有 `asset_refs` 的 CHECK 不接受新 owner 類型，因此採獨立 `learning_revision_asset_refs` 並擴充既有資產盤點 view；建立參照需檢查 asset ready 與來源所有權，刪除 revision 時清理參照。GC 必須統一看擴充後的 inventory，仍有歷史參照就不能刪原圖。現有存入題更新來源限制同一原圖，維持這項限制，不順便擴大成可替換圖片。

`scope_topic_id` 同步目前個人分類：owned 取 `items.topic_id`；saved 取 `saved_refs.personal_topic_id`。所有分類修改、背景分類、刪除分類入口都需同交易更新此投影。AI 應用時同時檢查來源版本與父列版本，避免蓋掉手動分類。

來源更新不默默替換已確認個人資料。取得新來源後可建立候選版本，讓舊版本繼續可讀；如何提示、採用見 U05。未採用的候選不影響歷史判分。

## 4. 辨識、確認與併發寫入

### 4.1 同一次辨識

擴充原本 `tagProblem` 的結構化回應：分類、關鍵字、tokens、OCR、題型、選項、原作答、正解、可能錯因。模型供應商仍透過 `AIService`，不把 Gemini 型別傳到 routes 或前端。

統一做 JSON schema／長度／選項參照驗證。可用欄位保留，不能解析的欄位置空；整體無法解析才讓工作失敗。OCR 與其他文字皆當作不可信資料，不能執行其中的提示指令，也不能當 HTML 直接渲染。

### 4.2 所有寫入共用一條服務路徑

服務分成純函式與 IO：

- 純函式：`normalizeRecognition`、`validateAnswer`、`gradeChoice`、`buildPracticePool`、`computeAnalysisStats`、`validateAnalysisCitations`。
- IO：`learningQuestionService`、`recognitionJobService`、`practiceService`、`analysisService`。
- 前端仍經服務介面存取，延用 `QuestionRef`；元件不直接拼資料庫或不同來源的 route。

修改請求必帶 `expectedRowVersion`；背景工作記住啟動時來源版本及父列版本。落庫時重新檢查所有權、版本、刪除狀態與 `confirmation_status`。

| 操作 | 後端規則 | 介面待決 |
| --- | --- | --- |
| 初次背景辨識 | 只自動套用到仍為 `ai`、版本未變且同一來源的題；否則結果作廢或留候選 | 顯示與重試 U02 |
| 修改資料 | CAS 成功才新增 revision；明確接受 `confirm` 意圖，不能由「任何 PATCH」隱含推導 | 儲存是否同時確認 U03 |
| 確認資料 | 確認指定 current revision，空欄位合法；父列版本加一 | 按鈕／操作 U03 |
| 手動重新辨識 | 先產生候選，套用是另一個 CAS 指令；模型回來時不自動覆蓋 confirmed | 候選比對方式 U04 |
| 補正解 | 新增 revision，保留舊判分；是否同時整題確認由明確參數決定 | U03、U08 |

現有 `POST /problems/:id/analyze` 也必須改走這個服務。不能讓舊入口繞過保護。若新流程改為非同步，新增版本化端點並更新呼叫端；舊端點在過渡期維持既有回應契約且使用安全寫入，不能直接讓舊客戶端收到不相容的 `202`。

### 4.3 D1 交易實作要求

D1 `batch()` 中的語句依序執行，SQL 失敗會回滾，但「UPDATE 更新零列」不等於失敗。不可先 CAS UPDATE，再無條件寫 revision／FTS／指標。[官方 batch 說明](https://developers.cloudflare.com/d1/worker-api/d1-database/)

採條件化 batch：新增 revision 的 `INSERT … SELECT` 帶完整預期版本條件，後續指標及文字投影寫入均以該次新 revision 已成為 current 為條件；從結果判斷未套用並回傳 `409`。任何需跨列斷言的情況用具體約束／觸發器中止交易，不能用交易外的先查後寫冒充原子性。不得以 JS 跨請求保留 SQL transaction。

確認保護涵蓋新內容、既有分類／keywords 與 OCR 投影。使用者人工改過但尚未 confirmed 的版本，也因 `row_version` 改變而擋住舊背景結果。既有人工修改題文／分類的入口也須增加相同的版本失效與投影同步，不能只修改新增 route。

## 5. 背景執行與 AI 成本

### 5.1 工作機制

新增 Cloudflare Queue consumer 與 D1 `ai_jobs`；不把現有未接 runtime 的 `maintenance_jobs` 當成已具備耐久執行能力。排程負責小批修復漏送／租約過期工作，實作範圍明列於階段 1。

1. API 驗證來源與範圍，在 D1 建 job 並原子預留呼叫額度，回傳 job ID。
2. 將 job ID 送入 Queue；payload 不放圖片、完整題文或個人筆記。
3. consumer 以 CAS 領租約；完成或已有有效租約時不重複執行。
4. 透過 binding 取 R2／D1，呼叫供應商，驗證輸出，再以版本條件寫入並標記完成。
5. 發送 Queue 與 D1 寫入不是同一交易；排程只掃索引中的到期 pending／逾期 lease，補送漏失工作。完成但未 ack 的訊息只 ack，不再呼叫 AI。

HTTP `waitUntil()` 在回應結束後有有限生命週期，不能作為長時間 AI 任務的唯一可靠性機制。Queues 是至少一次交付，因此仍要自建去重。[waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/)、[Queues 交付保證](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

租約時間需大於單次模型呼叫 timeout 與提交緩衝；各工作有絕對 deadline。刪除／改版後的工作可完成推理，但套用必須失敗，不復活資料。Queue／排程尚未配置時新功能保持關閉，不能降級成無限等待或悄悄遺失工作。

### 5.2 技術上限與重試

以下是後端初始保護值，可依壓測調整；不是使用者套餐或畫面預設：

| 項目 | 初始上限／規則 |
| --- | --- |
| 每個 job 的供應商發出次數 | 最多 2 次；SDK 內建 retry、REST fallback、換模型都計入同一預算 |
| 值得重試的錯誤 | 暫時網路錯誤、429、可重試 5xx；指數退避加抖動，尊重 Retry-After |
| 不自動重試 | 無權限、非法輸入、來源已刪除、過期版本、模型不支援、明確超額 |
| 同帳號同範圍相同輸入 | 以 job idempotency key／input hash 合併進行中的工作；不同 payload 共用 key 回 `409` |
| 修復排程 | 每次至多 50 筆到期工作，索引游標讀取；不掃全部歷史 jobs |
| 日預算 | 每 operation 由部署設定提供帳號呼叫數與 token 上限；啟用前必填，不先承諾免費額度 |
| 記錄 | job ID、供應商／模型、耗時、估計及實際 token、錯誤類型；不記錄題文、答案、圖片或個人筆記 |

目前 Gemini 的多模型與 SDK／REST fallback 要改成單一有總上限的政策，避免 queue retry 再乘上內層重試。若供應商已收件但回應失落，不能承諾外部計費 exactly-once；記錄「費用不確定」，仍受整體預留上限控制。工作完成／取消只結算一次，釋放尚未發出的預留額度。

既有 per-location rate limiter 只能當流量保護；真正帳號額度以 D1 原子預留為準。部署地點 `gcp:asia-east1` 是 Worker placement，不代表 Vertex AI。供應商與模型沿用可替換介面，不在本案選定 Pro 模型。

## 6. 原題練習與事件紀錄

### 6.1 作答事件欄位

`practice_attempts` 建議欄位：

| 欄位 | 定義 |
| --- | --- |
| `id`、`user_id` | 客戶端先生成 UUID；`UNIQUE(user_id, id)` 用於重送去重 |
| `learning_question_id`、`revision_id` | 個人題目與實際作答的不可變版本；伺服器驗證兩者同屬目前帳號 |
| `session_id`、`session_item_id` | 同輪同題的提交識別；對原始提交的 `(user_id, session_item_id)` 建部分唯一索引（`supersedes_attempt_id IS NULL`），防連點時換 UUID 重複計次；更正事件沿用此識別，但由取代關係去重；下一次練習用新的值 |
| `answer_json` | 本次選項／文字；自評可空 |
| `grading_method`、`result` | `automatic`／`self`；`correct`／`incorrect` |
| `grading_basis_json` | 當時正解、題型、規則版本、確認狀態與版本 ID；不依賴現在的答案 |
| `client_answered_at`、`answered_at`、`received_at` | 裝置原始時間、校驗後統計時間、伺服器收件時間；分開保存 |
| `client_timezone`、`time_quality` | 時區與時間校驗結果；不假裝完全掌握裝置時間 |
| `used_original_image` | 本次提交前是否開過原圖，供解讀樣本使用；不是作弊標記 |
| `request_hash` | 標準化提交內容的 hash；相同 ID 不同內容回 `409` |
| `voided_at?`、`supersedes_attempt_id?` | 明確作廢／更正鏈；保留舊依據，統計只計有效事件 |

後端採自動判分時，忽略客戶端傳來的答對／錯與正解，以指定 revision 的 key 計算；自評才採用使用者提交的結果。複選去重後比集合，忽略順序，不做部分給分。選項 ID 不存在時回欄位錯誤，不當成答錯。

略過不呼叫提交 API，也不寫「空答案＋答錯」。若使用者主動選擇自評答錯，則是有效提交。

### 6.2 修改正解與更正本次結果

- 修改題目正解只建立新 revision；以後練習用新版本。既有事件不跟著重算。
- 需要更正某次結果時，採明確更正命令：同交易將目前仍有效的鏈尾事件作廢並新增取代事件，原依據仍留存；以前置事件只能被取代一次的唯一約束、有效狀態 CAS 及冪等鍵防止分叉與重複更正。
- 判錯答案不合理時，介面要如何引導改正解／改本次結果見 U08。第一版不做「改一題答案就全歷史自動重算」。
- 重送相同事件即使後來已更正，也回傳原事件及其已被取代狀態，不產生第二筆有效紀錄。
- 分析期間使用 `answered_at`；晚同步事件在下次新報告納入，不回寫已保存報告。未來時間超出容許時差時保存原始時間並標記，以 `received_at` 作統計時間，回傳修正原因；過去的離線時間不因離線很久就丟棄。

### 6.3 離線與帳號隔離

新增 IndexedDB `practiceOutbox`，key 為 `[userId, attemptId]`，每筆保留完整且不可變的提交 payload、revision ID、retry 狀態；另存 session item 的提交識別，刷新後沿用。記錄成功落地後才能顯示本機已保存。

連線後批次上傳，每次最多 50 筆，回逐筆成功／重複／衝突／不可重試；不可因一筆來源已刪除阻塞整批。401 暫停，不換帳號重送；登入另一帳號只讀該帳號的 outbox。未同步紀錄與伺服器歷史依 event ID 去重。

離線題目需快取完整 revision 與判分資料，本機可暫判；伺服器回來用同一 revision 再驗證。舊 revision 仍屬本人即可提交，不能強制換成現在答案。刪除題目後提交回 `410` 並保留可說明的本機錯誤，不重新建立題目。

報告 v1 只分析伺服器已接收紀錄；前端從目前帳號的 outbox 計算尚未同步數量，供 UI 提示，不能宣稱報告已包含全部。伺服器無法知道其他離線裝置尚未上傳的資料。訪客資料可否移轉見 U15，不能自行把匿名資料掛到下一個登入帳號。

整輪續作、持續抽題與新手寫草稿分別待 U06／U09／U10；目前事件 outbox 只承諾保存已提交紀錄，不等於已實作整輪進度。若選保存草稿，需新增獨立 attempt draft 的資產與同步設計，不能覆蓋既有訂正 workspace。

### 6.4 抽題服務與成本

以目前個人分類決定範圍。科目解析成可存取的 taxonomy 子樹；單次最多 250 節點，超過則回明確範圍限制，不能默默漏掉單元。

候選池先按 `(user_id, scope_topic_id, sample_key)` 隨機 pivot 作索引區間讀取，環回一次；再以有限近期作答索引補入近期錯題。每輪最多取得 300 個不同候選，對候選做 indexed latest-attempt 查詢／分組，不讀全文與圖片、不對整科 `ORDER BY RANDOM()`。

服務用候選的最近結果、最近時間與有無紀錄計算抽樣權重，同輪去重；抽定後才讀完整 revision。長期未練題的優先是此有限候選中的權重，不宣稱找到全題庫最久未練的前幾題。若未來要求全庫嚴格排程，再以成本證據評估獨立可重建排程投影。

題數與權重為具版本的 `PracticePolicy` 設定；服務支援最多 50 題／輪，實際預設、選項與比例等 U06 核定。未分類題如何進入科目操作見 U01。抽題不足就回實際可用題數，不擴到共用來源補題。

## 7. 個人分析如何運作

### 7.1 輸入範圍與一致性

請求明確帶 `subjectId`、選用單元、作答觀察期間 `from`、`to`、`timezone`。2026-10-22 核定期間為 7／15／30／60／90 天，預設 30 天；日期只篩選作答事件，不排除較早收錄且仍持有的題目。後端限制單次期間最多 366 天，要求較長範圍回可處理的錯誤。

期間定義分開保存：

- 收錄分布：該科目目前仍持有的不同個人題目，不按上傳日期排除舊題。作答觀察期間為 7／15／30／60／90 天，預設 30 天（2026-10-22 使用者核定）。
- 重作表現：指定期間內的有效事件；題目可能早於期間收錄，仍要納入。
- 全部個人庫存可另外給「截至分析時持有題數」，不能和期間收錄數混稱。
- 分組依分析時的個人分類，報告保存當時標籤；不假裝重建歷史分類。之後移動分類會使新報告分組不同。

一次 D1 batch 取得有界題目 metadata、事件與版本，建立固定 `data_cutoff` 的統計快照，不在這一步讀取所有題目全文。各查詢最多回傳 `cap + 1`，超限則要求縮小期間／範圍；不得截斷後呈現完整統計。涉及 cutoff 前的「最近有效結果」另對有限題目做索引探查，不把期間內最後一次誤稱為全歷史最後一次。

選出代表題後按固定 revision ID 批次讀取全文；本人筆記讀取必帶先前的 `notes_seq` 校驗。若已改版，最多重新建立快照一次，仍衝突則回可重試訊息。完成的 job 輸入以固定快照保存，之後 AI 不再混讀更新中的資料。

初始單次上限：所選科目／單元目前持有的不同個人題目 2,000 題、觀察期間內有效及待判定更正鏈事件合計 10,000 筆。這是技術保護值，需要壓測；不是宣稱 D1 一定只讀這些列。查詢計畫及 `rows_read` 另行驗證。

### 7.2 程式產生的事實

| 指標 | 定義與限制 |
| --- | --- |
| 收錄題數 | 該科目目前持有的不同個人題目；不是考試錯誤數／錯誤率，不受作答期間限制 |
| 有效作答次數、作答題數 | 有效事件數、不同 learning question 數；作廢者不計 |
| 重作答對比例 | 答對有效事件／全部有效事件；分別提供 automatic、self 的分子分母 |
| 最近結果仍錯 | 每題截至 cutoff 的最後有效事件為 incorrect；依 `(answered_at, received_at, id)` 穩定排序 |
| 重複答錯 | 指定期間同題至少兩筆有效 incorrect；不把上傳一題當第一次錯誤事件 |
| 久未重作 | 以最近有效事件時間計算；沒紀錄者獨立為「尚無重作紀錄」 |
| 資料組成 | 涉及題目的 ai／confirmed、缺正解、缺原作答、缺題文數；另列事件提交時的確認與自評／原圖使用組成 |
| 前後變化 | 對同一題至少兩筆有效紀錄提供最早與最近變化；期間間比較附雙方樣本及重疊題數，不直接稱能力進退 |

沒有任何事件時，答對比例為 `null` 而非 0%；只分析收錄內容分布。不根據錯誤選項獨自斷言「粗心」或「觀念不懂」。同題進步只能描述此題重作結果，不能推論整科能力。

### 7.3 交給 AI 的資料

AI 接收：scope／period、由程式產生且帶 metric ID 的事實、至多 24 題的代表性證據，以及候選推薦 ID。證據依單元分層選擇，涵蓋近期再錯、重複出錯、結果轉好與尚無紀錄；選樣政策與截斷狀態寫入報告。

每題只帶需要的題幹、選項、正解、本人原作答、關鍵字、錯因、本人文字筆記及有界事件摘要。整個文字輸入初始上限 20,000 tokens；超限優先縮減證據題數／筆記，不截掉選項後讓 AI 猜完整題。全文不足的題目只能做有限解讀，不能補造證據。

不傳全部圖片、不傳共享作者的筆記、不把手寫向量當成已辨識文字；不傳 email、姓名或其他無關帳號資料。本人筆記要經 own／saved workspace 授權讀取；不存在就空白。

輸出 schema 限制為考點、可能錯因、練習建議與 `evidenceIds`／`metricIds`。數字卡由 `stats_json` 渲染，AI 不負責再計算一套。查核引用必須出自輸入白名單；不存在或越權引用使該段無效，必要時報告降級成「統計可用、AI 解讀失敗」，不得整張頁面空白。

自然語言仍可能出錯，schema 不能保證推論正確；驗收需人工核對代表案例。資料不足時明確回傳限制。推薦題 ID 只能取自本人可練習集合，連結導覽仍重新授權；AI 不能自行建立任意 URL 或加別人的題目。

### 7.4 保存與失效

- 讀取統計不呼叫 AI；生成報告是獨立命令。進頁是否自動發命令／使用快取由 U11 決定，首頁不觸發。
- 同 input hash、模型與 prompt 版本可重用報告；產生新報告不覆蓋舊快照。保留幾份與歷史介面見 U12。
- 新事件、分類修改、確認／正解／筆記修改使舊報告不再代表最新資料，但不改寫舊報告數字。相關 mutation 以帳號、受影響科目標記已存報告 stale；跨科目移動標記兩邊，分類樹結構變更標記該帳號相關報告。
- 生成期間又有資料異動時，新報告仍屬自己的 cutoff；完成時比對輸入版本／截止後事件，必要時即標 stale。不能因較晚完成就稱「最新」。
- 來源作者撤權不影響已保存的個人保留版本；使用者刪除自己的題目時，清除對應個人資料與事件，並刪除含其證據的報告內容；範圍內其他報告標 stale。必要刪除清理有索引，避免殘留題文在報告 JSON。
- 刪題同時按 target 清除其辨識 job 輸入／候選結果，並取消該帳號進行中的分析 job、清除其輸入，避免尚未生成報告的快照殘留刪除資料。完成的分析 job 只留 report ID／技術摘要，不再複製題文；失敗／取消的輸入也清除。帳號刪除沿用既有個人資料清理流程擴充，不能只清主表。
- 快取 key 包含 user、scope、period、input version；個人報告回 `Cache-Control: private, no-store`，不使用公開 CDN cache。

## 8. API 與應用服務契約

下列為待新增端點，名稱可在實作依既有 router 命名調整；語義與安全條件不可省略。使用既有登入驗證，`user_id` 只取 session，不採用 body 的帳號值。

| 方法／端點 | 契約 |
| --- | --- |
| `POST /api/learning/questions/resolve` | 輸入最多 50 個 owned／saved ref，批次取得個人入口、current revision、確認狀態；無資料不觸發 AI |
| `PATCH /api/learning/questions/:id` | `expectedRowVersion`、欄位變更、明確 confirm 意圖；回新版本；409 附可重新載入資訊 |
| `POST /api/learning/questions/:id/confirm` | 確認指定 revision／row version，空欄位合法 |
| `POST /api/learning/questions/:id/recognition-jobs` | 建辨識候選工作；Idempotency-Key；回 202 與 job ID |
| `POST /api/learning/questions/:id/apply-recognition` | 指定 candidate job 與 expected versions，採用範圍由 U04 對應；候選不能任意跨題套用 |
| `GET /api/learning/jobs/:id` | 帳號隔離；回狀態、簡短錯誤與 retry-after；前端只在等待該工作時有界輪詢，離頁停止 |
| `POST /api/practice/sets` | scope、count、policy；回不同題目、revision、session item IDs；讀取不新增 attempt |
| `POST /api/practice/attempts:batch` | 最多 50 個獨立事件；逐筆回覆判分、重複、衝突或不可重試 |
| `GET /api/learning/questions/:id/attempts` | cursor 分頁，每頁最多 50；含更正關係，預設歷史順序固定 |
| `POST /api/practice/attempts/:id/corrections` | 明確作廢／取代，具冪等鍵；更改正解本身走題目修改端點 |
| `POST /api/analysis/stats` | 明確 scope／period；只算事實，回資料組成與限制 |
| `POST /api/analysis/reports` | 生成／重用工作，Idempotency-Key；回 report 或 job，範圍超限不排入工作 |
| `GET /api/analysis/reports/:id` | 讀固定報告，附 stale／cutoff／來源組成；每次授權 |
| `GET /api/analysis/reports` | 同帳號、選定科目的 cursor 列表；只讀摘要，不讀全部題文 |

任何可猜測 ID 的端點均以帳號條件查詢。不存在／他人資料一致回 404；已知本人已刪除事件來源可回 410。409 表示版本或冪等內容衝突；422 表示欄位／範圍無法處理；429 帶可重試時間，前端不可自行無限重送。

## 9. 索引、讀取成本與舊資料轉換

### 9.1 必要索引

| 表 | 索引／查詢用途 |
| --- | --- |
| `learning_questions` | unique `(user_id,item_id)`、`(user_id,saved_ref_id)`；範圍 `(user_id,scope_topic_id,acquired_at,id)`；抽樣 `(user_id,scope_topic_id,sample_key,id)` |
| `learning_question_revisions` | unique `(learning_question_id,revision_no)`，PK 讀版本 |
| `learning_revision_asset_refs` | `(asset_id,revision_id)` 供 GC；revision 方向唯一參照 |
| `practice_attempts` | `(user_id,answered_at,id)` 期間；`(user_id,learning_question_id,answered_at DESC,received_at DESC,id DESC)` 最近／歷史，最近有效結果使用 `voided_at IS NULL` 的索引；唯一 session item；取代關係唯一 |
| `ai_jobs` | unique `(user_id,kind,idempotency_key)`；`(state,next_attempt_at,id)` 及逾期 lease 修復索引；`(user_id,kind,state)` 與 `(user_id,target_id)` 用於取消／清理；只投影需要的欄位 |
| `analysis_reports` | `(user_id,computed_at DESC,id)`，scope 查詢／失效需要可索引科目欄位，不能只藏在 JSON |
| `analysis_report_questions` | `(learning_question_id,report_id)` 刪除與證據查核；report 方向主鍵 |

同時執行的相同 AI 工作另以帳號、kind、target、input hash 的有效狀態唯一約束擋競爭；不能只在 API 先 SELECT 查重。大量 scope ID／candidate ID 的 SQL 參數需依 D1 限制分批或使用已驗證的集合輸入，不能直接展開無上限 IN 子句。

SQL 需結合使用者與時間／科目過濾。可使用有限候選的索引探查，不允許前端每張卡各發一次請求。索引是否必要以 `EXPLAIN QUERY PLAN` 與 D1 `rows_read/rows_written` 驗證，不為所有欄位盲目加索引。[索引說明](https://developers.cloudflare.com/d1/best-practices/use-indexes/)、[執行 meta](https://developers.cloudflare.com/d1/worker-api/return-object/)

### 9.2 舊 OCR 與個人資料初始化

1. 先建新表並部署雙寫：新上傳／重辨識的純題文寫 `item_texts`，同交易更新 FTS 投影；存入快照改讀 keyed 文字。
2. 既有 FTS 做一次可續跑的 rowid 游標批次回填（初始每批 250 列），按合法 owner 匹配 item；同 item 取最大 rowid 的文字。`item_texts` 暫存回填來源 rowid／origin，後來出現較新的舊 FTS 行才覆蓋前一回填值；絕不可蓋過已由新辨識／人工修改寫入的文字。
3. 回填不宣稱舊 OCR 已去除答案。將 `text_origin = legacy`，不自動設 confirmed；結構化欄位仍可空。含原答案的舊文字如何提醒／是否先整理才能抽題見 U02。
4. 分批為 owned／saved 建 `learning_questions` 與初始 revision，採來源表主鍵游標與唯一約束；saved 只讀當下保留的 `source_text`。缺文字或版本不匹配保留空，不回頭讀別人的來源最新內容。
5. 各批重新檢查版本；撞到同時修改就略過重試，不寫回過期值。設回填 checkpoint 與完成旗標，記錄成功／缺漏／衝突數，不記題文。
6. 轉換完成前，新功能限制在已準備範圍並回明確 coverage；不以不完整題數宣稱全科統計。未轉換題的舊功能仍可讀既有資料，但新功能不做逐題 FTS fallback。來源 snapshot 新建需要文字時，未轉換可先保留空，不偷偷加全表查詢。

不為舊題自動發出全面 AI 呼叫、不自動補造原作答或重作結果。新欄位確認後，搜尋／存入快照雙寫只投影可分享的純題幹，不能把個人答案混入 `source_text`。

### 9.3 成本驗收

建立含其他帳號、稀疏科目、長歷史的測試庫，比較 1,000 與 10,000 題情境。記錄 SQL 數、rows_read、rows_written、回應大小、AI token／次數。首頁沒有新增全庫分析查詢；抽題讀取受候選上限控制；期間統計不得掃其他帳號；舊 OCR 回填只在 migration 任務發生。

不先承諾「降低幾成」；將基準與新功能成本實測附到 D1 優化文件。若索引仍導致讀取隨其他帳號資料等比成長，視為未過 gate。

## 10. Migration、部署與回復計畫

目前 migration 到 `0013`，`0011` 已撤回。實作當日重新列檔案再配置流水號；暫定如下，**不建立或執行這些檔案於本次規劃工作**：

| 暫定 | 內容 |
| --- | --- |
| `0014_learning_foundation.sql` | keyed 文字、個人入口／revision、歷史圖片參照與 inventory、jobs／usage、限制與索引 |
| `0015_practice_attempts.sql` | 作答事件、更正鏈、去重／查詢索引 |
| `0016_personal_analysis.sql` | 報告、證據關聯與失效索引 |

每階段實作必須同時交付：migration、`schema.sql` 的全新空庫基準、`scripts/init-local-db.mjs` 增量辨識／初始化、唯讀檢查、既有資料回填程式、正式執行指令及復原說明。已有資料庫絕不重跑整份 schema。

階段 1A 實際使用 `scripts/apply-learning-schema.mjs --target=local|remote --check|--apply`；預設只檢查，必須明確指定目標。以 SQLite DDL 比對 tables／indexes／triggers／view 定義；部分套用或不一致時拒絕繼續寫入。舊文字回填另用 `scripts/backfill-learning-text.mjs`，一輪最多 250 個 FTS rowid，不呼叫 AI。後續 practice／analysis 的 migration 各自新增，不重用 0014；指令詳見實作紀錄。

下列為實作後文件必須提供的命令範本；目前新腳本尚不存在，不可現在執行：

```powershell
npm run d1:check
powershell -File scripts/apply-learning-schema.ps1 -Target local -Stage foundation -CheckOnly
powershell -File scripts/apply-learning-schema.ps1 -Target local -Stage foundation
powershell -File scripts/apply-learning-schema.ps1 -Target remote -Stage foundation -CheckOnly
powershell -File scripts/apply-learning-schema.ps1 -Target remote -Stage foundation
```

正式順序：唯讀盤點 → 備份／記錄復原點 → additive schema → Queue／consumer／修復排程配置 → 雙寫服務 → 分批回填與核對 → 開啟各功能。既有 migration 曾用手動 SQL 的環境先對照實體 schema 與執行紀錄，不能直接 `migrations apply` 重跑全部歷史。[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

失敗時先關新功能旗標與新工作接收，保留事件／版本資料；回復程式須保有雙寫相容或暫停相關寫入，不讓舊服務把新資料悄悄弄成過期。備份還原是受控維運動作，不能當成無代價回滾，會影響其後新增資料。

程式驗證後分階段本機 Conventional Commit；推送需使用者授權，部署沿用 CI，不執行手動 `wrangler deploy`。

## 11. 分階段工作包與驗收

| 階段 | 可直接準備的後端工作 | UI 實作前需批閱 | 出口條件 |
| --- | --- | --- | --- |
| 1A | 型別、schema、版本／CAS 服務、回填與唯讀檢查 | 無；可先做後端測試 | owned／saved 隔離；舊資料不丟；confirmed 保護 |
| 1B | AI schema、Queue／job／budget、候選套用、相容舊端點 | U01～U05、U15；多題圖片涉及 U16 | 同次擷取；舊背景／手動路徑都受保護；模型錯誤可恢復 |
| 2 | 抽樣、判分、事件、更正、outbox、歷史 API | U06～U10、U15 | 多次離線事件全數存在；重送不增計；舊答案可追溯 |
| 3 | 有界統計、報告快照、引用驗證、推薦、失效 | U11～U14 | 數字可重算、引用可授權、資料不足可降級、成本過 gate |
| 4 | 另案評測與設計 | Pro 規格另議 | 不列入本次完成條件 |

必要驗證案例：

1. A 帳號猜 B 的 ref／revision／job／report ID 無法存取；換帳號不送出前帳號 outbox。
2. owned 與 saved 同時可辨識、修改、練習；集合可讀題不能繞過個人範圍。
3. AI 執行中人工修改／確認／改分類／刪除題目，完成時不覆蓋、不復活。
4. 重新分析舊 endpoint 也不能覆蓋 confirmed；存入題不污染共享來源。
5. source refresh 刪舊 snapshot 後，舊 attempt 仍可取到原正解與題幹版本；GC 不刪除仍有學習版本參照的原圖。
6. 單選、非字母選項、複選不同順序、缺正解、自評、略過及非法 option ID。
7. 同題三次離線提交保留三次；連點同一 session item 只一次；重送同 payload 不增加，不同 payload 衝突。
8. 修改正解不改歷史；明確更正只留一筆有效取代事件；統計排除作廢結果。
9. 零事件回 null 比例、不宣稱進步；混合自評與自動判分分母可對回事件。
10. 報告生成期間新增事件／改筆記後 freshness 正確；刪題清理報告證據；來源撤權仍可讀本人保留版。
11. Queue 重複、API 建 job 後發送失敗、consumer 中斷、供應商 timeout：不重複套用，呼叫受預算限制。
12. 空庫／現有完整庫／部分 migration／回填中斷／同時新辨識；CheckOnly 保持零寫入。

## 12. 使用者休息後的閱讀順序

只要先看 [批閱表的第一批 U01～U05、U15、U16](./PERSONAL_ANALYSIS_UX_REVIEW_2026-10-21.md)，即可決定第一階段介面。第二、三批可等各階段開始前再回覆。

後端模型與安全／成本設計已在本文具體化，無須逐欄批准；若不同意某項技術取捨，可直接在本文批註。UI 選項沒有預勾，未回覆前不代做產品決策。
