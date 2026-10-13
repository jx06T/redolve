# 倒數排序與 Dashboard 間距

## 操作

- 設定 → 個人檔案 → 首頁小組件 → 事件倒數：右側把手拖曳（滑鼠／觸控／筆）；亦可聚焦把手用上下鍵、Home／End 排序。放開才送一次修改，Escape 或取消觸控不送出；長清單可沿設定頁邊緣捲動。新順序立即預覽，使用既有離線佇列、帳號隔離、40 秒快取與同步機制。
- 尚未自訂：維持未結束優先、日期排序。首次調整保存目前所有有效事件的順序；後續不因日期／名稱變更移動已排序事件。新事件在既有順序後面，未排序事件間仍按日期排列。
- 刪除事件不影響其他事件順序；舊離線排序可包含本人的刪除墓碑，顯示時略過，不復活事件。排序最多 100 個 ID，不接受別人、待辦或不存在的 ID。
- 首頁完全唯讀，所有事件直接呈現。前三個文字／數字較大、各佔一行；第四個起固定三欄小卡，手機亦同。前三個日期置於名稱右側；小卡不顯示日期，完整日期保留在 title。超量只上下捲動，沒有巢狀橫向捲動或「查看所有」對話框。
- 學測預設只在編輯對話框提供灰色底線文字，不使用框線按鈕；沿用既有名稱／日期填入與儲存規則。
- Dashboard 滑頁容器覆蓋頁面左右留白，各面板再加回同樣留白。手機邊緣 8px、相鄰頁卡片間 16px；640px 起邊緣 16px、間距 32px。停妥仍與標語／統計對齊；頁數、原生滑動、草稿及面板記憶規則不變。

## 資料

- 0010：`home_widget_preferences.countdown_order TEXT NOT NULL DEFAULT '[]'`，JSON array CHECK；沒有新表／索引。原有事件與待辦不變。
- GET／PATCH preferences 回傳 ID 陣列。PATCH 以值比較，不用 JS 陣列參照比較；同欄變更回 409，重送相同順序不增加版本；顯示開關與排序可獨立合併。
- 排序時透過 json_each 查 submitted IDs 與本人事件，使用項目主鍵，不掃描完整歷史。排序衝突對話框顯示事件名稱；採用雲端排序只捨棄相關排序待送操作，保留獨立的顯示開關草稿。
- 訪客順序只存本機；登入順序存本人 D1。切帳號不混合，登入不自動合併訪客順序。

## 正式 D1：由使用者執行

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-countdown-order.ps1 -CheckOnly
& .\scripts\apply-countdown-order.ps1
& .\scripts\apply-countdown-order.ps1 -CheckOnly
```

- 最後應有 `countdown_order_column=1`。腳本先唯讀確認 0009，再取得 Time Travel bookmark、套用單一欄位、重驗；保存 bookmark。已完整套用時不重寫。
- 7403／JSON／bookmark／migration 失敗均停止。本次已補舊 schema 相容：未套用 0010 時，首頁、待辦、倒數內容及顯示開關仍可使用。排序寫入回 COUNTDOWN_SCHEMA_PENDING；前端保留本機草稿且不阻擋待辦／開關同步。完成 0010 後按「重試同步」送出排序，不需再次部署。
- 正式唯讀檢查遇到 Cloudflare 7403，未對正式 D1 寫入。請使用具有該帳號 D1 權限的 Wrangler 登入／API token 執行以上指令；勿重複套用原始 ALTER。
- 本地已套用並檢查 0010；備份 `.wrangler/local-db-backups/2026-10-12T17-29-27-155Z`。其他開發環境停止 Worker 後執行 `node .\scripts\init-local-db.mjs` 即可，勿對舊庫重跑完整 schema.sql。

## 驗證

- API：舊 schema 讀寫與明確延後排序、排序持久化、重送、跨欄位合併、順序衝突、他人隔離、無效／重複 ID、刪除墓碑。
- 瀏覽器：390／1280px、訪客／登入排序與設定／首頁重用，3 大＋固定三欄小卡、日期位置／title、排序等待 migration 時待辦及顯示開關仍能同步、首頁沒有編輯／更多入口、設定把手觸控／滑鼠拖曳、鍵盤、取消與40事件頁面捲動、灰色底線預設，待辦／離線／衝突／歷史回歸。
- 原生滑頁 390／1024px：相鄰頁間距等於兩側留白總和、停妥對齊、草稿／旋轉／帳號／頁面記憶。
- 發布腳本使用 mock CLI，驗證 CheckOnly、不重寫、bookmark 在前、失敗停止；零正式 API 呼叫。
- TypeScript、正式建置／SW、PWA。實體 iPhone／iPad、正式 migration 及跨裝置同步仍待發布後確認。
