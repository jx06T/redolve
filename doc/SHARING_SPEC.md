# Redolve 共用／題目集／訂閱規格 v2.0

更新：2026-10-11。唯一共用語意規格；實作與驗證進度見 [SHARING_IMPLEMENTATION_PROGRESS.md](./SHARING_IMPLEMENTATION_PROGRESS.md)。UI 導覽以最新 UI/UX 修訂為準。

## 2026-10-11 優先修訂：獨立單題分享（覆蓋舊單題集合引擎與 share 契約）

- Q01 MUST：owned／saved／collection 統一 POST share 能力與 /share/:token 檢視。新 token 是固定捕捉版本；持有效連結者可匿名觀看單題，無須來源集合 ACL。
- Q02 MUST：新 public／restricted／link 集合 allow_reshare 預設 1。建立與管理使用同一「允許存入後再分享」switch；private 不代表禁止單題再分享。建立者可關閉。原題提供者仍可分享本人原題。
- Q03 MUST：save／refresh 在同一交易將 co.allow_reshare 記入 saved_snapshots.reshare_allowed。關閉、撤權、下架不回收已獲准版本的再分享權；明確 refresh 取得新的授權值。來源更新預覽必須包含授權差異。
- Q04 MUST：collection 直接分享視為取得當下單題版本，不必先建立 saved_ref；建立時重驗觀看權、來源有效性、allow_reshare。saved 分享只查本人版本的已取得授權，不依當前來源 ACL。
- Q05 MUST：只捕捉 sharer 自己的筆跡／文字，依 allow_ink／allow_notes 分別包含。原題提供者捕捉 canonical items；其他貢獻者捕捉自己的 shared_layer；saved 捕捉 personal_workspace。不得把其他人的可見參考層自動轉成分享內容。
- Q06 MUST：來源入口另查當下 ACL。可讀才回傳集合名稱／id／URL；不可讀只給登入／切換帳號提示，來源失效另顯示狀態。獨立連結不授權整個集合、不自動訂閱、不提供匿名編輯。
- Q07 MUST：independent_shares 保存 immutable metadata／本人作業文字；share_asset_refs 保護題圖資產。asset_reference_inventory = asset_refs UNION ALL share_asset_refs，稽核／未來 GC 需讀此聯集。撤銷刪除 share 並 cascade 引用，不直接刪 R2。
- Q08 MUST：到期／撤銷停止 metadata 及題圖。過期保存資料可由本人清除；實體 GC 維持關閉。quarantined 資產使所有新式分享停止服務；這是內容治理，非一般來源撤權。
- Q09 MUST：分享管理包含原題／已存版本刪除後的連結；設定→個人檔案提供分頁列表、撤銷與過期清理。建立固定分享前先完成本機作業同步，避免靜默分享舊內容。
- Q10 相容：舊 shares token 保留活原題／到期／撤銷契約，不無聲改成固定版本；新分享一律 independent_shares。原集合題連結仍查集合 ACL。既有集合／已存版本 migration 預設 0，不追溯授權；集合作者開啟後，讀者 refresh 才取得新授權。
- Q11 migration：0007_independent_question_shares.sql 依賴 0006；遠端先 migration 再推送。新資料結構與新增 API 無新增 secret。
- 抽象層：questionSharing.ts 集中 target→capture／authorization／固定版本讀取／來源 ACL 投影；shareService.ts 統一前端 API；ShareModal／ShareView 統一 UX。資料仍用 TypeScript 型別＋普通物件，不建立有 fetch/save 的題目 class。

## 2026-10-11 優先修訂：原題作者作業同步（覆蓋舊 C06／C07／個人進度規則）

- S01 MUST：本人原題加入任何共用集後，原題作者的筆跡、文字筆記直接讀寫 items；不得建立第二份可編輯作者作業。多集合使用同一原題作業。
- S02 MUST：所有有效貢獻者互見原題作者作業。一般觀看者分別由 show_shared_ink／show_shared_notes 控制；未加入集合的個人題目與 saved 私人作業不可外洩。
- S03 MUST：本人貢獻的原題在「我上傳／共用中」完成、取消完成、封存、還原共用狀態與 review_count。其他人的原題使用本人 collection_item_progress，完全不改作者與其他成員進度。原題狀態不公開給觀看者。 舊作者 collection_item_progress 不回灌、不覆蓋原題；作者以既有原題狀態為準。
- S04 MUST：共用中提供 exclude_self=yes（只看其他人貢獻），卡片／搜尋／metadata 大綱／URL 返回範圍一致；owned、saved、public 不接受此參數。
- S05 MUST：既有作者 shared_layers 保留為「舊共用作業」唯讀參考，不自動合併、覆蓋原題或搬移筆跡。原本獨立共用目標的本機草稿不自動重播到原題；可從設定取回。 作者共用寫入要求 source_item_id 與 generation，舊客戶端回 SOURCE_TARGET_CHANGED（409），先保留草稿並重新載入。
- S06 MUST：授權存入／更新來源時固定保存當下允許的原題作業；來源之後更新、撤權、刪除不改已存版本或私人 workspace。讀取來源更新不得因 live draw 沒有 asset ID 而誤判。
- S07 MUST：draw_seq／notes_seq 獨立 CAS；progress_seq 檢查原題進度；generation 與當下貢獻權重驗。原題更新使所有相關集合快取失效，不產生新題事件。
- S08 migration：0006_shared_source_work.sql 依賴 0005。部署前使用專用腳本，不把 schema.sql 套用到既有庫。語意修改立即作用於已有集合；發布前告知加入者原題作業會共享。

## 0. 全部修改清單（先讀；變更 ID 為後文追蹤鍵）

