# 共用／訂閱實作進度與待辦

更新：2026-10-13。共用規格來源：[SHARING_SPEC.md](./SHARING_SPEC.md)；最新 UI 修正：[UI_UX_STUDY_RESTORE_2026-10-10.md](./UI_UX_STUDY_RESTORE_2026-10-10.md)。本文件只記錄實際完成、驗證邊界和待辦。

## 目前狀態

### 2026-10-13 探索／延伸題卡切頁後保留空白

- 已重現：同一 img 已載入並保留掛載，訂閱情境變更重新讀取明細時，effect 把 imageReady 清為 false。圖片沒有換節點／網址，不會再次觸發 load；data-reader-loading 持續為 true，虛擬列表的預留高度便一直套在已完成題卡上。
- 修正為以 collection／entry／account／retry 的題圖識別保存載入狀態，明細讀取不清除。ref 也檢查 complete 與 naturalWidth，涵蓋快取題圖在 effect 前完成；沿用圖片錯誤重試與授權重驗流程。
- 新增 `tests/reader-cached-image-height.browser.mjs`：舊碼於保留題圖、切換訂閱情境的 fixture 失敗（loading=true）；修正後通過。直接使用 HTTP 圖片快取，390／1280px 各五輪探索／延伸／關於的 SPA 切換，檢查圖片已完成、題卡底部空白及快取重用；不使用會關閉 HTTP 快取的 route 攔截。
- TypeScript、正式建置／SW、PWA 通過；只調整題圖載入狀態，無 migration、secret 或 binding。實體 iPad 的最終驗收仍由使用者確認。

### 2026-10-13 學習計畫進度小組件（已實作，本地 migration 完成）

- 最新版面：平板以上第二頁三欄等分待辦、倒數／公開探索、學習計畫，總覽回到兩頁；手機計畫仍獨立，共五頁。隱藏工具時其餘欄等分；舊寬版 progress 網址／記憶轉至 tools，保留手機記憶與掛載資料。倒數名稱／日期於窄欄自然換行，避免被壓成直排。只改前端，無新 migration。
- 三欄驗證通過：390／768／1024／1280px 的等寬／等高、舊 progress 記憶、原生滑頁不計次、旋轉、隱藏待辦／計畫的所有組合、切頁不新增資料請求、無橫向溢出；TypeScript、建置與 PWA 通過。

- 後續 UI 修正：移除首頁左右加減提示；學習計畫／倒數拖曳把手由 44px 縮為 32px、間距由 8px 縮為 4px，拖曳中的整列放大 2% 並顯示淡陰影。390／1280px 已確認把手尺寸、拖曳放大／恢復、排序與鍵盤操作、無橫向溢出；TypeScript、建置與 PWA 通過。只調整前端，不增加 migration。

- 手機獨立 Dashboard 滑頁，平板以上整合在第二頁；同一組件卡多條進度。依最後確認，左 25% 減一／中間 50% 無反應／右 25% 加一，無可見加減按鈕；滑頁與捲動不誤計次。設定新建、改名稱／目標／單位、把手排序、移除；完成留原位，不含批次輸入或截止日期。
- 目標降低保留實際進度、條長最多 100%；章節為主要使用情境。登入沿用帳號隔離、40 秒快取及離線；計次使用唯一收據和原子 batch，重送一次、不同裝置操作可累加。遺失回應後先核對已接收操作；metadata／順序衝突可選本機或雲端。
- 0012 新增獨立三表兩索引，不重建原有小組件表，不復用 0011。本地備份後套用並完整檢查；備份 `.wrangler/local-db-backups/2026-10-13T04-25-49-141Z`。正式尚未執行；缺表時新模組回可重試 503 並保留草稿，既有題庫／小組件不受阻。
- TypeScript、建置／PWA、API、發布腳本及 390／1280px 訪客／登入瀏覽器通過；含原生滑頁不計次、1:2:1、離線重整、遺失回應去重、設定管理／排序、metadata 衝突採用雲端、隱藏面板與帳號隔離。原有首頁小組件／滑頁回歸通過；正式跨裝置與實體裝置待發布後確認。
- 完整規格：[STUDY_PROGRESS_WIDGET_PLAN_2026-10-13.md](./STUDY_PROGRESS_WIDGET_PLAN_2026-10-13.md)。正式 0012 指令與預期指標：[STUDY_PROGRESS_RELEASE_2026-10-13.md](./STUDY_PROGRESS_RELEASE_2026-10-13.md)。


