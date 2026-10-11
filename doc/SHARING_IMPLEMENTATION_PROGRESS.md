# 共用／訂閱實作進度與待辦

更新：2026-10-11。共用規格來源：[SHARING_SPEC.md](./SHARING_SPEC.md)；最新 UI 修正：[UI_UX_STUDY_RESTORE_2026-10-10.md](./UI_UX_STUDY_RESTORE_2026-10-10.md)。本文件只記錄實際完成、驗證邊界和待辦。

## 目前狀態

### 2026-10-11 公開探索排除本人集合（本機候選）

- 首頁公開探索及探索清單／集合選單使用 exclude_owned=yes，後端在 LIMIT／OFFSET 前排除目前帳號建立的集合，沿用 exclude_subscribed=yes。
- 僅排除集合 owner，不因使用者貢獻過題目而排除他人集合；訪客仍可探索全部可公開內容，直接連結與集合管理權限不變。
- TypeScript、production build／SW 與共用 API 回歸通過；本輪無 migration／secret。

### 2026-10-11 作業列表載入占位修正（本機候選）

- 清單仍每批 30 題、保留「載入更多題目」；選定科目時的側欄大綱另分頁取得全範圍 metadata，不下載全部題圖／作業。
- 修正 QuestionStream 首次載入占位高度為 0，導致已存／共用作業提示收縮、過早掛載更多題卡的問題；未測量時沿用 800px 預估高度，已有高度時保留測量值。overscan=4 維持，避免反向捲動過早卸載。
- 慢速 API 回歸：修改前 1280px 已存首屏發出 14 題作業請求；修正後 1280／390px 已存與共用首屏請求皆不超過 8 題。捲到底部不自動續載，手動按鈕才取 offset=30。
- 本輪無 migration／secret；TypeScript、production build／SW 與合成 API 瀏覽器回歸通過。

### 2026-10-11 閱讀篩選與共用集選擇記憶（本機候選）

- 探索、延伸題目分別保存已套用搜尋與選定集合；延伸另保存閱讀狀態、集合名稱搜尋與排序。刷題／搜尋的「共用中」保存上次選定集合。
- localStorage 依帳號與觀看範圍隔離；不可用時使用本次執行的記憶體。明確連結優先，focus 不持久保存；清除／取消選集會更新保存值。
- 還原先於題目查詢，URL 使用 replace 反映條件，不額外增加返回步驟。集合授權仍由原有 API 驗證，不因本機記憶取得權限。
- 本輪沒有 migration／secret；驗證含 TypeScript、production build／SW、5 項偏好測試，以及 1280／390px 合成 API 的切換 Tab、重整、清除、指定連結和帳號隔離。

### 2026-10-11 原題作業與共用中同步（本機候選）

- S01–S08：原題作者的共用筆跡／筆記直接讀寫 items；自己貢獻題的完成／取消完成／封存／還原及複習次數同步原題。其他成員仍使用獨立共用層與個人進度。
- 既有作者獨立 shared_layers 保留為唯讀舊共用作業；舊目標草稿可取回，不自動覆蓋原題。
- 側欄與搜尋提供「只看其他人貢獻」，卡片、metadata、大綱與 URL 範圍一致；canonical 作業更新會失效集合快取。
- 存入／刷新固定保存有權檢視的作者作業；筆跡由 R2 JSON＋saved_draw refs 保管，已存與個人 workspace 不依賴後續來源 ACL。修正 source-update 對 live／固定筆跡資產的誤判。
- 題目加入提示同步改寫，避免仍宣稱原題筆記不共享。D1 排序以 RETURNING 判斷實際更新，避免 version triggers 變更數導致成功誤報。
- 驗證：TypeScript、production build／SW、41 項 API／搜尋／權限／快取／PWA 測試、1280／390px 合成 API 瀏覽器測試通過；0006 腳本唯讀、重跑、部分安裝及失敗停止模擬通過。
- 新增0006、fresh schema、可重跑部署腳本與 local initializer；尚未執行遠端 migration／推送／部署。先完成0005，再依 [原題同步發布指南](./SHARED_SOURCE_SYNC_RELEASE_2026-10-11.md) 執行0006。
- 待辦：正式 schema 驗證、iOS/Pencil 實機雙向作業、正式 D1 rows_written fan-out 觀察；資產稽核／GC 維持既有策略。以下較早「私人作業完全不共享／作者個人進度獨立」由最新規格 S01–S08 取代。


### 2026-10-10 集合選題與探索／訂閱入口修正