| ID | 原規則／舊假設 | v2 必須採用的行為 |
| --- | --- | --- |
| C01 | 第一階段僅建立者可加題，協作延後 | 第一階段提供貢獻者、訂閱者；建立者是具有管理權的貢獻者 |
| C02 | 多人投稿需審核或不支援 | 受邀貢獻者可直接把本人原題加入集合；無投稿審核、提交給作者流程 |
| C03 | 集合作者必須是每題的原題作者 | 集合建立者、原題提供者、筆記撰寫者各自獨立；提供者只需有集合貢獻權 |
| C04 | 集合讀取固定發布版本，更新需明確發布 | 集合讀取活的原題；移除發布版本設定、更新公開內容按鈕及 publication_revisions 作為共用來源的模型 |
| C05 | 替換／裁切圖片後管理版本與筆跡座標 | 本階段不支援替換或裁切既有原題圖片；不同圖片必須新增題目 |
| C06 | 批註是私人草稿，提交後僅作者看得到 | 集合內每位貢獻者有自己的共用筆跡／筆記；儲存後貢獻者互見；不共寫同一圖層 |
| C07 | 顯示原作者私人筆記快照；開啟展示須重新發布既有題 | 已加入原題的作者作業同步共享给貢獻者；一般觀看者依筆跡／文字各別展示開關，預設關閉；未加入題及 saved 私人作業不共享 |
| C08 | 來源內容更新以發布事件／版本提示處理 | 原題及共用層更新可被讀者取得；不推播、不計新題、不強制通知；新題只計新增成員事件 |
| C09 | 個人題庫與集合使用不同產品模型 | 個人題庫是系統集合，包含本人 owned＋saved；UI 與查詢介面統一，原題歸屬與集合成員關係仍分離 |
| C10 | 每次上傳後另按加入公開集 | 新增帳號級「預設上傳至〔題目集〕」；雲端上傳成功後加入，單次可改為只存個人題庫；無特殊教師角色 |
| C11 | 下載指向已存在的發布版本 | 下載當下建立個人來源快照及獨立資產引用；集合仍讀活資料，已存者不再依賴集合 ACL |
| C12 | 新版本另建作業區並保留多版作業 | 已存題只提供「更新來源內容／保留目前已存內容」；更新一次性替換來源快照，保留同一個人作業區、筆跡、筆記、分類與狀態 |
| C13 | 所有作業共用一個 seq；衝突一律形成兩版 | 筆跡與文字各有獨立 seq；標籤用增刪操作；僅同欄位過期寫入需保留草稿與處理衝突 |
| C14 | 刪除私人原題不影響既有發布版本 | 刪除原題即停止該原題在所有集合的共用；他人已存來源快照及作業仍保留 |
| C15 | 貢獻者退出／移除尚未定義 | 退出或移除時，移出其提供的集合題目、隱藏其共用層；本人筆記可取回，已下載內容不回收；重新加入不自動復活 |
| C16 | 個人題卡的集合資訊只查本人建立的集合 | 題卡顯示本人原題參與的所有集合；可依本人有貢獻權的指定集合篩選自己的原題 |
| C17 | 發布版本及其歷史是圖片保留關係的一部分 | 改為原題、有效共用層、已存來源快照、個人作業及封面等具體引用；訂閱與歷史 tombstone 不保留圖片 |
| C18 | 既有 v1 migration／路由可繼續直接完成 | 先重構未部署草稿：內容 ownership、live projection、shared_layers、saved_snapshots、獨立 seq、預設上傳目的地及刪除規則 |
| C19 | 功能邊界分散、多人共用層被延後 | 本文件列出完整操作矩陣與不支援操作；多人貢獻及各自共用層納入本階段，匿名寫入／他人圖層改寫仍禁止 |
| C20 | A～D 完成後再考慮多人協作 | 第一階段上線門檻涵蓋多人貢獻、共用書寫、下載後保留、來源更新及預設上傳；測試矩陣隨之替換 |

Agent 契約：MUST＝必要驗收；MUST NOT＝禁止；LATER＝不實作、不顯示可用入口。每節的 `[Cxx]` 指向上表。舊文件、未完成程式、SQL 表名不能覆蓋本文件。實作須遵循本文件最上方的優先修訂；後續更新應同步進度。

## 1. 不變條件與模型

保留：公開／持連結／指定帳號觀看；單題與多題共用同一引擎；listed 與 visibility 分開；匿名唯讀；只共享已加入原題的作者作業與集合共用層；存入後可獨立讀圖；取消訂閱不刪已存資料；既有單題連結相容；訂閱頁色彩＋文字辨識；PWA 不建立共用內容的持久離線快取；題圖可用必須重驗的瀏覽器 HTTP 快取，第一階段不保證題圖離線可用。

保留：現有 viewport 限制、底部導覽貼底、Logo 操作、快捷鍵及觸控方式均為刻意設計，本功能不改造。

**變更 [C03 C04 C09 C11 C12]：**

```text
users ─owns→ items（原題／固定 image_asset_id／可變來源資訊）
users ─owns→ personal system collection（owned + saved 的系統視圖）
collections ─members→ collection_items ─live source→ items
collection_items ─source author work→ items.draw_data / typed_notes
collection_items ─other contributors→ shared_layers（彼此可看，各寫各的）
user ─subscribes→ collection（追蹤，不產生永久觀看權）
user ─owns→ saved_ref ─current→ saved_snapshot（下載時取得的內容）
saved_ref ─owns→ personal_workspace（更新來源時不更換）
items / shared_layers / saved_snapshots / workspaces ─reference→ assets
```

- MUST 分離 `collection.owner_id`、`item.user_id`、`shared_layer.user_id`、`saved_ref.user_id`。
- MUST 保留同一原題在不同集合的獨立 `collection_item_id`；不因共用圖片自動合併來源或授權。
- MUST 以 `source_kind = owned | saved | collection` 選擇服務與寫入範圍；不能偽造 user_id 使訂閱題通過原題 PATCH。
- `saved_snapshot` 是內部下載資料，非發布版本；UI 不提供發布版本、切回歷史來源版本或重新發布題目。

## 2. 集合、角色與權限

**變更 [C01 C02 C03 C07 C09]：**使用兩個主要角色；建立者是貢獻者的管理身分。

| 主體 | 可做 | 不可做 |
| --- | --- | --- |
| 建立者 | 貢獻者所有操作；修改集合資訊／觀看範圍／展示設定；邀請與移除貢獻者；移出任何集合題；排序；下架、刪除、轉交集合 | 讀取其他人私人題庫／私人作業；修改他人的原題或筆跡；刪除他人已存內容 |
| 貢獻者 | 加入本人原題；移出本人提供的題；在集合任一有效題上寫自己的共用層；讀取有效貢獻者的共用層；退出 | 邀請成員、變更觀看範圍；刪他人題；編輯他人原題或共用層 |
| 訂閱者／一般讀者 | 依 ACL 閱讀、下載圖片；登入後訂閱、存入；在自己存入題上訂正 | 在集合直接加題或書寫；查看未開放的共用層及任何私人層 |
| 訪客 | 依公開／有效連結閱讀、下載當下可見圖片 | 訂閱、雲端存入、加題、書寫；操作時導向登入並保留本站 returnTo |