### 2026-10-13 修正範圍：倒數設定頁拖曳排序

- 待辦拖曳提交 1759a02 已從 main 移除，完整備份於本地分支 codex/backup-todo-order-1759a02；保留原父提交 fc8eeb9 的倒數間距修改。
- 0011_todo_order.sql：正式環境未執行、目前已撤回，禁止依舊訊息套用。本地曾暫套用，已備份後移除 todo_order；目前欄位不存在。恢復前備份：.wrangler/local-db-backups/2026-10-13-before-reverting-todo-order-1791849306。21 題與 15 個小組件項目保留，外鍵與 local schema 檢查通過。
- 現在只在倒數設定頁提供右側把手，滑鼠／觸控／筆拖曳、鍵盤、取消、設定頁捲動；首頁倒數維持唯讀，待辦恢復原功能。
- 沿用 0010 countdown_order、帳號隔離、離線佇列及排序衝突；不新增 migration。0011 編號曾供本地測試，不重用於另一項變更。
- 驗證通過：390／1280px、訪客／登入的倒數滑鼠／觸控拖曳與取消、鍵盤及原有小組件回歸；40 個事件的設定頁邊緣捲動、pointercancel、重整順序；TypeScript、API 與建置／PWA。


### 2026-10-13 倒數自訂順序與滑頁間距

- 首頁前三個倒數放大、其餘固定三欄小卡呈現全部事件（日期留在 title），大卡日期放名稱右側，移除更多倒數對話框。設定提供上移／下移，學測預設改灰色底線字。跨裝置排序使用 0010 preferences JSON 欄位，沿用待送、衝突與帳號隔離。
- Dashboard 每頁加回邊緣留白，相鄰頁卡片間自然形成 16／32px 間距；停妥對齊及原生滑動／記憶不變。瀏覽器與原有小組件回歸通過。
- 本地 0010 已套用並檢查，正式 D1 唯讀檢查因 7403 未完成，未寫入；新增欄位由使用者手動套用。已補舊 schema 相容，排序草稿待送不阻擋待辦／顯示開關，完成 migration 後重試即可。指令與資料規則：[COUNTDOWN_ORDER_2026-10-13.md](./COUNTDOWN_ORDER_2026-10-13.md)。

### 2026-10-13 題圖重驗快取與探索並行載入

- 修正圖片端點與 middleware 的 no-store；上傳／存入／集合／新舊單題分享統一授權後 conditional R2 GET，使用 private, no-cache＋ETag。每次仍驗當前權限、可用資產與分享期限；錯誤與其他 JSON 仍 no-store，不寫入公共或 SW 快取。
- 探索／延伸圖片不再等待參考筆跡；明細完成保留原 img，重試可重建，明細重驗失權時移除圖片。原題圖片解析 assets.storage_key 並拒絕不可用資產。
- 真實瀏覽器合成圖三次載入 200／304／304，圖片 body bytes 68／0／0，撤下後拒絕舊圖。D1/R2 驗證涵蓋撤權、帳號、下架、移除、隔離、過期、更新、存入保留；390／1280px 並行／重試／失權及原有分享與共用同步回歸通過。
- 不新增 migration、secret、binding。詳細範圍與成效邊界：[IMAGE_REVALIDATION_2026-10-13.md](./IMAGE_REVALIDATION_2026-10-13.md)。仍有權限、明細及筆跡請求，不宣稱省去 D1；實體裝置與正式速度待確認。

### 2026-10-12 可左右滑動的響應式總覽

