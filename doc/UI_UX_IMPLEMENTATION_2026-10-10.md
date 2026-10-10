# UI/UX 重整實作紀錄

規格：UI_UX_REPLAN_2026-10-09.md（2026-10-10 問卷及普通資料物件／函式服務決策）。
狀態：本機實作及驗證完成，未推送、未部署、未操作正式 D1/R2。

## 已完成

- [x] Question／CollectionEntry／QuestionWork 型別；questionService／collectionService／subscriptionService／libraryService／workService 函式介面。不建立帶 fetch/save 的領域 class；保留既有基礎設施 class。
- [x] 五主導覽；手機底部延伸題目取代上傳，頂部保留上傳；Navbar 移除科目與地球入口，刷題才有已載入題目尋找。
- [x] 刷題／搜尋三來源：我上傳／我存入／我共用中。篩選留同頁，第三來源須選可貢獻集合；個人題庫搜尋不混入訂閱或公開探索。
- [x] Enter 才搜尋，空查詢瀏覽最近題目；手機篩選按套用生效、取消不變條件。頁內定位、來源記憶、查詢／篩選／集合及返回題目 anchor＋相對捲動位置。
- [x] 虛擬列表、接近底部載入、原位重試；編輯及封存後保持當前卡，明示重新套用條件。刪除才移除該卡。
- [x] 已存完整題圖、私人筆跡／筆記／分類／狀態；分類中或失敗不隱藏題目。官方分類沿用、自建分類背景 AI、失敗可重試／手動；手動選擇優先。
- [x] 存入成功原卡保留，顯示前往「我存入」；跨集合相同原題提示既有版本或另存。來源更新先預覽、確認時驗權／版本，保留私人訂正及分類。
- [x] 共用書寫只修改本人集合層；私人原題與已存作業隔離。作者參考層可切換，文字按作者展開。共用 generation、筆跡 seq、筆記 seq 驗證獨立。
- [x] 已存／共用作業防抖序列儲存，離開頁面仍續存；依帳號＋作業目標暫存自己的草稿。403/409 不報成功，衝突提供本機匯出及雲端比對；本機儲存失敗有明示及離開確認。
- [x] 延伸題目只選明確訂閱；完整題圖連續瀏覽，工具只有存入／星號／檢舉／分享。星號不建立個人題，取消訂閱不刪星號；訂閱時間／觀看紀錄／名稱排序及名稱搜尋。
- [x] 新題數依有效來源與閱讀紀錄計算；題圖載入成功才回報閱讀。返回不自動插入新題，頁首提示刷新；focus 讀取重驗來源權限，不用列表快取授權。
- [x] 手機選定集合後收合搜尋與排序區，預設優先露出題圖；選集、閱讀、管理仍為不同操作。
- [x] 設定：共用集管理與訂閱中心分開；管理角色／關係／數據、帳號公開署名、預設上傳目的地。只有實際管理者顯示站方稽核入口。
- [x] 共用集名稱／權限／題目管理；刪除、撤權等使用應用內對話框；Switch 文案與開關點擊區分離。
- [x] 候選原題縮圖、科目與子單元／標籤／關鍵字篩選；跨頁跨條件選取、查看全部已選、篩選外計數。選取已載入與全部符合分開，固定 ID，以 50 題一批逐題驗權及回報；停止後續批次不撤銷成功項目，只重試未成功項目。
- [x] 總覽新增訂閱新題、可管理集合及最近五份已存來源更新檢查；探索入口在總覽，公開探索直接列題圖及自己的存入／訂閱標記。
- [x] 舊 /saved、集合單題、/subscriptions、舊搜尋 scope 等連結相容；集合閱讀不混入管理表單；非貢獻者進管理 URL 轉至唯讀集合。
- [x] 帳號切換重建頁面狀態、取消舊請求，筆記草稿不跨帳號重播。已確認的新 seq 不被較舊 GET 回應覆蓋。
- [x] 0003 migration、新舊 schema 一致、可補部分套用的 PowerShell 發布腳本、auto/npx/local Wrangler 選項及發布指南。

## 已確認的程式問題