- 完成候選圖片放大／大縮圖／OCR 摘要、管理列表文字、搜尋簡單檢視雙欄、首頁公開與私人動態分區、探索明確訂閱入口、個人檔案收到邀請與直接接受、延伸集合選擇及 scope 快取修正。
- TypeScript、production build／SW、12 項 API／搜尋／權限／PWA 與桌面／手機合成 API 瀏覽器回歸通過。
- 本輪無 migration／secret。前輪 0004 已唯讀確認遠端 table=1、columns=7；下節「尚未執行遠端 0004」是較早發布候選紀錄，已被此狀態取代。
- 本輪本機提交；未推送／部署。正式帳號與實機仍待驗收。詳細契約及驗收見 [UI_UX_EXPLORATION_FIX_2026-10-10.md](./UI_UX_EXPLORATION_FIX_2026-10-10.md)。
- 常駐全站導航以 [UI_UX_NAV_VISIBILITY_2026-10-10.md](./UI_UX_NAV_VISIBILITY_2026-10-10.md) 為準，取代舊沉浸式隱藏導航規劃。

### 2026-10-10 刷題恢復（本機發布候選）

- 使用者已確認：沉浸式刷題、懸浮三來源／返回、原樹狀側欄、共用題私人進度、加入共用集位於底部封存旁、搜尋完整檢視唯讀。
- R01–R16 已完成：三來源同原題卡、完整題流／文字大綱、搜尋獨立布局、設定單列五分頁、個人檔案整合、精簡集合管理、成員暱稱回傳。
- 本轮刷題／搜尋手動載入更多，失敗可重試；防連點、去重、來源切換取消舊請求、封存／刪題後 offset 重新掃描合併。返回條件與閱讀位置含完整網址識別。
- 新增 0004 collection_item_progress，完成／封存僅影響目前使用者與 entry；CAS／generation 與撤權檢查，不覆寫作者或其他成員。搜尋／課綱計數／大綱使用本人進度。
- 本機 TypeScript、build／SW、API／搜尋／PWA 12 項、schema 6 項、migration 1 項及 PowerShell 5 發布脚本模擬通過；瀏覽器合成 API 驗證手動續載／重試／連點／封存位移、三來源寫入、搜尋返回、設定與手機操作通過。
- 尚未推送／部署／執行遠端 0004；使用者最後操作見 [刷題修正發布指南](STUDY_UX_RELEASE_2026-10-10.md)。待實機 Pencil／iPhone 驗收；不需新 secret，不重跑已完成 0002／0003，GC 仍關閉。

### 前一階段發布紀錄

**本次發布候選已完成程式與文件複核，納入共用 v2、搜尋範圍、iOS 多選、草稿高度與畫筆匯出修復。2026-10-09 使用者提供的正式 D1 資產引用稽核七項皆為 0。提交／推送以 Git 紀錄為準；自動部署成功、正式 R2 掃描與實機驗收須依 [本次發布指南](SHARING_RELEASE_RUNBOOK.md) 確认。**

### 2026-10-09 最終複核

- 複核範圍與結論：[RELEASE_AUDIT_2026-10-09.md](RELEASE_AUDIT_2026-10-09.md)。包含原未推送提交 `2f44fe2` 及後續搜尋／Placement／SQL 稽核／畫笔與匯出等工作樹差異。
- iOS 檔案 input 改為 multiple，支援一次多選及繼續加入；保留原生 input、縮圖預覽與右上角個別刪除。
- 草稿收合僅隱藏畫面，不保存 0；展開保留原自訂高度。調整高度使用最近 draw data 並保存 baseWidth，保留待存筆跡及跨寬度比例。原先已存為 0 的舊資料無法推知先前高度，展開採預設值。
- 原既存 DrawCanvas／exportImage／strokeOptions 修改已稽核並納入：繪圖與匯出共用同一筆寬／透明度／平滑參數。
- TypeScript、分享／搜尋／離線／PWA 共 13 項測試、SQLite 6 項測試通過；production build、SW 41 個 hash 匹配資產、Worker dry-run（44 個靜態檔）通過。
- 新增 `tests/upload-scratchpad.browser.mjs`：無頭 Edge＋production build＋合成 API，iPhone UA 一次多選／追加／預覽／刪除；非預設高度反覆收合、1024px → 390px 換算、儲存高度後重新整理及筆跡保留。Python Playwright 未安裝，使用內建 Node Playwright 與已安裝 Edge，沒有變更專案依賴。可於已安裝 Playwright 的環境執行 `PLAYWRIGHT_CHANNEL=msedge node --test tests/upload-scratchpad.browser.mjs`（PowerShell 先以 `$env:PLAYWRIGHT_CHANNEL='msedge'` 設定）。
- 發布指南四段 PowerShell 語法解析通過；schema 查詢於隔離本機 D1 回傳 `sharing_tables=21`、`item_seq_columns=3`。正式 schema 的完整確認留在指南第 2 步。
- 最新正式 D1 引用稽核已通過，不再重跑 0002；搜尋與本次 UI 修復沒有新 migration／secret。推送後先確認自動部署 commit，再回填晚到上傳、重跑七項稽核、管理端掃描 R2 及實機驗收。
- 保留 Gemini `placement.region="gcp:asia-east1"`；沒有遠端 D1／R2 寫入、圖片刪除或 Time Travel restore；實體資產 GC 關閉。使用者提供的最新歷史 bookmark 已保存於發布指南。
- 既有 iPad／手機刻意設計不需修改，本次未變更。