- 訂閱是追蹤關係，非授權角色；貢獻者可同時保有訂閱，列表以 collection_id 去重。撤銷貢獻權後重新判斷觀看 ACL，不自動建立訂閱。
- collection `visibility = public | link | restricted`；`listed=true` 僅能搭配 public。有效 contributor grant 自帶集合閱讀權，不依賴公開連結。
- named viewer grant 與 contributor grant 可以並存；撤銷某一授權不得抹掉其他有效權限。公開集合不能阻止被移除者以訪客閱讀。
- 具名授權只接受登入帳號；邀請須使用已驗證 email 接受後綁 user_id。不得以知道他人 email 直接登入或接受邀請。第一階段提供邀請網址，不假設已具備自動寄信服務。
- link grant 只授予讀取，token 存 hash、可撤銷／到期；grant_holders 永遠 join 有效原 link。改 restricted 時撤銷舊連結，再改回 link 不復活舊 token。
- 個人系統集合 `kind=personal`：唯一、私有、不可訂閱、不可邀請、不可公開、不可刪除集合本身。它是本人 owned＋saved 的視圖，不用普通標籤名稱判斷身分。
- 普通集合 `kind=set | single`；single 至多一題，預設不進探索。restricted 且沒有其他成員即可用作本人原題的私人集合；saved 題不加入普通共用引擎，私人分類沿用個人科目／標籤。

**變更 [C07]：共用內容展示**

- 來源 DTO 白名單：固定題圖、來源標題／說明／標籤、可對映的標準分類、題目提供者公開名稱。私人 email、訂正狀態、複習次數、私人筆跡／文字不傳送。
- 貢獻者互看共用層。訂閱者依 `show_shared_ink`、`show_shared_notes` 讀取，共用展示預設 false。
- 展示開關直接作用於全部現有有效共用層；不需逐題再發布。擴大展示或觀看範圍時必須列明影響，含既有共用筆記；貢獻加入與書寫 UI 顯示其內容依集合設定可能提供給讀者。
- 共用層儲存即對貢獻者生效；不提供「提交給作者」或按人獨立的發表審核。
- 合法讀者可匯出當下可見內容；登入後可取得服務端保管的個人下載版本。無「可看但禁止存入」開關。已合法下載的共用筆記亦不因作者後續關閉展示而收回。

## 3. 原題與集合成員生命週期

**變更 [C02 C04 C05 C08 C14 C15]：**

| 操作 | MUST 行為 |
| --- | --- |
| 建立集合 | 設名稱、公開名稱、觀看範圍、展示設定；可先存草稿或建立並啟用；每位貢獻者首次加題前確認公開名稱，不直接沿用 email |
| 加入原題 | 驗本人擁有原題＋當前貢獻權＋圖片 ready；加入 active 集合即提供讀取，無第二次發布 |
| 加入別人的私人原題 | 拒絕，即使操作者是集合建立者 |
| 加入本人已存的他人題 | 拒絕；下載權不等於再分享權 |
| 同題同集合重試 | 回傳同一 entry；不新增題數／事件 |
| 移出後再加入 | 沿用 entry，generation 遞增，新加入事件；舊共用層不自動恢復可見 |
| 批次加入 | 每批最多 50，逐題回報成功／失敗；候選全部符合條件需由後端固定清單；無跨批原子承諾 |
| 改原題公開欄位／AI 完成分類 | 集合讀取最新白名單內容；不需要更新公開內容操作、不算新題 |
| 改原題作者筆跡／文字／訂正狀態 | 已加入集合的作者筆跡／文字 live 同步；訂正狀態僅作者本人共用檢視同步，其他成員進度獨立 |
| 換圖／裁切既有題 | 本階段拒絕；後端不接受 image_asset_id 原地替換；新圖需新建題目 |
| 從集合移出 | 只改指定集合關係；保留原題及已下載個人內容 |
| 刪除本人原題 | 列出所有受影響集合；停止其全部 live 共用、移除私有根；他人 saved 根完整保留 |
| 退出／移除貢獻者 | 撤銷貢獻權、移出其提供的題、停用其全部共用層；本人草稿保留可取回；既有個人下載不受影響 |
| 重新邀請退出者 | 不自動復活舊 entry／共用層；須明確重新加入題目、重新書寫或帶入本人的舊筆記 |
| 集合排序／改名 | 更新集合資訊，不產生新題事件 |
| 暫停集合 | 一般讀者不可讀；貢獻者可進管理工作區整理；已有事件基準保留 |
| 刪集合 | tombstone，停止共用讀取與寫入；原題及他人 saved 保留；不復活 |

- collection：`draft → active ↔ suspended → deleted`。entry：`included ↔ removed`，另記 generation；來源已刪不可重新加入同一原題 ID。
- inactive 集合加題只整理成員；啟用時僅尚未對外產生 add event 的當次 generation 計為新題，恢復既有集合不把全部題重算新題。
- 原題必須固定圖片尺寸、方向與座標基準。顯示縮放用 transform，不更改儲存座標或自動重算個人草稿區。
- collection owner、contributor 移除／帳號刪除流程必須在讀取查詢立即失效；大量清理可背景執行，但不能在清理完成前繼續供應已撤銷內容。

## 4. 預設上傳目的地

**變更 [C10]：無教師專用角色；使用帳號偏好即可。**

| 操作／情況 | MUST 行為 |
| --- | --- |
| 設定預設 | 「只存我的題庫」或「上傳後加入〔某集合〕」；選項僅含本人建立或有貢獻權的集合 |
| 上傳視窗 | 明示本次目的地與公開／連結／指定對象狀態；可單次更改，只有明確勾選才改帳號預設 |
| 成功上傳＋成功加入 | 題目同時屬本人題庫與目標集合；active 集合立即可讀 |
| 上傳成功、加入失敗 | 私人原題保留；顯示「已存入個人題庫，加入集合失敗」及重試，不能顯示已公開 |
| 圖片上傳失敗 | 不建立可讀集合成員 |
| AI 尚未完成 | 可先以未分類加入；AI 成功後來源分類自動反映於集合 |
| 預設集合已刪／權限失效 | 回退只存個人題庫並提示；後端每次重驗，不能依舊 UI 權限放行 |
| 草稿／暫停集合 | 可以加入整理，明示尚未對讀者開放 |
| 離線／訪客 | 既有本機上傳保留；不因恢復連線或登入暗中公開。雲端同步及具名貢獻權就緒後再明確加入 |

MUST NOT 因修改標籤、建立教師帳號或普通私人上傳，自動擴大到未指定的集合。一次上傳的自動目的地先限一個，題目之後仍可加入多集合。

## 5. 共用書寫及同步

**變更 [C06 C07 C13]：**

