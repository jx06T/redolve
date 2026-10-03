# 共用／訂閱實作進度與待辦

更新：2026-10-04。規格唯一來源：[SHARING_SPEC.md](./SHARING_SPEC.md)。本文件只記錄實際完成、驗證邊界和待辦。

## 目前狀態

**本地 v2 功能已串接並通過主要多人整合測試；尚未部署、推送或執行遠端 0002 migration。**

2026-10-04 再次以 Wrangler 唯讀查詢遠端 D1：`d1_migrations`、`collections`、`owner_transfers`、`assets` 全無，0002 仍未套用。這不是 migration 已執行的證據；正式套用前仍須重查狀態與取得當時的新 Time Travel bookmark。

使用者於 2026-10-04 提供遠端唯讀查詢：`d1_migrations`、`collections`、`publication_revisions`、`shared_layers`、`saved_refs`、`saved_snapshots` 均未出現在指定表清單；`items` 沒有目前 0002 第一個新增的 `content_seq`／`draw_seq`／`notes_seq`；`d1_migrations` 查詢回報 no such table。第二次查詢 `assets`、`asset_refs`、`collection_items`、`collection_grants`、`collection_events`、`subscriptions`、`personal_workspaces`、`public_profiles`、`invitations`、`grant_holders` 也全部無結果。據此目前版本 0002 尚未套用，亦未發現該版本的局部表。先前 `0001` 是透過 `d1 execute --file` 手動執行。`wrangler.jsonc` 已指定 `worker/migrations` 為 migration 目錄。遠端純 schema 匯出因既有 FTS5 virtual table 失敗，沒有產生匯出檔；已取得 Time Travel bookmark `0000021f-00000000-000050f9-fa9c3a93642280e67a8e90228c114ab5`。套用前改以唯讀 `sqlite_master` 查出遠端 DDL，核對與 0002 的相容性。

已讀取 `.wrangler/remote-schema-before-sharing.json` 的遠端 DDL（12 個物件，含 `items_fts`）；將其重建於本機 SQLite，依序執行已手動套用過的 `0001` 與待套用的 `0002`，並以舊題目資料測試：migration 成功、舊圖片鍵回填至 `assets`／`asset_refs`、`draw_seq` 從 `vector_clock` 回填、`foreign_key_check` 無違規、`integrity_check` 為 `ok`。這是 schema 與合成資料驗證，尚未驗證遠端真實資料及 R2 物件。

另以 Wrangler 本機 D1 的獨立 `--persist-to` 目錄重建遠端 DDL 並放入舊題目，執行 `d1 migrations apply --local`：`0001` 與 `0002` 均成功記錄；驗證 `d1_migrations=2`、`assets=1`、`asset_refs=1`、舊題 `draw_seq=3`。本機 Wrangler 寫入使用者設定目錄的 debug log 曾遇 sandbox `EPERM`，但命令退出碼為 0、D1 結果成功。

切換時間差處理：舊版 Worker 在 0002 套用後、前端／Worker 新版部署前仍可能上傳題目，只寫入 `items`。新增 `scripts/sharing-backfill-late-uploads.sql` 供新版 Worker 上線後執行；它補齊圖片資產和引用，回報 `missing_source_links`，可重複執行。本機 Wrangler D1 以模擬晚到上傳測試兩次，兩次皆回報 0 缺漏。

遠端唯讀資料品質檢查：`items=219`、空 `image_url=0`、相異圖片鍵 `=219`。因此在既有資料未變動的前提下，0002 回填應產生 219 筆 `assets` 和 219 筆 `asset_refs`；正式套用後要以實際數值核對。尚未驗證每個 R2 物件是否存在。

推送前再次檢查：TypeScript、分享 API 整合測試、schema 測試 5/5、Vite 建置、PWA 發版測試 4/4、`git diff --check` 均通過。`wrangler deploy --dry-run` 成功打包 Worker 與 42 個靜態檔。遠端 Worker 已有 `ADMIN_EMAILS`、`BETTER_AUTH_SECRET`、`GEMINI_API_KEY`、`GOOGLE_CLIENT_SECRET` 等 secret 名稱；`GOOGLE_CLIENT_ID` 在 `wrangler.jsonc`。secret list 不驗證值本身。因推送會觸發自動部署，0002 尚未遠端套用前不能直接推送新 Worker。