### 歷史驗證紀錄（遠端狀態以本頁最新狀態為準）

以下是 2026-10-04 及早期發布前的紀錄，不是本次要重新執行的 migration 指令。

2026-10-04 再次以 Wrangler 唯讀查詢遠端 D1：`d1_migrations`、`collections`、`owner_transfers`、`assets` 全無，0002 仍未套用。這不是 migration 已執行的證據；正式套用前仍須重查狀態與取得當時的新 Time Travel bookmark。

使用者於 2026-10-04 提供遠端唯讀查詢：`d1_migrations`、`collections`、`publication_revisions`、`shared_layers`、`saved_refs`、`saved_snapshots` 均未出現在指定表清單；`items` 沒有目前 0002 第一個新增的 `content_seq`／`draw_seq`／`notes_seq`；`d1_migrations` 查詢回報 no such table。第二次查詢 `assets`、`asset_refs`、`collection_items`、`collection_grants`、`collection_events`、`subscriptions`、`personal_workspaces`、`public_profiles`、`invitations`、`grant_holders` 也全部無結果。據此目前版本 0002 尚未套用，亦未發現該版本的局部表。先前 `0001` 是透過 `d1 execute --file` 手動執行。`wrangler.jsonc` 已指定 `worker/migrations` 為 migration 目錄。遠端純 schema 匯出因既有 FTS5 virtual table 失敗，沒有產生匯出檔；已取得 Time Travel bookmark `0000021f-00000000-000050f9-fa9c3a93642280e67a8e90228c114ab5`。套用前改以唯讀 `sqlite_master` 查出遠端 DDL，核對與 0002 的相容性。

已讀取 `.wrangler/remote-schema-before-sharing.json` 的遠端 DDL（12 個物件，含 `items_fts`）；將其重建於本機 SQLite，依序執行已手動套用過的 `0001` 與待套用的 `0002`，並以舊題目資料測試：migration 成功、舊圖片鍵回填至 `assets`／`asset_refs`、`draw_seq` 從 `vector_clock` 回填、`foreign_key_check` 無違規、`integrity_check` 為 `ok`。這是 schema 與合成資料驗證，尚未驗證遠端真實資料及 R2 物件。

另以 Wrangler 本機 D1 的獨立 `--persist-to` 目錄重建遠端 DDL 並放入舊題目，執行 `d1 migrations apply --local`：`0001` 與 `0002` 均成功記錄；驗證 `d1_migrations=2`、`assets=1`、`asset_refs=1`、舊題 `draw_seq=3`。本機 Wrangler 寫入使用者設定目錄的 debug log 曾遇 sandbox `EPERM`，但命令退出碼為 0、D1 結果成功。

切換時間差處理：舊版 Worker 在 0002 套用後、前端／Worker 新版部署前仍可能上傳題目，只寫入 `items`。新增 `scripts/sharing-backfill-late-uploads.sql` 供新版 Worker 上線後執行；它補齊圖片資產和引用，回報 `missing_source_links`，可重複執行。本機 Wrangler D1 以模擬晚到上傳測試兩次，兩次皆回報 0 缺漏。

遠端唯讀資料品質檢查：`items=219`、空 `image_url=0`、相異圖片鍵 `=219`。因此在既有資料未變動的前提下，0002 回填應產生 219 筆 `assets` 和 219 筆 `asset_refs`；正式套用後要以實際數值核對。尚未驗證每個 R2 物件是否存在。

