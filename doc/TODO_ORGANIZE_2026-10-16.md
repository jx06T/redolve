# 待辦整理：Sort to…

更新：2026-10-16。已實作；本地 0013 已完成，正式 0013 尚未確認（最近一次查詢回 7403，未寫入）。

## 操作規格

目的：依序選出現在或稍後想做的事項，整組移到指定位置；不要求選完整張清單。

1. 首頁／設定待辦卡片右上角「整理」進入淡綠整理模式；首頁入口位於三點選單左側。
2. 點未完成事項左框，依點選順序編號；重點已選事項取消，後續編號遞補。選取不移動清單、不改完成時間、不發請求。
3. 按「Sort to…」進入目的地步驟。原有事項仍在原位、編號保留、已選文字淡化；主動顯示可點的線與加號，不加「插入 X 上方」等位置文字。
4. 插入位置以邏輯取出已選事項後的未完成清單計算；每個不同目的地只顯示一次。最前與最末皆可選，全部選取時只剩一個目的地。
5. 點位置即依編號插入並退出整理。未選事項保留相對順序；今日已完成事項統一置於今日清單上方且保留順序，歷史事項不參與。

- 例：A B C D E，選 C B E；選最前 → C B E A D；選 D 前 → A C B E D；選最後 → A D C B E。單一移動、相鄰交換沿用相同流程。
- 「返回選取」保留編號；Escape 在目的地步驟返回選取、在選取步驟取消整理。取消不寫入。未選事項時停用 Sort to。
- 整理期間暫停新增、文字編輯、完成、刪除、歷史拉開與選單操作；保留新增草稿。目的地步驟也暫停變更編號。
- 保留原生縱向清單捲動、Dashboard 橫向滑頁；從插入位置滑動、拖離／取消不應誤套用。標記可用 Tab／Enter／空白操作，提供無障礙名稱但不顯示位置文字。
- 選取／目的地切換時，以可見事項位置保持捲動；套用不強制回頂端，退出焦點回整理按鈕。
- 整理時固定原有項目的順序；同步導致事項刪除、完成或移入歷史，該事項退出選取並重新編號。新同步項目附加於後方。選取全失效時返回選取步驟；失效目的地不改成其他位置。
- 套用過一次後，今日完成事項持續排在未完成事項前。新增事項目前仍接在末尾；勾選與取消保留排序順位。

## 暫停中的新增區設計

- 輸入框左右選擇新增至上／下、Enter 動作與裝置記憶，等待排序完成後討論；本次不變更新增操作。
- 先前輸入區實驗另存忽略的本地草稿 .wrangler/qa/todo-input-design-draft/，不納入提交；混合快照不可直接整檔覆蓋正式版本。

## 資料與同步

- `home_widget_preferences.todo_order`：JSON 字串陣列，預設 `[]`；只儲存 ID，不改建立時間或完成時間。
- `orderedCurrentTodos`／`todoInsertionTargets`／`organizeTodoOrder` 為普通資料上的純函式，UI 不直接呼叫 HTTP。
- 套用沿用 `homeWidgetService.preferences`、40 秒讀取快取、帳號隔離、每操作持久佇列與樂觀顯示。訪客只存本機；登入使用者同步至 D1。
- 未套用 0013：讀取與一般待辦操作仍可使用；排序回 `503 TODO_ORDER_SCHEMA_PENDING`，本機順序與操作佇列保留，其他事項寫入不被阻擋。套用後重新同步。
- 排序使用原順序作為 base；同一排序欄位衝突時，內建對話框顯示本機／雲端事項順序，可選保留版本。文字、完成狀態與倒數排序各自獨立。
- API 最多 500 個唯一待辦 ID，只接受本人待辦；本人墓碑 ID 可供離線重送，但不會恢復已刪除事項。以 ID 索引驗證，不掃描所有使用者。
- 偏好請求上限 96 KiB，涵蓋 500 個最長 ID 的 base＋patch；新增／修改單題仍維持 16 KiB。選取零請求，套用只寫一次偏好。

## 正式發布前：執行 0013

0011 是已撤回的舊方案，**不要執行或重新建立 0011**。本次使用 `0013_todo_organize.sql`，只新增欄位，舊版程式可繼續使用。

在專案根目錄、具 Cloudflare D1 權限的終端機執行：

```powershell
Set-Location D:\Document_J\redolve
node .\scripts\apply-todo-organize.mjs --remote --check
node .\scripts\apply-todo-organize.mjs --remote
node .\scripts\apply-todo-organize.mjs --remote --check
```

- 最後應顯示 `todo_order_column=1; required=1`。
- 腳本直接使用專案本地 Wrangler，不經 npx。必須明確指定 `--remote` 或 `--local`。
- `--check` 唯讀；正式套用先取得 Time Travel bookmark 並保存，再新增欄位，最後核對欄位與原有事項／偏好列數。失敗立即停止；已完成時重跑不寫入。
- 只有這個新增欄位，不需要重新套用其他已完成 migration。回退程式可保留此欄位。

## 本地狀態

0013 已備份後套用並驗證，原有事項／偏好列數保持不變。備份：

`.wrangler/local-db-backups/2026-10-16T09-15-37-038Z-before-todo-organize/d1`

```powershell
node .\scripts\apply-todo-organize.mjs --local --check
```

其他開發環境可執行 `node .\scripts\apply-todo-organize.mjs --local`；完整初始化 `scripts/init-local-db.mjs` 也已包含 0013。備份本地 D1 前先停止該資料庫的 Worker 開發程序。

## 驗證

- 本次：tests/todo-organize.test.mjs 驗證最前／中間／最後、單一移動、相鄰交換、未選相對順序、目的地去重／失效、完成區與歷史排除；保留 migration runner CheckOnly、備份／bookmark、重跑與停止測試。
- 本次：tests/todo-organize.browser.mjs 390／1280px、訪客／登入；選取／取消遞補、目的地顯示、返回／Escape、部分／全部選取、重整持久、新增仍追加、缺 schema 保留佇列與衝突版本選擇。390px 另測長清單位置保持、原生觸控捲動／橫向滑頁不誤排序、滑鼠拖離返回不套用、鍵盤目的地套用。
- 本次：既有歷史手勢四組瀏覽器回歸、TypeScript、正式建置／SW、PWA 通過。瀏覽器 API 使用 fixture；實體手機手感、正式跨裝置同步待發布後驗收。
- 前次 0013 實作已驗證：tests/home-widgets.test.mjs 實際 Miniflare D1 的舊 schema、權限隔離、重送、欄位獨立、排序衝突、墓碑、500 筆最長 ID 與索引使用。本次僅更換前端排序互動，不新增 migration。