| 問題 | 本次處理 |
|---|---|
| 集合歸屬標記不出現 | /my/collections/membership 實際回傳以 item ID 為鍵的 map；改正錯用 array 的讀取，按 API 的 100 ID 上限取得所有已載入題目歸屬。 |
| 批次部分失敗提示消失 | 重新載入候選後再保留結果提示；保留失敗 ID，首次署名補填後也同步選取結果。 |
| 已存／共用與原題操作混用 | 分離作業目標與服務路徑，私人 saved workspace 與 shared layers 永不互相回退。 |
| 封存後退回舊狀態或突然消失 | 新題流保留已編輯卡片及新的狀態，使用者明確刷新才重算條件。 |
| 清空分類未立即反映 | null 與 undefined 分開處理，清空分類可正確更新個人狀態。 |
| 返回／慢請求換集混亂 | URL 保存條件，歷史 key 保存題目 anchor，請求取消並檢查帳號／集合上下文。 |
| 筆記已儲存後被舊讀取覆蓋 | 只接受較新的欄位 seq，pending／衝突作業保留；雲端採用須明確確認。 |
| 筆跡有推導區卻在閱讀頁被裁掉 | 唯讀參考層依原座標寬度與推導高度保留展示空間，不改原筆跡。 |
| migration 腳本 npx 無法啟動 | 單元素陣列經 if 賦值降為字串，splat 將 wrangler 拆成逐字參數；明確使用 string[]，預設優先專案 Node CLI，輸出三項 schema 指標；PowerShell 腳本使用 UTF-8 BOM，避免 Windows PowerShell 5.1 誤讀中文造成解析失敗。 |
| migration 首次查詢失敗卻沒有真正錯誤輸出 | 原 --json stdout 收進變數後被通用例外遮蔽；統一擷取 stdout／stderr，失敗顯示原始輸出及退出碼，新增 -CheckOnly 唯讀診斷。發布者其後回報正式查詢與 migration 均成功；先前失敗根因未取得原始輸出，未另外推測。 |

## 驗證證據（2026-10-10）

- TypeScript：node node_modules/typescript/bin/tsc --noEmit，通過。
- Production：vite build＋build-sw.mjs，通過；PWA build c91ab23c3ca10f04，34 個匹配預快取檔案。
- Node：sharing-api／search／sharing-access／pwa-release，12 tests 全部通過。
  - 包含本人／他人權限、純訂閱不能共用書寫、星號非下載及取消訂閱後保留、新題數、最近加入排序、已存標記、來源撤權／刪除後已下載內容與筆記保留。
  - 分類測試故意無 Gemini key，驗證失敗不刪題及個人重試權限；不宣稱已呼叫正式 AI 成功。
- SQLite：sharing-schema 六項＋reader-migration 一項，7 tests 通過；舊資料保留、預設值及 CHECK 限制確認。
- PowerShell：先前六種替身情境未檢查 CLI 參數邊界，漏掉 scalar splat 啟動錯誤；已改為逐參數驗證。npx／local／預設 auto 共 33 個情境，在 PowerShell 7 與 Windows PowerShell 5.1 均通過：未套用／兩種部分套用／已套用／bookmark 失敗／sharing 表缺失／CLI 查詢失敗／JSON success=false／異常計數／第二欄失敗及重試。CLI 替身，零正式查詢；重新注入原錯誤確認測試確實失敗。
- Wrangler 本機啟動：Node＋相同 string[] 參數展開執行 --version，成功回傳 4.120.0；僅檢查 CLI 啟動，未呼叫正式 D1。
- Native Node 程序：reader-release-native.test.ps1 五項，在 PowerShell 7／Windows PowerShell 5.1 均通過。驗證 JSON 錯誤 stdout、stderr 非零退出、非致命 stderr 不破壞 JSON、無效 JSON、唯讀模式恰好一個 schema 查詢且不執行 DDL；PS7 開啟 native error preference 仍可保留診斷。程序使用 fixture，不啟動 Wrangler、不呼叫 Cloudflare。
- Python Playwright＋本機 Edge：桌面與 iPhone 尺寸流程通過。
  - 三來源、歸屬標記、封存不跳卡、私人與共用筆記路徑、離開後儲存、返回集合／筆記／捲動位置。
  - 星號不存入、存入後綠色題流可找回、Switch 文案不切換、跨分類保留選取及僅重試失敗題、應用內刪除確認。
  - 行動五導覽、篩選套用前無請求、匿名一次多選截圖、預覽不刪除、單張刪除。
  - API 替身；service worker 在瀏覽器流程測試中關閉，SW 另由上列 Node 測試驗證。