- 保持心流屬於第一頁，切頁時一起滑走，其他頁使用完整高度（依後續確認修正，取消固定標語）。768px 起兩頁：複習進度、日常工具；手機四頁：複習重點、各科進度、待辦、倒數／探索。統計橫排三格並加入對應配色淡漸層，最需複習單元改為 Top 5；保留寬畫面的科目／單元 2:1 欄位比例。
- 原生橫向捲動與 Scroll Snap，不加側邊箭頭；下方只顯示面板名稱，移除重複的數字頁數與外框。面板左右與標語對齊；全站頂部／手機底部導覽維持。
- 記住每帳號及寬／窄版最後面板；URL hash replace 不堆疊返回紀錄。隱藏待辦時不留空頁。切頁／旋轉保留待辦文字草稿與內部捲動，不重抓資料；有更新才顯示共用／訂閱動態，入口開啟內建對話框。
- 詳細規格與驗證：[DASHBOARD_PAGER_2026-10-12.md](./DASHBOARD_PAGER_2026-10-12.md)。不新增 migration、secret 或 binding；正式 D1 仍依首頁小組件既有 0009 要求。實體裝置滑動待發布後確認。

### 2026-10-12 首頁小組件版面與本地 migration

- 待辦／倒數／公開探索整組移至總覽底部，公開探索從動態組件拆出，放在倒數下方。桌面左待辦／右上下兩卡，整欄等高，右欄倒數與探索約 2:1；手機依序排列。倒數外框恢復灰白，每個事件右緣沿用心流卡片的淡漸層。
- 待辦列由約 48px 縮為 36px。移除新增後強制捲到底部，改以 ResizeObserver 計算歷史所需緩衝，不留不必要的空白尾部；保留每日歷史移動與明確的查看歷史操作。
- 本地 0009 已完成：2 表、2 索引、10／5 欄，完整 schema 與外鍵檢查通過，原有 21 題保留；備份 `.wrangler/local-db-backups/2026-10-12T14-11-19-183Z`。此次 UI 修正不新增正式 migration。
- TypeScript、正式建置／SW、PWA，以及 390px／1280px、訪客／登入的版面、新增捲動、唯讀倒數、設定、離線及衝突回歸通過。實體裝置仍待使用者確認。

### 2026-10-12 首頁待辦、倒數與接續刷題

- 依確認規則：首頁待辦直接新增／編輯／勾選，倒數完全唯讀，前五個之外開啟唯讀清單；管理與顯示開關統一放設定 → 個人檔案，從組件三點菜單連入，不新增全域首頁設定入口。
- 今日已完成留原位，隔日移至上方具捲動緩衝的歷史；含當日保留七天，未完成不過期。倒數提供 116 學測日期預設，過期顯示結束、不自動推算新年度。
- 新增私有小組件資料服務、40 秒快取、離線待送恢復、按欄位合併與衝突確認；不使題庫快取失效，不輪詢 D1。新增 0009 兩個表／兩個索引，無新增 secret 或 binding。
- 接續刷題記錄此裝置目前真正顯示的題目與範圍，入口整合於保持心流卡片。
- 發布指令、資料規則與驗證邊界：[HOME_WIDGETS_2026-10-12.md](./HOME_WIDGETS_2026-10-12.md)。正式 DB／推送未執行，仍需先確認上一批 0008 與本次 0009，再發布。

### 2026-10-12 作業自動合併與版本選擇

- 上傳／存入／共用統一同步核心；草稿新增共同版本，保留兩個欄位各自的 CAS。新增筆畫含 UUID，擦除片段各有獨立 ID；相同 ID 去重。409 時才讀雲端，不增加正常存檔讀取；存入／共用衝突讀取略過他人的參考筆跡下載。
- 安全的筆畫追加與不重疊文字自動合併；擦除／清空／座標修改與其他修改交錯、重疊文字或缺少舊版本時，自動彈出兩份作業預覽，選擇保留雲端或本機。選前重讀雲端，內容變更須再次確認；先備份再採用，不能靜默覆蓋新作業。
- 等待進行中的筆畫／組字完成才合併，保留後續待送編輯；文字保留焦點／游標。合併後重設可安全保留的復原紀錄，保留雲端新增內容；採用雲端重建編輯器與清除可重播草稿。自動重試有上限，權限或作業對象變更不當成普通版本衝突覆蓋。
- 驗證記錄與限制：[WORK_AUTO_MERGE_2026-10-12.md](./WORK_AUTO_MERGE_2026-10-12.md)。23 項同步單元測試、桌面／手機尺寸三種來源的實際合併與版本選擇、原有採用雲端與草稿還原回歸、共用來源後端權限、TypeScript、正式建置／SW、PWA 已驗證；實體裝置尚待驗收。
- 本次不新增 migration。先前內文複製的 0008 如尚未套用，仍需依其發布指南完成後才一起部署。