| 工作區 | 資料主體／寫權 | 讀權 |
| --- | --- | --- |
| 原題作者作業 | item owner | 未加入集合時僅本人；加入後貢獻者可互見，一般觀看者依展示 mask；作業由 items 單一來源讀寫 |
| 集合其他成員共用層 | entry＋當次 generation＋contributor user | 本人可取回；有效貢獻者互看；一般讀者依展示 mask |
| 個人已存作業 | saved_ref owner | 僅本人；更新來源不更換 workspace |
| 已存來源參考層 | saved_snapshot 中取得的內容 | 僅取得者唯讀；不能擦除為自己的可編輯筆跡 |

- 共用層編輯 MUST 驗 entry 有效、當前貢獻權、原題存在；不能只驗 workspace.user_id。作者只能寫自己的層。
- UI：`我的共用筆記／其他貢獻者`，按姓名切換或疊加；不同人圖層可隱藏。本人當前層可編輯，其餘唯讀。文字筆記按人分區。
- 訂閱者一般閱讀介面不顯示共用寫入工具；取得貢獻權後才顯示。不建立匿名或所有成員共寫的單一圖層。
- tag mutation＝add/remove set；伺服器依提交順序處理相同標籤相反操作。MUST NOT 用舊整份陣列覆蓋其他裝置新增標籤。
- draw 與 notes 各有 `draw_seq`／`notes_seq`。請求只帶該欄位內容及 expected seq；SQL 條件更新，同欄位過期回 409；不同欄位不互相衝突。
- 同欄位衝突才保留未同步草稿並提示取回／載入目前內容；不自動 Math.max seq 後覆蓋、不自動合併筆畫、不必每次建立兩份正式版本。
- 個人分類／狀態只 PATCH 本次欄位；集合設定及不可交換的 metadata 更新使用 row_version。
- 本機草稿／隊列鍵：account_id＋account_instance_id＋workspace_id＋field；記 expected seq 及 request_id。401 暫停；403／410 共用失權停止重播但保留本人草稿；409 保留內容等待處理。
- 關閉頁面／切題前刷新本機待存草稿，顯示未同步狀態；重播不得跨帳號或覆蓋較新修改。不得重新引入 iOS 無備援 Blob/File IndexedDB 儲存。
- 第一階段個人圖片仍需連網；共用書寫離線時只能暫存自己的草稿，恢復後重驗貢獻權再提交。
- 每次筆跡 payload 初始上限 2 MiB、文字 64 KiB，超限明示保留本機內容。其他成員及已存筆跡的 R2 物件不可原地覆寫；D1 原子切指標後釋放舊引用。原題作者筆跡維持 items JSON＋draw_seq CAS，僅在取得固定下載時寫入新的 R2 筆跡資產。

## 6. 訂閱、讀取最新內容、下載與更新

**變更 [C08]：訂閱仍是閱讀追蹤。**

- 開啟／返回集合、視窗重新取得焦點及頁面輕量更新時取得最新內容；不承諾逐筆畫即時串流。不可見頁面停止輪詢，避免每卡各自輪詢。
- 回應帶來源 content_seq、entry shared_seq 等版本線索；客戶端依版本刷新唯讀層。不得覆蓋正在編輯的本人工作區。
- 訂閱當下於交易記錄 add-event 高水位。舊題可閱讀但不大量列為未看新題。
- 新題＝訂閱後 entry 當次 generation 的 add event；更新原題、共用層、AI 分類、排序不算新題，不推播或寄信。
- 只有成功開啟並載入才標記已看；縮圖預載不算。「全部已看」使用伺服器核發的使用者／範圍綁定高水位，不能由客戶端任填未來序號。
- 首頁固定 upper_event_seq，後續分頁沿用；每頁仍驗最新 ACL／entry state。閱讀返回保留篩選、游標、捲動位置。
- 取消訂閱不刪個人已存內容，也不撤有效觀看權；單題移除不讓整個訂閱失效；整個集合不可存取才進「已失效」。

**變更 [C11 C12]：下載與更新來源只操作 saved 的來源區塊。**

| 使用者動作 | 精確效果 |
| --- | --- |
| 存入我的錯題本 | 登入＋有效來源閱讀權；捕捉當下來源題圖、白名單 metadata、當下可見共用層；建立獨立 saved_snapshot、資產引用、個人分類及空白工作區 |
| 重複存入 | UNIQUE(user,entry)，回傳既有 saved_ref；不自動更新、不重複計數 |
| 同圖不同集合存入 | 各自保存，授權／共用層可不同；不跨集合去重 |
| 本人看本人原題 | 顯示「開啟我的原題」，不另存一份自己的題目 |
| 更新來源內容 | 再次驗權，取得目前可見的來源內容，原子替換 saved_ref.current_snapshot_id；保留同一個人工作區 |
| 保留目前已存內容 | 完全不改來源與個人資料；「目前」指上次存入或更新後的內容，不特指最初一版 |
| 來源再次變更 | 不自動更新已存版本；需要時再選上述兩種行為，無永久自動同步模式 |
| 來源失效／已移出 | 禁止新的來源更新；現有 saved_snapshot 仍可跨裝置讀圖及書寫 |
| 刪除自己的已存題 | 刪本人的來源引用及個人作業；不影響原題、集合或他人 |

更新欄位矩陣：

| 欄位 | 更新來源時 |
| --- | --- |
| 固定題圖／圖片座標 | 不變；source asset 不符原固定題圖時回錯，不擅自搬筆跡 |
| 來源標題／說明／來源標籤／來源標準分類 | 替換為目前來源值 |
| 當下可讀的共用筆跡／文字 | 替換唯讀來源層，包含來源已刪／已隱藏內容的移除 |
| 個人筆跡／文字／草稿區尺寸 | 不變 |
| 個人科目／單元／私人標籤／狀態／複習次數 | 不變 |

- UI 使用「更新來源內容」，MUST NOT 寫成同步全部個人資料。更新說明：會替換已保存的來源內容，自己的訂正保留。
- 成功更新視為本人同意替換目前來源副本；舊來源快照不提供歷史切換 UI，可在無引用後回收。失敗則舊快照與個人作業均不變。不必為每次更新建立新 workspace。
- 保留規則：作者下架、撤權、刪除來源／帳號／共用層均不能回收他人已存內容。只有本人刪除／主動替換其副本時可釋放引用。平台隔離是獨立管理例外，不是作者撤回下載的功能。
- 下載不是裝置離線快取。服務端可共用同一資產，讀圖用 saved ownership，不能再次檢查原集合當前 ACL。

## 7. UI／UX 操作契約

**變更 [C06 C09 C10 C12 C16]：**