- git diff --check，通過。既有可選 JS upload-scratchpad browser suite 僅同步路由，未於本次另行執行；上述 Python 流程覆蓋多選與反覆收合。

## 本機提交

- c8b5618 feat: add reader stars and saved classification workflows
- 76f40b0 feat: implement unified question library and subscription UX
- 發布腳本與規格：cad9def；CLI 修正：95624d0／6f24478。部署依 UI_UX_RELEASE_2026-10-10.md 經 main 推送觸發。

## 正式 migration 回報（2026-10-10）

- [x] 發布者執行 apply-reader-ux.ps1 成功，末次 schema 驗證 reader_tables=2、starred_column=1、classification_column=1；兩次 ALTER 均回報 success=true。此紀錄根據使用者貼上的終端輸出，agent 未執行正式 D1 migration。
- 套用前 Time Travel bookmark：00000270-00000000-00005100-373926d9560dac526cecab27062665cc。此值為本次套用前的恢復參考；未執行還原。
- 部署前重新確認 TypeScript、正式建置＋SW（c91ab23c3ca10f04）、12 項 Node API／PWA 測試與 33＋5 項 PowerShell 腳本測試通過。

## 正式部署驗證（2026-10-10 16:00，Asia/Taipei）

- 正式功能版本提交：d6bad75a1e81930dd4928b40d9e57f962d166967；origin/main 已確認指向同一提交。部署結果紀錄另外保存在本機 docs 提交。
- 該提交的 Cloudflare Pages 與 Workers Builds GitHub checks 均 completed／success。
- Worker build：8c0648ea-c86d-4d5f-a4bd-f90533798edf；正式啟用 version 37497037-9535-45dd-8510-7664f9494cea，流量 100%；deployment 6d3e4f9c-1d03-4038-8320-ebc7ef19f922。
- https://redolve.jx06t.com 首頁、sw.js、api/health 均 HTTP 200；health.status=ok。此判定同時使用提交 checks 與 active Worker version，不依賴固定 API version 字串。
- 正式 SW build=c91ab23c3ca10f04；34 個預快取檔案均 HTTP 200、內容與本機建置逐檔 SHA-256 相同。首頁引用 index-C967tQFm.js／index-Cno70ZBu.css 均在清單內且 MIME 正確，無 HTML fallback。
- 唯讀 HTTP／部署紀錄驗證；未新增正式測試題、未操作私人筆記、未重新套用 migration。完整靜態檢查輸出保存在 .wrangler/production-reader-deployment.json（忽略檔）。

## 留給發布者的待辦

- [x] 依 UI_UX_RELEASE_2026-10-10.md 套用 0003，發布者回報 schema 2／1／1。
- [x] 推送 main 觸發自動部署，核對遠端提交及線上資產。
- [x] 確認前端與 Worker 都對應 d6bad75，health 正常；不以舊固定版本字串代替 commit 確認。
- [ ] 正式環境雙帳號：建立者／貢獻者／純訂閱者、邀請／撤權、共用與私人層、下載後來源失效；用少量測試題。
- [ ] 正式 Gemini：自建分類來源存入後分類成功；失敗重試及手動分類優先。既有 gcp:asia-east1 未改，無新增 secret。
- [ ] 實體 iPhone Chrome、iPad／Pencil：一次多選真實截圖、旋轉、收合、觸控與筆輸入、PWA 更新。Edge 裝置模擬不能證明 iOS WebKit／Apple Pencil 行為。

## 範圍與限制

- 題圖保持線上讀取，不新增外部圖片持久離線快取；未同步草稿只含自己的作業。清除瀏覽器資料仍會清除本機草稿。
- 一般來源撤權不刪已合法下載版本；未授權後的讀寫由後端拒絕。已經顯示／下載的內容無法追溯收回。
- 總覽來源更新先檢查最近五份已存題；完整題庫不是每次載入首頁都逐題掃描。尚未增加熱門推薦或 push 通知。
- 原有 viewport 縮放限制、Logo 操作、快捷鍵、貼底導覽設計與筆的操作模式依使用者要求保留；題圖替換／裁切不新增支援。
- 實體資產自動刪除維持關閉；不重跑既有 sharing migration、不更改正式資產。