### 2026-10-12 存入／共用題複製完整內文

- 根因：書寫題卡串接來源／分類／作者作為複製內容，搜尋詳細預覽只複製標題；均改由 workService 統一呼叫對應文字端點，沿用同步建立 ClipboardItem 的非同步剪貼簿流程。
- 共用文字端點重用集合觀看權與 liveEntry；存入文字端點只讀本人目前版本，檢查 ready 資產與已存引用。來源撤權／移除／刪除不刪除已下載內文。空內文提示無文字，不代用資訊或個人筆記。
- 0008 新增 saved_snapshots.source_text；存入及明確更新來源時於同一 batch 保存完整 OCR。一般題卡回應不傳完整內文，只在複製時取得。舊版本僅在圖片與 content_seq 吻合時回填；無法還原者維持空內文，題圖與訂正保留。
- 驗證：390px／1280px、三種來源、刷題／搜尋詳細共 12 瀏覽器情境檢查內文、換行、懶讀取與空內容防護；Miniflare/D1 涵蓋長 OCR、他人 FTS 資料隔離、私人集合與個人存入權限、更新／撤權／刪除及隔離資產。原有分享測試、TypeScript、正式建置／SW、PWA 通過；發布腳本測試涵蓋 CheckOnly、bookmark、重跑與失敗停止，未操作正式 DB。
- 發布前正式 D1 需套用 0008；指令與舊內文限制見 [發布指南](./SAVED_QUESTION_TEXT_RELEASE_2026-10-12.md)。本地 init-local-db 已納入 0008。實體 Safari 剪貼簿尚待驗收。

### 2026-10-12 總覽進入刷題的來源與分類篩選

- 根因：總覽統計合併上傳題與存入題，但科目／單元入口沿用舊 `/study/:subject/:topic` 路徑，預設我上傳，沒有未訂正條件；「進入刷題」還固定指向數學。未分類入口只修改已不再控制新版側欄的全域狀態。
- 新增 dashboardStudyService 統一建立明確刷題網址。科目／單元點擊時透過既有個人題庫瀏覽 API，跨上傳與存入查找最新的未訂正題，帶來源、科目、單元（若點單元）、未訂正與當題 focus；採用存入題自己的 personal_topic_id，不使用作者原分類。網址不混入之前的搜尋、標籤或共用集範圍。
- 查找使用 `limit=1`、`metadata_only=1`、空查詢的瀏覽模式，不取得整批筆跡或題圖，沿用既有帳號隔離快取。訪客由本機題庫判斷，不送個人搜尋 API。查找失敗留在總覽可重試；沒有未訂正題仍進入明確未訂正範圍，不設無效 focus。
- 一般進入刷題不再固定數學。未分類入口帶真正的未分類範圍與來源，保留分類用途的全部狀態。存入題來源更新通知帶當題分類、來源與目前狀態，已訂正題仍可開啟；課綱載入只更新連結，不額外重跑動態請求。
- 驗證：390px／1280px 合成 API 回歸涵蓋科目／單元的存入與上傳首題、忽略較新已訂正題與其他科目、清除舊篩選、一般刷題入口、已訂正存入題通知、空範圍、查找失敗，以及訪客本機科目／單元入口；TypeScript、正式建置／SW、PWA 4/4 與既有瀏覽查詢成本測試通過。無 migration，實體裝置尚待驗收。

### 2026-10-11 採用雲端作業後重設當題編輯狀態