| 頁面／入口 | 必要內容 |
| --- | --- |
| 首頁 `/` | 本人 owned＋saved KPI；訂閱摘要；公開探索入口；未存的訂閱題不計私人 KPI |
| 我的題庫／既有 study 頁 | 系統集合；來源：全部／我上傳／我存入；保留既有課綱、訂正篩選、虛擬列表及書寫體驗 |
| 我的題目集 `/my/collections` | 我建立／我參與；發布中／草稿／已下架；建立、管理、退出；權限決定可見動作 |
| 集合管理 `/my/collections/:id` | 內容／共用設定／成員／統計；只向有權者提供相應頁籤；不顯示一般訂閱者私人答案／閱讀紀錄 |
| 集合閱讀 `/collections/:id` | 介紹、提供者、訂閱；科目／標準單元樹、來源標籤、閱讀／已存篩選；貢獻者可加題 |
| 集合單題 `/collections/:id/items/:entryId` | 上下一題、下載圖片、存入；貢獻者可寫自己的共用層、切換成員圖層 |
| 訂閱中心 `/subscriptions#new`／`#collections`／`#unavailable` | 新題、完整題目集、已失效；科目／標準單元／來源集合／未看／已存篩選 |
| 管理訂閱 `/subscriptions/manage` | 搜尋、來源狀態、開啟、取消；邀請接受入口 |
| 公開探索 `/search?scope=public` | public＋listed＋active；集合優先，公開題目次要；可檢舉 |
| 個人已存 `/saved/:savedId` | 私人書寫、來源唯讀層、來源標記、更新來源／保留目前內容；無發布版本選擇器 |
| 分享／邀請 `/share/:token`、`/invite/:token` | 舊連結 adapter／新版入口驗權；清理 token，本站 returnTo |
| 上傳視窗及設定 | 預設上傳目的地、單次覆寫、目的地可見範圍、上傳與加題的分別結果 |

- 個人原題徽章：active public=`已公開於〔集合〕`；其他有效共用=`已共用於〔集合〕`；draft／suspended 顯示實際狀態，不冒充公開。多集合顯示一個＋另 N 個。
- 本人可按「我有貢獻權的某集合」交叉篩選自己的原題，不限本人建立的集合；不能因此回傳他人的私人原題。篩選保存 URL。
- 已存題徽章：`存自〔集合〕`＋題目提供者；失效後顯示 `來源已停止共用・個人內容保留`，圖片仍可讀。來源資訊與個人分類不混用。
- 訂閱／集合頁頂部固定窄識別區：柔和鼠尾草綠底＋集合圖示＋文字；個人題庫維持現有主色。深色模式有對應背景；不能只靠顏色表達權限。
- 共用筆記區固定顯示 `貢獻者可見` 或 `所有可觀看者可見`；私人筆記標示 `僅自己`。自己與他人來源層操作區分。
- 分類元件可共用呈現，但訂閱 counts／資料不能塞進私人 global problems；作者私人自訂 taxonomy 不直接成為訂閱者分類。
- 原題分類以標準課綱對映供集合篩選；無標準對映列「未分類／作者自訂」。存入時選本人課綱，可安全預填但不能引用他人私人 taxonomy ID。
- 加題、訂閱、已看、正常儲存不重複確認；擴大公開範圍、刪原題、移除貢獻者、刪集合列出實際影響再確認。
- loading／空集合／未訂閱／無新題／篩選無結果／無權／單題移出／圖片暫時失敗／未同步／409 草稿／已下架都要有獨立狀態。圖片失敗不算已看；無權不回傳未授權標題／縮圖。

## 8. 資料結構（目標契約，非已部署 schema）

**變更 [C03 C04 C06 C09 C11 C12 C13 C17 C18]：撤除共用來源對 publication_revisions 的依賴。**

| 表／擴充 | 必要欄位 | 約束／用途 |
| --- | --- | --- |
| users | account_state、account_instance_id | 再註冊不可恢復舊權；刪帳號先停授權後清理 |
| public_profiles | user_id、display_name、confirmed_at | 與登入姓名／email 分開；集合顯示提供者／撰寫者確認過的公開名稱 |
| items | user_id、固定 image_asset_id、source_title／description／source_tags、content_seq、standard_topic_id? | content_seq 只追來源公開欄位；既有私人分類／status／draw_data／typed_notes 保留私有語意；image 不可 PATCH |
| standard_catalogs／standard_topics | catalog_id、version、topic_id、parent_id、label、retired_at? | 全站標準課綱；與私人 taxonomy ID 分開，快照保留取得時的可讀分類資訊 |
| collections | id、owner_id?、kind(personal/set/single)、title、description、lifecycle、visibility、listed、show_shared_ink、show_shared_notes、acl_version、row_version | personal 每使用者唯一且固定私有；owner 是管理者，不代表原題提供者 |
| collection_items | id、collection_id、source_item_id?、contributor_id?、origin_item_key、state、generation、display_order、shared_seq、latest_add_event_seq? | UNIQUE(collection,origin_item_key)；source 必須屬 contributor；刪 source 時 entry 先失效再 SET NULL；不 CASCADE 刪個人下載 |
| collection_grants | id、collection_id、kind(user/link)、role(viewer/contributor)、user_id?、token_hash?、expires_at?、revoked_at?、created_by | link 只能 viewer；owner 管理身分不偽造成普通 grant；可並存 reader/contributor 授權 |
| invitations | id、collection_id、role、email、token_hash、expires_at、accepted_by?、revoked_at? | 登入且已驗證 email 相符才接受；回應不洩漏帳號是否存在 |
| grant_holders | grant_id、user_id、claimed_at | PK(grant,user)；不能脫離原 link 產生永久 ACL |
| shared_layers | id、entry_id、entry_generation、user_id?、state、draw_asset_id?、draw_seq、typed_notes、notes_seq、updated_at | UNIQUE(entry,generation,user)；共用寫權額外驗 contributor；退出／移出後 detached，只允許本人取回 |
| subscriptions | user_id、collection_id、subscribed_after_seq、read_all_through_seq、last_known_title | PK(user,collection)；訂閱不是讀取權；失效只回傳合法保存的必要摘要 |
| collection_events | seq、collection_id、entry_id?、generation?、type(add/remove/suspend/resume)、created_at | add 對 entry＋generation 唯一；一般來源／筆記更新不新增 add |
| collection_item_reads | user_id、entry_id、seen_add_event_seq、seen_at | 單調推進合法序號；預載不更新 |
| saved_refs | id、user_id、entry_id、current_snapshot_id、personal_topic_id?、personal_tags、status、review_count、row_version、downloaded_at | UNIQUE(user,entry)；來源撤銷不影響個人讀取；personal 欄位不受 refresh 修改 |
| saved_snapshots | id、saved_ref_id、image_asset_id、source_title／description／tags／standard_classification_snapshot、collection_title、provider_public_name、acquired_at、acquisition_policy_version、source_content_seq、source_shared_seq | 僅 save／refresh 建立；immutable；不是共用頁發布資料；合法取得後讀取不依賴 source FK |
| saved_snapshot_layers | snapshot_id、layer_origin_key、author_display_snapshot、draw_asset_id?、typed_notes?、retained_field_mask | 保存取得當時可見內容；不能 join live layer 回填已撤銷欄位；mask 依使用者角色及展示設定計算 |
| personal_workspaces | id、user_id、item_id?、saved_ref_id?、draw_asset_id?、draw_seq、typed_notes、notes_seq、canvas_geometry | item／saved 二選一；saved refresh 不改 workspace ID／seq／geometry；既有 inline 私人資料可分階段轉接 |
| user_upload_preferences | user_id、default_collection_id?、updated_at | null＝只存個人；每次 upload 後仍驗當前貢獻權 |
| assets | id、storage_key、mime_type、byte_size、state、generation、gc_after?、created_by? | storage_key UNIQUE；只接受 ready 引用；created_by 不是讀取 ACL；固定 bytes |
| asset_refs | id、asset_id、item_id?、shared_layer_id?、saved_snapshot_id?、workspace_id?、cover_collection_id?、role | 恰一來源非 NULL；真實 FK／唯一約束；變更引用不得立即任意 R2.delete |
| sharing_audit | actor_id?、collection_id?、action、target_id、before／after 摘要、request_id、created_at | 不記 token、私人答案或圖片 bytes；追蹤成員及公開範圍變更 |
| maintenance_jobs | id、kind、target_id、state、lease_until、attempts、next_attempt_at、last_error | 有租約、重試及冪等的撤權清理／引用對帳／GC |
| public_search_documents＋FTS | collection／entry、來源白名單 metadata、標準分類、來源版本線索 | 只投影 eligible public+listed+active；不把私人 OCR／筆記直接進 public FTS |
| content_reports | reporter_id、collection／entry、category、detail、state、resolution | 有管理處理入口；不能只有空檢舉表單 |

