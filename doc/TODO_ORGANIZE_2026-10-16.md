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
- 套用過一次後，今日完成事項持續排在未完成事項前。新增可指定未完成區最上／最下；勾選與取消保留排序順位。

## 待辦新增方向（2026-10-16）

- 首頁／設定共用一個 TodoComposer，只有一個真正的 textarea。
- 空白未聚焦：左半「↓ 新增至下」、右半「↑ 新增至上」；提示 pointer-events:none，手指實際點到 textarea。pointerdown 只記錄方向；原生 focus 才確認選擇，無 preventDefault／非同步 focus／更換節點。
- 聚焦後提示消失，單一送出按鈕改用對應方向箭頭；按鈕與輸入框等高，箭頭不另提供切換操作。
- Enter 送出保留焦點、清空文字且維持方向；Shift+Enter 換行，多行由上至下新增。中文組字期間含 keyCode229 不送出。
- 既有草稿內的點擊只調整游標，失焦也保留方向與文字；空白失焦恢復左右提示。新增失敗保留文字，再次編輯即清除舊錯誤。無常駐數量紅字；實際失敗才顯示簡短灰字，數量／字數檢查仍保留。
- 本裝置、各帳號分別記住最後方向（rdv:todo-insert:v1:<account>），不寫入 D1。首次 bottom；鍵盤直接聚焦沿用記憶，Alt+上下鍵可在輸入時切換，提供螢幕閱讀器說明。
- 新增至上位於今日完成區之後、未完成區之前；新增至下位於未完成區最後。未選事項維持相對順序，歷史區不參與；不強制捲動清單。
- homeWidgetService.addTodos 先驗證整批，再沿用建立佇列新增。top 或已有自訂順序時，在建立操作之後排入一次 todo_order 寫入；bottom 且無自訂順序維持原建立時間排序，不額外寫偏好。建立時間取本機時鐘與已載入同類項目最大值，避免重載後時間相同／倒退插錯位置。
- 方向選擇零 API，整批排序一次、依舊使用 0013；離線／缺欄位／排序衝突維持原有持久佇列與版本選擇。無新增 migration。
- 先前雙按鈕／Enter 設定實驗只保留在忽略的本地 .wrangler/qa/todo-input-design-draft/，已由上述設計取代；不可整檔還原。

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
- 本次：tests/todo-organize.browser.mjs 390／1280px、訪客／登入；選取／取消遞補、目的地顯示、返回／Escape、部分／全部選取、重整持久、預設新增追加、缺 schema 保留佇列與衝突版本選擇。390px 另測長清單位置保持、原生觸控捲動／橫向滑頁不誤排序、滑鼠拖離返回不套用、鍵盤目的地套用。
- 本次：既有歷史手勢四組瀏覽器回歸、TypeScript、正式建置／SW、PWA 通過。瀏覽器 API 使用 fixture；實體手機手感、正式跨裝置同步待發布後驗收。
- 前次 0013 實作已驗證：tests/home-widgets.test.mjs 實際 Miniflare D1 的舊 schema、權限隔離、重送、欄位獨立、排序衝突、墓碑、500 筆最長 ID 與索引使用。本次僅更換前端排序互動，不新增 migration。

- 新增區 tests/todo-composer.browser.mjs：390／1280px、訪客／登入，原生觸控聚焦未呼叫程式 focus、單節點與等高按鈕、左右方向、連續 Enter、草稿游標、Shift+Enter／中文組字、多行順序／整批驗證、重載與設定共用、離線連續操作／缺欄位重試。iOS 虛擬鍵盤仍需實體 iPhone 驗收。