- 明確採用雲端時更新當題筆跡、筆記、同步版本與推導區高度；專用 editorVersion 重建互動畫布與筆記輸入區，清除舊筆畫、橡皮擦、復原／重作、進行中的手勢與尺寸狀態。只重設當題編輯器，不需整頁重新整理或額外 GET。
- 上傳／存入／共用作業均先成功保存本機備份，再移除可重播草稿、取消待送計時器並清除待送欄位；備份不會自動恢復或重送。刪除草稿失敗時不替換記憶體、不宣稱成功；儲存請求執行中拒絕採用，避免舊回應改寫新版本。
- 上傳作業另外等待舊 IndexedDB 佇列成功移轉與清理，避免採用後立即重新整理又還原已捨棄的舊作業；清理失敗維持保護狀態。
- 回歸：舊正式建置可重現採用缺少尺寸資料的雲端筆跡後，推導區仍保留本機高度。`tests/cloud-adoption.browser.py` 於 390px／1280px、三種來源檢查雲端筆記與預設高度、清除可重播草稿、保留備份，再延伸／書寫／復原／修改筆記／重新整理，確認內容和 CAS 基準一致。
- 驗證：16 項 ownedWorkController 測試、六個瀏覽器採用雲端情境、原有桌面／手機作業還原回歸、TypeScript、正式建置與 PWA 4/4 通過。瀏覽器使用合成 API，仍待實體裝置驗收。無 migration。

### 2026-10-11 恢復完成訂正後的平滑滾動

- 根因：舊 StudyView 的下一題使用 `behavior: 'smooth'`，新版 QuestionStream 的直接下一題與跨頁續載下一題省略該參數，使用預設立即定位。
- 兩條下一題路徑恢復平滑滾動；我上傳、我存入、共用中的懸浮完成訂正／已訂正下一題及 Ctrl／Cmd + Enter 使用同一路徑。
- 回歸驗證：舊正式建置可重現 0 直接跳至 924px、沒有中間動畫影格。新增 `tests/study-smooth-advance.browser.py` 記錄實際 requestAnimationFrame 捲動位置，檢查中間位置、連續性與下一題對齊，並確認已訂正下一題不重送狀態寫入。
- 驗證：390px／1280px、三種來源、已載入／需續載下一批，共 12 情境、24 次完成／快捷鍵捲動通過；TypeScript、正式建置及 PWA 4/4 通過。使用合成 API，未操作真實帳號，仍需實體 iPhone／iPad 手勢驗收。無新 migration。

### 2026-10-11 我上傳作業誤報衝突與草稿還原

- 已確認根因：ProblemCard 每次畫筆變更增加 vectorSeq，但 debounce 合併多次變更後送出，違反後端 draw_seq 必須連續的 CAS；筆記多個請求可同時使用舊 notes_seq。重新載入也直接採用雲端，未讀取 IndexedDB 的已保留衝突草稿。
- 新增 ownedWorkController／ownedWorkService 與 useOwnedWork：每個帳號／題目單一儲存佇列，以伺服器確認的 draw_seq／notes_seq 推進版本，筆跡與筆記各自保留基準。未收到確認的較新變更不會被較早回應清除；切換帳號後的舊回應不可改寫目前帳號或清除舊草稿。
- 每次變更立即寫入帳號隔離的本機草稿，再 debounce 網路儲存。重新整理／題卡重新掛載會還原；舊版 syncQueue 的筆跡／筆記成功移轉後才移除相同紀錄的對應欄位，狀態／標籤等其他佇列內容保留。背景重播不再與題卡競爭寫入筆跡／筆記。訪客筆跡及筆記以 IndexedDB 單一交易更新，避免欄位互相覆蓋。
- 網路回應中斷保留已送出的內容與版本；重試先核對是否已成功提交，確認一致後繼續儲存新內容。正常存檔不新增 GET、不新增輪詢；真實版本差異仍拒絕自動覆蓋。
- 同步狀態沿用題卡「支援即時打字」位置。真正衝突顯示本機內容、下載本機作業與核對雲端版本；使用者可明確採用雲端／以本機更新雲端，先成功保存兩份內容備份，後者仍通過 CAS。儲存失敗不顯示草稿已保存的承諾，並納入離頁／登出保護。頭像中的未同步作業列表也涵蓋上傳題與舊版佇列。
- 驗證：12 項儲存控制器案例涵蓋連續筆畫、慢速請求、草稿重開、真衝突、回應中斷、舊版恢復、儲存額度失敗與帳號隔離；8 項共用來源的實際 Worker／D1 子測試及 4 項 PWA 測試通過（共 25 項含主測試）。桌面 1280px／手機 390px production build 合成 API 驗證筆畫合併、存檔後復原、慢速筆記、即時重新整理、衝突選擇與舊 IndexedDB 草稿恢復。TypeScript 與 production build／SW 通過。無新 migration。
- 驗證邊界：未讀取使用者實際裝置的 IndexedDB，不能承諾已清除瀏覽器資料或未成功寫入的內容可找回；新版本會嘗試恢復仍存在的舊草稿。仍需實體 iPad／iPhone 長時間書寫驗收。
- 額外發現待辦：OfflineSyncManager 訪客題首次轉雲端仍沿用訪客 vector_clock.seq，且 typed_notes 重播缺少 expected_notes_seq；後續須依新雲端題的版本重播並驗證部分成功後重試，本次不宣稱已完成此路徑。