索引 MUST 覆蓋：collection(owner,lifecycle)；entry(collection,state,order,id)、entry(contributor,state)、entry(source,state,collection)；grant(collection,user,role,revoked,expires)；shared_layer(entry,generation,state,user)；subscription(user,collection)；event(collection,seq)；saved(user,status,personal_topic)、saved(entry,user)；asset_refs(asset) 及各 source FK。

私人題庫 system view 直接查本人 items＋saved_refs；MUST NOT 每次存入又複製一份私人 items，或為每個 private item 維護重複的 personal collection member 列。

## 9. API／交易／安全契約

**變更 [C02 C04 C06 C10 C11 C12 C13 C18]：**

| API 類型 | 路由／行為 |
| --- | --- |
| 集合 | GET/POST `/api/my/collections`；GET/PATCH/DELETE `/api/collections/:id`；首次啟用／恢復 `/activate`，暫停 `/suspend` |
| 成員題 | GET/POST `/api/collections/:id/items`；DELETE `/items/:entryId`；PATCH `/order`；本人原題透過既有 owned API 更新 |
| live 題目 | GET `/api/collections/:id/items/:entryId`、`/image`；取得目前授權的白名單來源＋共用層；無 `/revisions` 發布 API |
| 成員／邀請 | GET/POST/DELETE `/api/collections/:id/grants`；建立／接受 invitation；`POST /api/collections/:id/leave`；owner transfer 給已接受且同意接手的貢獻者 |
| 連結 | 建立／列出／撤銷 link；POST `/api/share-links/claim`；交換 token 不升級成寫權 |
| 共用層 | GET `/api/collections/:id/items/:entryId/layers`；PUT 本人 layer `/draw` 或 `/notes` 各帶 expected seq；本人 detached 筆記另有取回入口 |
| 訂閱 | PUT/DELETE `/api/subscriptions/:id`；GET lists/feed；標記已看／read-all 帶伺服器快照高水位 |
| 個人題庫 | GET `/api/my/notebook` origin=all/owned/saved、科目／單元／狀態／collection_id；集合篩選只套用本人的 owned |
| 個人來源徽章 | GET `/api/my/collections/membership?item_ids=…` 批次查本人原題的集合關係，不要求本人是 collection owner |
| 個人下載 | POST `/api/saved`；GET/PATCH/DELETE `/api/saved/:id`；POST `/api/saved/:id/refresh-source`；保留目前內容不需寫 API |
| 個人下載圖片 | GET `/api/saved/:id/image` 依本人 current_snapshot；不查當前來源 ACL |
| 個人作業 | GET `/api/workspaces/:id`；分別 PUT `/draw`、`/notes`；只 PATCH 本次欄位，不共用單一整份 workspace seq |
| 預設上傳 | GET/PATCH `/api/me/upload-preferences`；upload request 帶本次 destination；回傳 upload 與 join 分別結果 |
| 公開探索／管理 | 公開 search 白名單查詢；舉報；受保護的隔離、引用對帳及維護狀態 |

交易 invariants：

1. 加題：同交易驗 collection 非 deleted、當前有效 contributor、source owner、asset ready、entry generation；成員＋引用／事件整體提交。不得先查 owner 後假設授權永遠有效。
2. Live read：原題仍存在、entry included、提供者貢獻資格仍有效、collection 適用讀權；任一失敗不得從舊投影／R2 URL 繞過。
3. 共用寫入：當前 ACL＋entry generation＋該欄位 expected seq；更新 layer、引用、entry.shared_seq 原子提交；另一人的圖層永不可改寫。
4. Save／refresh：同一 D1 交易中擷取當前白名單來源、目前可見層及 immutable asset 指標，建立 snapshot＋asset_refs。若需先讀取，提交時重驗 source.content_seq、entry.shared_seq、ACL、可見成員集合及 expected saved row_version；任何變動回 409／重取，不能混成半新半舊快照。
5. 首次 save 同交易建 personal workspace；refresh 僅換 source pointer，MUST NOT 更新私人工作區／分類／狀態。先取得新引用再釋放舊引用；失敗完整回滾。
6. Source delete／contributor revoke：先讓權限、來源或成員狀態在 DB 中立即不可讀，再排背景回收；saved 所有權與其根不可被 CASCADE 刪除。
7. SQL UPDATE 零列不是交易失敗；後續引用／事件必須受同一條件約束或由 DB invariant 令整批回滾。D1 transaction 不涵蓋 R2；物件先 staging，指標交易成功後才可讀。
8. 身分由 session 決定；忽略 client 自填 actor/owner；cookie mutation 有 Origin／CSRF 防護。錯誤、auth、未知 API 路由返回 JSON，不落到 SPA HTML。