推送前再次檢查：TypeScript、分享 API 整合測試、schema 測試 5/5、Vite 建置、PWA 發版測試 4/4、`git diff --check` 均通過。`wrangler deploy --dry-run` 成功打包 Worker 與 42 個靜態檔。遠端 Worker 已有 `ADMIN_EMAILS`、`BETTER_AUTH_SECRET`、`GEMINI_API_KEY`、`GOOGLE_CLIENT_SECRET` 等 secret 名稱；`GOOGLE_CLIENT_ID` 在 `wrangler.jsonc`。secret list 不驗證值本身。因推送會觸發自動部署，0002 尚未遠端套用前不能直接推送新 Worker。

## 已實作

### 2026-10-04 搜尋範圍補齊

- 沿用 D1／加權 LIKE 與原題 OCR FTS5，沒有新增 AI Search 設定、付費服務或 migration；仍依賴原分享功能的 0002 schema。
- `/search` 支援「我的題庫」（原題＋已存）、「共用與訂閱」、「公開探索」。共用範圍含建立、已接受觀看／貢獻授權、有效 link holder/cookie、可讀訂閱；「只看訂閱」包含訂閱前舊題。訂閱不能繞過撤權或暫停。
- mine 支援原題／已存、狀態、個人課綱含子單元、完整標籤及來源集合；shared/public 僅標準課綱及來源標籤。集合頁、訂閱中心、題庫與探索新增搜尋入口；Navbar 搜尋保留集合／訂閱／saved 情境。
- 已存搜尋 current snapshot、已取得文字參考層與自己的工作區，不依賴 live 來源；撤權、暫停及刪原題後仍可搜尋。來源更新不修改已存搜尋，須本人明確更新。
- 共用搜尋僅當代有效 shared notes 並逐項依權限篩選；公開排除私人筆記、OCR、私人課綱和所有 shared notes。圖片仍走原授權 API。結果保留來源集合，已存题有「開啟我的版本」；共用頁綠色識別。
- 修復 FTS alias MATCH 失效、無 FTS 列的原題被漏掉、重複索引與舊 metadata 造成錯誤命中；原題 mutation batch 合併 FTS 列並保留最新 OCR。LIKE 的百分比、底線及反斜線按字面搜尋。
- 修復 shared layer 顯示條件：開放 notes／隱藏 ink 時仍可閱讀 notes，回傳 ink 為 null，與搜尋權限一致。
- 訪客本機搜尋不顯示有 cloudOwnerId 或 cloudId 的帳號草稿；切換帳號／scope 隱藏舊結果，取消舊請求；分頁每次重新驗權且去重。
- 驗證：新增 `tests/search.test.mjs` 的 5 組 Miniflare＋D1 案例，含短中文／FTS phrase、無索引原題、舊重複列、分頁、分類、wildcard、邀請、訂閱舊題、匿名 cookie、過期／多重 grant、共享欄位、generation、來源貢獻者撤權、圖片非 ready／移出及已存版本保留；`tests/search-offline.test.mjs` 驗證 guest 帳號隔離。
- 瀏覽器：以獨立 localhost 合成 API 資料驗證實際 production build 的個人／共用／公開卡片、來源標示、已存入口、切換及分頁；390px 下 document 寬度與 scrollWidth 均為 390。合成資料 UI 驗證不等同真實帳號或實體 iPhone／iPad 驗收。
- 本次修改尚未推送／部署；工作樹另有既存 DrawCanvas／exportImage／strokeOptions 修改，沒有覆寫或併入本次搜尋工作。
- 最終驗證：TypeScript 通過；Vite production build／SW 41 個匹配資產通過；搜尋、guest 隔離、分享與 PWA 合計 13 項測試全部通過；Worker dry-run 打包成功（44 個靜態檔）。Wrangler 首次因無權存取使用者設定／log 目錄失敗，改以該命令程序的 XDG_CONFIG_HOME／WRANGLER_LOG_PATH 指向 workspace 的 .wrangler 後通過，未修改系統環境或登入設定。

### 既有分享功能

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