### 2026-10-11 延伸題目存入篩選

- 展開「搜尋與篩選」後可選全部存入狀態／未存入／已存入，與閱讀狀態獨立組合。首頁、續頁及視窗 focus 檢查帶相同 saved 條件；沿用現有後端 saved_refs 篩選，依目前帳號判斷並在分頁前排除。
- saved 納入 URL、帳號隔離的篩選記憶與閱讀快取鍵；切換集合／清除篩選會重設。存入篩選啟用時，返回使用目前 API 結果，避免舊列表把已存入題目帶回「未存入」。
- 存入成功先保留當題與「已存入」操作狀態，避免閱讀位置跳動；下次重新套用或進入篩選時依最新存入狀態列出。無 migration、無新增 API、無輪詢。
- 驗證：實際 API 測未存入／星號組合及不同帳號的存入狀態；桌面／手機合成 API 回歸涵蓋篩選參數、返回、重新整理、清除、外來連結與帳號隔離；TypeScript、production build／SW、10 項 API／偏好／PWA 測試通過。

### 2026-10-11 集合管理清單內部滾動

- 題目管理清單上限 min(24rem,55dvh)，超出時僅清單內部垂直滾動；篩選與「載入更多題目」在清單外，追加分頁不再撐長整頁。
- 清單可用鍵盤聚焦並滾動；捲動邊界不連帶捲動外頁。API、分頁與資料結構不變，無 migration。
- 驗證：桌面／手機合成 API 30→60 題，清單可獨立滾動、分頁後管理區不增高且無橫向溢出；TypeScript、production build／SW 與 4 項 PWA 回歸通過。

### 2026-10-11 移除集合題目後的原題標記

- 原因：membership API 回傳已移除的歷史關聯，題卡未檢查 entry state，將 removed 顯示為仍在共用／公開集合。
- API 僅回傳 included、非個人、未刪除集合關聯；題卡顯示前再次排除 removed／已刪除紀錄，避免舊 API 回應佔用兩個標記欄位。
- 原題、私人訂正及歷史關聯保留；移除單一集合不隱藏其他集合標記，重新加入可恢復。無 migration、無新增輪詢或 D1 查詢。
- 驗證：Miniflare 實際 API 回歸含加入兩個集合、移除、重新加入、全部移除、帳號隔離與原題作業保留；桌面／手機合成 API 瀏覽器回歸確認舊回應過濾與快取期限內移除後返回；TypeScript、production build／SW、PWA hash 回歸通過。部署狀態以 Git 提交／推送紀錄為準。

### 2026-10-11 獨立單題分享 Q01–Q11（本機候選）