## 已實作

- v2 live 集合模型：建立、啟用、暫停、軟刪除、公開／連結／指定對象可見性；owner、具名 contributor／viewer、邀請、觀看連結、撤權、退出。
- 建立者可邀請已接受的貢獻者接手；對方在集合頁主動接受前不生效。邀請七天過期、可撤銷，移除貢獻者或刪除集合會取消邀請。接手後原建立者轉為貢獻者，既有來源題仍可觀看；集合頁顯示彙總統計，不揭露個別訂閱者的閱讀紀錄。
- 貢獻者只能加入自己的原題。加入有效集合即時可見；來源 metadata 後續修改即時反映，不產生新題通知；原圖不可透過題目 PATCH 替換。
- 共有筆跡和筆記以個人層儲存，分開 `draw_seq`／`notes_seq` 衝突檢查。顯示給觀看者的兩項開關獨立；退出／撤權後舊層 detached，原作者可取回筆記及筆跡 JSON。
- 訂閱、跨集合新題、已看及帶簽章高水位的「全部標記已看」；來源集合、科目及下層單元、未看、已存篩選；前後端分頁。
- 存入個人題庫時建立固定 snapshot、可讀的參考層及圖片引用。來源撤權後本人仍可讀已存內容；主動更新來源只換來源 snapshot，保留私人筆跡、筆記、分類、狀態及工作區 ID。
- 前端頁面：集合探索／建立／管理／邀請／閱讀／共用層、訂閱中心、已存清單和詳情、存入時個人分類、個人題庫來源標記與集合篩選、預設上傳目的地。集合閱讀可依標準單元、來源標籤、已看及已存篩選，並以游標載入更多；單題可移動至上／下一題，owner 可上移／下移排序。共用頁使用獨立的鼠尾草綠識別區；未改既有 iPad／手機刻意設計。
- 集合頁的可加入原題由後端依本人、ready 圖片與未加入條件分頁列出，可搜尋並每批加入最多 50 題，逐題回報結果；貢獻者可設定公開名稱。訂閱管理可搜尋集合／作者並看可讀與失效數。新增 `/my/notebook` 合併本人原題和已存題，支援來源、課綱、狀態、貢獻集合與游標分頁。
- 公開集合與題目白名單搜尋、內容檢舉與管理端處理 API。邀請和管理權限以資料庫目前 email 判斷，避免舊 JWT email 被繼續使用。
- 過期授權、邀請與接手邀請改以 SQLite `datetime()` 比較，避免 ISO 時間戳與 `CURRENT_TIMESTAMP` 格式不同造成逾時授權。未知 `/api/*` 路由回傳 JSON 404，不落到 SPA HTML。
- 上傳目的地加入結果與原題上傳結果分開回傳；離線筆跡／筆記遇 409 時停止重播並保留草稿。前端共用與個人草稿按筆跡／文字分開暫存。
- 自動 R2 實體刪除已停用且刪除未完成的 GC service；目前無排程執行實體回收。
- 新增唯讀 `scripts/sharing-asset-audit.sql`，檢查 D1 原題、已存 snapshot、共用／個人筆跡引用及未引用資產；本機 schema 測試驗證能發現缺失。此稽核不能證明 R2 物件位元組存在。
- 新增管理者專用 `/api/admin/assets/audit` 與 `/api/admin/assets/reverse-audit`：逐頁以 R2 `head` 檢查已登記 ready 資產，並以 R2 `list` 反查未登記物件。`/admin/sharing` 顯示雙向檢查進度與缺失清單，亦可查看及記錄內容檢舉處理狀態。這只做報告，沒有清理或隔離動作；正式環境須上線後實際掃描。

## 已驗證