1. **正式部署與引用確認**：使用者正式 D1 七項資產引用稽核已全部為 0；依本次指南核對 schema，不重跑 0002。等待自動部署成功後，執行晚到上傳回填並確認 `missing_source_links=0`，再重新稽核。
2. **權限與資料完整性覆蓋**：已有 viewer／link／匿名、過期 grant、接手邀請、私人分類、圖片撤權與來源刪除案例；仍需重新加入 generation、多次 snapshot 刷新、兩裝置同欄位競態、失效集合搜尋及多重 grant 撤一保另一的完整矩陣。
3. **UI 完成度**：本機 production build 合成資料瀏覽器回歸已完成搜尋、多選圖片及高度收合案例；仍需正式帳號、實體 iPhone Chrome／iPad Safari／PWA 驗收與共用筆跡書寫。
4. **生命週期**：owner 轉交已完成；帳號刪除時停止授權與來源清理、受理報告後的實際處置、公開搜尋索引／標準課綱版本化仍待實作。現階段公開搜尋使用即時 SQL `LIKE`，未建 FTS；目前產品沒有刪除帳號入口。
5. **資產維護**：D1 引用與雙向 R2 物件存在性唯讀稽核已備妥；仍需於正式環境執行並處理異常、staging 隔離清單、寬限、可重試工作租約及正式 GC gate。不得在這些完成前啟用自動實體刪除。
6. **實機／回歸**：實體 iPhone Chrome、iPad Safari/PWA 的圖片上傳、共用圖層書寫和來源更新；既有 guest 上傳、單題公開連結、CSS hash／PWA 404；Worker 與前端部署後健康檢查。

## 發布順序

本次：提交並推送 → 確認自動部署 commit／健康檢查 → 唯讀 schema 核對 → 晚到上傳回填 `missing_source_links=0` → 七項 D1 稽核 → 管理端 D1/R2 全量掃描 → 正式帳號／實機驗收。本環境不重跑 0002；資產 GC 保持關閉。

## 2026-10-10 導覽與題卡修正

- 本機完成使用者 23 項 UI/UX 修正及首頁無更新隱藏要求；逐項契約與剩餘驗收見 [UI_UX_POLISH_2026-10-10.md](./UI_UX_POLISH_2026-10-10.md)。
- TypeScript、production build、PWA 建置及 API/PWA 12 項測試通過。
- 合成資料瀏覽器回歸通過：五格等寬、刷題 tab 開關側欄、樹狀圖狀態、慢速圖片列高度、單題分享、公開訂閱分流、限定集合取消訂閱、筆跡按鈕選取色、個人檔案分群及統一登入提示。
- 本次無新 schema／secret／binding；尚未推送或部署。正式帳號與實體 iPhone／iPad 驗收仍待發布後進行。

## 2026-10-11 D1 瀏覽查詢與側欄範圍

- 空白 browse 移除 OCR FTS、文字比對與相關度排序；保留來源、篩選、當前權限與存入 snapshot 語意。
- 未選科目不載入大綱；選擇後只載入該科目，分類樹保留，同科目切換單元沿用大綱。
- 隱藏刷題側欄搜尋，改為帶入目前來源、共用集與篩選的「前往搜尋」。
- 本地 219 題：空白上傳首頁掃描 5,039 → 31 列，metadata 頁 5,039 → 51 列。完整資料 hydration 另計，正式環境仍待部署後觀察。
- 本次無 migration／secret／binding；其他優化及驗收契約見 [D1_OPTIMIZATION_PLAN_2026-10-11.md](./D1_OPTIMIZATION_PLAN_2026-10-11.md)。
- 驗證通過：TypeScript、production build／SW、搜尋與成本／guest／PWA 合計 13 項測試；桌面與手機範圍導覽、既有閱讀頁完整合成資料瀏覽器回歸。尚未推送，正式帳號與實機效能未驗證。

## 2026-10-11 作業同步提示與預設書寫區

- 共用中／我存入的筆跡與文字同步狀態統一放在「支援即時打字」原位置，不再於筆記下方重複顯示。
- 等待、同步中、離線等待不顯示重試；只有失敗顯示灰字底線「重試同步」。重試開始立即隱藏，衝突仍保留核對雲端與下載本機作業流程。
- 尚未同步的本機草稿在重開題卡時自動接續同步，避免隱藏 pending 重試後草稿停滯。
- 三個來源的未使用書寫區沿用 `DEFAULT_CALC_SPACE_HEIGHT`（目前 100），移除共用／存入的 400 固定值；空白工作區不預設 800 寬座標，避免手機顯示高度額外縮放。已保存的高度與座標不重寫。
- 驗證：`tests/work-sync-status.browser.py` 以合成 API 檢查桌面／手機的等待、慢速同步、503 失敗、重試、離線／恢復、409 衝突、草稿重播、三來源預設高度一致及既有高度保留；TypeScript、production build／SW、PWA 發版測試。無 migration。