- 我上傳／我存入／共用中／探索與延伸題目使用同一分享視窗與 /share/:token。已存題右上新增分享按鈕；只建立本人已同步作業的固定版本。
- 新 public／restricted／link 集合預設 allow_reshare=1；建立／管理提供 switch。既有集合／已存版本保持 0，作者開啟後需明確更新來源才取得授權。來源更新提示包含授權變更。
- questionSharing 集中 capture、當下權限、原子提交與來源 ACL 提示；shareService 統一前端 create/list/revoke。新 links 匿名可讀；不授權來源集合、不自動訂閱、不複製他人的筆跡／筆記。
- independent_shares＋share_asset_refs 保存單題與題圖引用；引用稽核改讀聯集 view。來源撤權／下架／刪除個人版本不取消已建立分享；分享者撤銷／到期停止服務，quarantine 停止資產服務。
- 個人檔案提供分頁分享管理、原題刪除後撤銷與過期清理。實體資產 GC 未啟用；沒有新增 cron／secret。
- 本地 0007 已備份套用，21 題／7 份筆跡／4 份文字筆記前後一致；init-local-db --check ready。備份見專用發布指南。
- 驗證：TypeScript、production build／SW、23 項後端／PWA／SQL 分割回歸、SQLite schema／引用稽核、0007 發布腳本模擬與 390／1280px 瀏覽器回歸。瀏覽器使用合成 API；權限、固定版本、刪除保留、CAS 競態、expiry、asset refs 與舊連結由 Miniflare D1/R2 驗證。
- 2026-10-11 使用者完成正式 D1 0007，唯讀檢查為 1、1、2、1、1、4；套用稽核 missing_share_refs=0，已授權推送。後續：確認 Git CI/CD 自動部署、正式分享功能、真實 OAuth 成功換帳號及實體 iPhone／iPad 驗收。詳細指令：INDEPENDENT_SHARING_RELEASE_2026-10-11.md。


### 2026-10-11 本地 0005／0006 補齊與 Wrangler SQL 解析修正

- 本地 .wrangler/state 原缺少 0005 快取表及 0006 欄位；init-local-db 自動備份後補齊。首次備份：.wrangler/local-db-backups/2026-10-11T05-32-33-960Z。
- Wrangler 4.120.0 的本地 SQL splitter 未辨識 `previous_status=CASE`，將 CASE 的 END 誤當觸發器結尾而回 incomplete input。0006 與 fresh schema 同步調整成 `previous_status = CASE`；SQL 行為不變，正式庫無需重套用。
- 初始化失敗現在同時保留 stdout／stderr 診斷。本機 agent 執行時以 WRANGLER_LOG_PATH 指向專案 .wrangler/local-migration-logs，避開全域日誌寫入限制。
- 真實本地初始化、再次唯讀檢查、Wrangler splitter 回歸、共用原題同步回歸及 TypeScript 通過；schema_version=2、ready=1、source_triggers=2。初始化前後題數21、含筆跡7、含文字筆記4一致。

### 2026-10-11 公開單題閱讀與私人進度分離（本機候選）

- 正式站匿名重現：公開清單／集合清單／圖片 200，單題內容 500。正式 D1 欄位仍需使用者執行檢查；本機套用至 0005 的 schema 已重現同樣 500（缺少 progress_seq）。
- 單題閱讀只在本人貢獻題且具有貢獻權時查原題私人進度；其他讀者只查獲准展示的作業，兩個展示開關皆關時不查原題作業。公開閱讀不再依賴 0006 私人進度欄位。
- 新回歸以未套用 0006 的真實 D1 驗證匿名題圖、展示筆記／筆跡開關及私人集合拒絕存取；完整 schema 的共用原題同步與既有分享回歸仍保留。
- 修正本身無新增 migration；共用書寫與本人原題進度仍須完整 0005、0006，參見 SHARED_SOURCE_SYNC_RELEASE_2026-10-11.md。正式站要部署修正後才有本次讀取改善。

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
- 本機 TypeScript、build／SW、API／搜尋／PWA 12 項、schema 6 項、migration 1 項及 PowerShell 5 發布腳本模擬通過；瀏覽器合成 API 驗證手動續載／重試／連點／封存位移、三來源寫入、搜尋返回、設定與手機操作通過。
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