- `node node_modules/typescript/bin/tsc --noEmit`：通過。
- `node --test tests/sharing-api.test.mjs tests/sharing-access.test.mjs`：2 項通過。Miniflare＋D1＋R2 測試多人加入、候選／批次加入、公開白名單、原圖不可替換、訂閱新題與父科目篩選、高水位防偽造、共用層可見性及衝突、個人存入及來源更新、撤權／原題刪除後來源失效且已存圖片與筆跡保留、detached 層本人取回、dashboard 查詢、restricted／link／public、viewer 禁寫、過期與撤權、建立者接手及未知 API 回應。
- `tests/sharing-schema.test.py`：6 項通過，檢查舊題圖片鍵 migration 回填、晚到上傳回填可重複執行、資產引用稽核與 FK／trigger 基本契約。
- `wrangler d1 migrations list redolve-db --local`：已辨識 `0001_auth_sessions.sql` 與 `0002_sharing_collections.sql`；這只驗證 migration 目錄設定，不代表遠端已套用。
- `node node_modules/vite/bin/vite.js build`、`node scripts/build-sw.mjs`、`node --test tests/pwa-release.test.mjs`：2026-10-04 最終 UI 修改後通過；41 個匹配資產進入 precache，PWA 發版測試 4/4 通過。工作機器的全域 `npm` 入口損壞，故以本地 `node_modules` CLI 執行；ESLint 套件未安裝，不能聲稱 lint 通過。
- 最終建置的 `node node_modules/wrangler/bin/wrangler.js deploy --dry-run` 通過，讀取 44 個 `dist` 檔；這不代表已部署。正式操作順序見 [SHARING_RELEASE_RUNBOOK.md](./SHARING_RELEASE_RUNBOOK.md)。

## 尚未完成：上線門檻

1. **遠端 migration 套用準備**：已確認目前版本 0002 尚未套用且未見局部表；純 schema 匯出被 FTS5 阻擋，已用唯讀 `sqlite_master` 取得建表定義，於隔離 D1 完成合成舊資料 migration，並完成遠端 `items` 資料品質統計。正式套用前更新 Time Travel bookmark；遷移後核對資產與引用筆數。Time Travel 還原會覆寫書籤之後的資料變更，不能當成不影響後續寫入的獨立備份。
2. **權限與資料完整性覆蓋**：已有 viewer／link／匿名、過期 grant、接手邀請、私人分類、圖片撤權與來源刪除案例；仍需重新加入 generation、多次 snapshot 刷新、兩裝置同欄位競態、失效集合搜尋及多重 grant 撤一保另一的完整矩陣。
3. **UI 完成度**：批次加題、訂閱管理搜尋與統計、集合統計、合併題庫入口已接上。仍需真實瀏覽器及實機驗證互動、空清單、載入及錯誤狀態；本機未安裝 Playwright，只有型別／建置與 API 整合驗證。
4. **生命週期**：owner 轉交已完成；帳號刪除時停止授權與來源清理、受理報告後的實際處置、公開搜尋索引／標準課綱版本化仍待實作。現階段公開搜尋使用即時 SQL `LIKE`，未建 FTS；目前產品沒有刪除帳號入口。
5. **資產維護**：D1 引用與雙向 R2 物件存在性唯讀稽核已備妥；仍需於正式環境執行並處理異常、staging 隔離清單、寬限、可重試工作租約及正式 GC gate。不得在這些完成前啟用自動實體刪除。
6. **實機／回歸**：實體 iPhone Chrome、iPad Safari/PWA 的圖片上傳、共用圖層書寫和來源更新；既有 guest 上傳、單題公開連結、CSS hash／PWA 404；Worker 與前端部署後健康檢查。

## 發布順序

遠端狀態與 DDL 確認 → migration／回填隔離驗證 → API／前端建置及整合回歸 → 更新 Time Travel bookmark → 遠端 migration → 立即部署新版 Worker／前端 → 執行 `scripts/sharing-backfill-late-uploads.sql` 並確認 `missing_source_links=0` → 實機驗收。資產 GC 最後獨立開啟。目前不得把「本地測試通過」視為可直接推送部署。
