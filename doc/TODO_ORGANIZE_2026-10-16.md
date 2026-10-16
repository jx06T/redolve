# 待辦整理：Top／Sort

更新：2026-10-16。已實作；本地 0013 已完成，正式 0013 尚未執行。

## 操作規格

- 首頁／設定的待辦卡片右上角新增「整理」，首頁位於三點選單左側。
- 整理模式：淡綠背景與邊框、「整理中」、操作列；只選取未完成事項。
- 左框依點擊順序顯示 1、2、3；重點已選事項取消，後續編號遞補。選取不移動清單、不修改完成時間、不發送請求。
- 整理期間暫停新增、文字編輯、勾選完成、刪除、歷史拉開與選單操作；保留原有新增草稿。鍵盤可用 Tab／空白選取、Escape 取消。
- Top：選取事項依編號排到未完成區最前面，其他事項保留相對順序。
- Sort：從最靠前選取事項的原位置插入整組選取事項；其他事項維持相對順序，位置可被推後。
- 例：A B C D E，選 C B E；Top → C B E A D；Sort → A C B E D。
- 套用後，今天已完成事項統一置於今日清單上方，保留其順序；昨天以前事項仍在既有收起的歷史區，不參與排序。
- 套用後退出整理。Top 回到清單頂端；Sort 保留瀏覽位置。取消不寫入，清除編號。尚未選取時停用 Top／Sort。
- 套用過一次後，今日完成事項持續排在未完成事項前。新增事項接在未完成區末尾；勾選與取消仍保留該事項的排序順位。
- 整理時固定原有項目的顯示順序；同步導致項目刪除、完成或移入歷史，該項目退出選取並重新編號。新同步項目附加於後方。

## 資料與同步

- `home_widget_preferences.todo_order`：JSON 字串陣列，預設 `[]`；只儲存 ID，不改建立時間或完成時間。
- `orderedCurrentTodos`／`organizeTodoOrder` 為普通資料上的純函式，UI 不直接呼叫 HTTP。
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

- `tests/todo-organize.test.mjs`：Top／Sort、部分選取、未選相對順序、完成區、歷史排除、新事項追加；migration CheckOnly、bookmark／備份順序、重跑及失敗停止。
- `tests/home-widgets.test.mjs`：實際 Miniflare D1，舊 schema、權限隔離、重送、欄位獨立、排序衝突、墓碑、500 筆最長 ID 與索引使用。
- `tests/todo-organize.browser.mjs`：390／1280px、訪客／登入，模式顏色、編號／取消遞補、禁止其他編輯、取消／Escape、Top／Sort、完成置頂、重整保留、新事項追加；缺 schema 保留排序並允許完成寫入；本機／雲端衝突選擇。
- 既有歷史手勢四組瀏覽器回歸、TypeScript、建置／SW、PWA。瀏覽器 API 使用 fixture；實體手機／跨裝置正式同步待發布後驗收。