API 共通：列表預設30、上限100、穩定游標；名稱80字、簡介2,000字；寫入 idempotency key＋必要 expected_version；401/403/404/409/410/413/429/503 有固定 code。410 僅代表曾可讀來源失效，不可令有效 saved 自動失效。新增獨立共用讀寫／邀請／加題／下載限流，不能只借用上傳額度。

授權 token 不放圖片 query；訪客 token 交換後清理入口 URL、採 no-referrer、遮罩日誌；cookies／holder 均不超越原 grant。共用與個人圖片分路由驗權，共用 bytes 不能共用 ACL 快取。

## 10. 搜尋、儲存、撤銷與帳號

**變更 [C04 C14 C15 C17]：不再保留用於對外發布的內容快照。**

- 集合 live source 的原題 image 根即保護圖片；已存 snapshot 有自己的根。來源已刪但有人已存的圖不是幽靈圖片。
- shared layer draw assets、私人 workspace draw assets、snapshot 中已取得的參考層、有效封面均需登記引用；相同 asset 可多引用，不能以建立者帳號作物件刪除範圍。
- 訂閱、collection tombstone、舊事件、無人使用的 retired snapshot 不作保留根。refresh 舊 snapshot 釋放需發生在新 pointer／引用提交成功之後。
- 自動封面跟隨有效成員，來源失效改另一張或預設；自訂封面也是受授權資產，不能繞過下架。
- GC：無根 → gc_pending＋寬限 → 重查無根並條件鎖定 deleting → R2.delete → deleted；新引用只接受 ready，不能在 deleting 階段復活。R2 刪除回應遺失可重試；generation／租約防競態。
- 原圖不可覆寫；共用筆跡更新以新 R2 key 存儲；既有 R2 key 可回填 registry，不需先改名搬圖。不做跨帳號上傳 hash 去重查詢。
- 初次 migration／回填後先 dry-run 對帳，驗證原題、layers、snapshots、workspaces、封面完整，再啟用物理 GC。需記 missing/orphan 與工作積壓，提供重試及管理狀態。
- 公開 search 僅 public+listed+active＋有效 entry/source/provider；每次結果重驗，背景索引落後不能洩漏已撤權摘要／圖。中文 FTS／標準分類與私人索引分開，公開文案不含私人 OCR 或作業。
- 私人 saved 搜尋用已存快照＋自己筆記，不 join live source 恢復已失權內容；來源失效後仍可搜已取得內容。
- 現階段搜尋沿用 D1 加權關鍵字／LIKE＋原題 OCR FTS5，不接 AI Search。入口 `/search` 預設 `scope=mine`（本人原題＋已存）；`scope=shared` 搜尋建立、接受授權、持有效觀看連結及訂閱的集合；`scope=public` 是 public＋listed＋active 探索，集合優先。
- `scope=shared&subscribed=yes` 只查本人訂閱，包含訂閱前已存在的題目；訂閱紀錄不是授權。指定 `collection_id` 時可搜尋目前可讀集合，匿名者須有 public 可讀來源或該集合的有效 link cookie。
- mine 可用 `origin=all|owned|saved`、`status`、`topic_id`（含子單元）、`tag`、`collection_id`；共用／公開只使用標準課綱、來源標籤，不公開私人課綱。saved 的集合篩選只比對已存 entry 的來源集合，不依賴 live 觀看權。
- 原題搜尋用目前 metadata／私人文字與最新 OCR 索引列；saved 搜尋 current snapshot 的來源標籤、標題、已取得文字層、本人標籤／分類／筆記。saved 不搜尋尚未明確更新的來源新內容，也不從 live 原題讀 OCR。
- 共用題只搜尋目前 source 白名單 metadata 與當前 generation、有效貢獻者的可讀 shared notes；公開探索只搜尋集合標題／說明／公開名稱、題目來源／標籤／標準單元／貢獻者公開名稱，排除私人 OCR 與任何筆記。
- 回傳有明確 `origin`、collection provenance、本人 `saved_id`；同一原題在不同集合保留各自結果。筆跡不作文字搜尋。預覽只讀；原題的完整模式可訂正，saved／shared 透過各自詳情頁操作。
- 每頁預設 30、最多 50，以 `offset`／`next_offset` 載入；排序為公開集合優先、相關度、時間、種類及 ID。搜尋期間有新增／編輯／撤權可能改變排序，重新搜尋刷新；每頁重新驗權，前端去除重複結果，不宣稱已載入筆數是全庫總數。
- FTS5 的 UNINDEXED id 不具 UNIQUE：禁止靠 INSERT OR REPLACE 視為依 id 更新；同一 mutation batch 合併重複列、保留最新 OCR 並同步目前 metadata。訪客本機搜尋排除已有 cloudOwnerId／cloudId 的帳號草稿。切換帳號／範圍立即隱藏舊结果並取消舊請求。
- API／共用 metadata／筆記維持 no-store；圖片使用 `private, no-cache`＋ETag，當下驗權與資產檢查後才可回 304。SW 不建立持久離線圖片快取；R2 bucket 私有，不經共用的 HTTP bytes 快取繞過 ACL。瀏覽器快取不保證離線可用。詳見 [題圖重驗快取](./IMAGE_REVALIDATION_2026-10-13.md)。頁面 noindex，站內探索不等於 SEO。
- 帳號刪除：先撤 session 與 grants；owner 需先轉交集合或刪集合；移出作為 contributor 的題目與共用層；清理本人私人根及本人 saved；其他人的 snapshots 及題圖保留，來源身分匿名化。
- user ID 重用不得恢復舊授權：account_instance_id、刪除中狀態及離線隊列一起檢查；匿名 tombstone 不保留 Google sub 或 email。
- 平台隔離有獨立授權／稽核／處理入口；普通建立者不能使用它收回已下載內容。

## 11. 目前程式草稿與 v2 的必要差異

**變更 [C18]：下列為待修改，不是已完成。不得直接部署工作樹中的 v1 草稿。**

| 檔案／模組 | 已存在的草稿或現況 | 必要變更 |
| --- | --- | --- |
| worker/migrations/0002_sharing_collections.sql、worker/schema.sql | publication_revisions、saved_versions、saved_workspaces 單 seq；source 限集合 owner | 依 §8 重整未部署 migration；live item、contributor、shared_layers、saved_snapshots、穩定 personal_workspace、draw/notes 獨立 seq |
| worker/routes/collections.ts | authoredCollection 限 owner；加入 owner 原題；明確建立／更新發布 revision | 共用 ACL 能力、contributor 自有原題、live DTO、source 預覽與不可換圖、成員退出清理、shared layer 路由；移除 per-entry 發布 API |
| worker/routes/saved.ts | 指向 publication revision；workspace 隨 revision；select-revision | 下載時計算 snapshot；refresh-source 保留 workspace；畫筆／文字各自 CAS；保留 source metadata 與私人 metadata 邊界 |
| worker/routes/subscriptions.ts | 新題與授權骨架 | 逐一核對高水位交易、source/provider 即時失效、多人來源、變動不計新題；目前未完整驗收 |
| worker/services/collectionAccess.ts | owner/viewer/link 讀權骨架 | contributor、personal collection 限制、共用層 mask、失效來源及多重有效授權 |
| worker/routes/problems.ts | 新增資產登記及刪除引用草稿；舊 draw 用 Math.max；metadata 直接覆寫 | 刪原題停止所有 live entries；draw/notes 獨立 CAS、tags 增刪；共用來源欄位白名單；預設上傳目的地 |
| worker/services/assetGc.ts、worker/index.ts、wrangler.jsonc | 已新增簡單 GC 與 cron 草稿 | 補足根關聯、寬限、回填對帳、feature gate、工作重試／觀測；驗收前不得啟用物理刪除 |
| worker/routes/shares.ts | 舊 token 直接讀原題、runtime ALTER TABLE、DTO 含私人 status | 保留 token 期限／唯讀契約；移除 status 洩漏與 runtime migration；舊連結不暗中取得新型持久存入權 |
| src/types、API adapters、useProblemActions、offlineStorage | 仍以原有私人題目流程為主 | 判別來源與工作區；來源更新不覆蓋 personal；帳號隔離本機草稿；新入口尚未完成 |
| Sidebar／StudyView／ProblemCard／Navbar／App | 新功能 UI 尚未接入 | 共用呈現元件、獨立 counts；新路由／來源徽章／作者集合篩選／共享層／兩選項更新／預設目的地 |

既有 legacy `/share/:token` 維持活原題、到期及展示設定；新單題依 Q01–Q11 使用獨立固定版本及 bearer token。來源集合 ACL 與單題分享授權分開；不把單題連結變成訂閱或集合授權。

恢復實作順序：先以實際遠端 migration 狀態確認 0002 未部署才可重寫；若已被執行過，另建 migration 修正，不重寫已部署歷史。此文件修訂未執行任何遠端 migration。

## 12. 第一階段交付、驗收及不支援項目

**變更 [C19 C20]：協作不再延後到第二階段。**

| 階段 | 交付 | 必要門檻 |
| --- | --- | --- |
| A | v2 schema、固定原圖、ownership、資產根、回填、ACL／快取 | 舊功能相容；原題刪除及已存圖保護；GC dry-run 無誤 |
| B | 建立者＋多人貢獻、live 集合、邀請、成員撤銷、預設上傳目的地 | 加題／撤權競態及部分上傳失敗可恢復；來源更新不需發布 |
| C | 共用層、讀者展示、獨立 seq、私人隔離 | 互看而不互寫；同欄位衝突不丟資料；可見範圍明確 |
| D | 訂閱／新題／分類／探索／管理及舉報 | 標記已看一致；source/provider 撤銷即失效；公開查詢無私人欄位 |
| E | 下載 snapshot、refresh-source、個人作業、個人系統集合／KPI | 來源刪除仍可讀；更新只換來源；所有個人訂正與分類保持 |
| F | UI 串接、PWA／guest 回歸、實機驗收、部署與 GC | A～E 全門檻滿足；先 migration／回填再 feature flag；物理 GC 最後啟用 |

驗收帳號：建立者 A、貢獻者 B/C、一般訂閱者 D、無權 E、訪客；B 第二裝置；手機 Chrome/Safari、iPad、PWA。

| 群組 | 必測行為 |
| --- | --- |
| 權限 | 三種 visibility；owner≠provider；viewer 不能加題；contributor 不能加別人原題；匿名不能写；多重 grant 撤一保另一；所有圖片路由一致 |
| Live source | 改標題／來源分類／標籤直接反映；無更新發布按鈕；AI 更新不算新題；私人筆記不曝光；換圖 API 拒絕 |
| 成員 | 移除 contributor 立即停止其 source/layer 讀取；其他人的層不誤刪；重入不復活；退出者仍可取回本人筆記 |
| 共用層 | B/C 各寫自己的層且互見；不能修改對方；訂閱者 mask；展示開關影響現有層；不同集合不串筆記 |
| 下載 | mask／身份於交易重驗；來源與參考層一致；撤權和下載先後決定結果；已存圖片與文字不受作者撤銷影響 |
| 更新來源 | 只替換 snapshot；workspace ID、draw、notes、geometry、分類／標籤／狀態不變；來源無權不能更新；更新失敗保留舊 snapshot |
| 同步 | draw/notes 獨立不互衝；同一欄位舊裝置寫入 409；本機草稿可取回；離線重播不跨帳號；標籤增刪不掉其他標籤 |
| 預設上傳 | 單次覆寫不更改偏好；上傳成功加入失敗可重試且不重傳圖；目的地撤權；guest／離線不暗中公開 |
| 訂閱 | 新加入舊題算新；修改／排序不算新；高水位競態；單題失效不連累集合；取消訂閱不刪已存 |
| 個人題庫 | owned＋saved KPI；未存訂閱不混入；提供者可按非本人建立集合篩原題；公開徽章與 draft/suspended 區分 |
| 回收／撤銷 | source delete 停止 live；snapshot 根保圖；refresh 釋放舊根；最後根消失才 GC；R2/D1 部分失敗；孤立筆跡／封面對帳 |
| 上線相容 | 舊 share token／status 隱私、guest 選檔／縮圖／右上刪除、CSS hash 缺檔 404、API 不回 SPA、舊前端對新後端、FK 與回填重試 |

第一階段不支援清單（MUST NOT 顯示可用入口）：既有題換圖／裁切；匿名寫入；同稿同圖層多人改寫；貢獻者修改他人原題；他人私人題庫瀏覽；下載題再公開；自動發布私人筆記；版本發布／逐題發布更新；歷史來源版本切換；已存題永久自動同步；跨集合自動去重；一次下載整套；主動推播／email；外部 SEO；可靠持久離線題圖；普通標籤自動變共用 ACL；特殊教師角色；轉讓已下載保留權。

## 13. 執行及參考

- 本版只修訂規格及進度；既有程式草稿未因此完成、未部署。實作恢復前依 §11 清理與驗證，不以 tsc 成功代表權限／交易成立。
- 本規格引用平台資料作實作參考；實際 API／限制於實作時核對版本：[D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)、[R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)。
