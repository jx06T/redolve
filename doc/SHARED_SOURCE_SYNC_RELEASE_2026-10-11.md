# 原題與共用作業同步發布指南（2026-10-11）

## 實作語意

- 自己貢獻的原題：集合內作者筆跡、筆記與原題同一份；完成／取消完成／封存／還原同步原題，跨集合一致。
- 他人原題：我的共用筆跡／筆記仍是獨立層；我的進度只修改本人 collection_item_progress，不改公開內容或作者進度。舊作者獨立共用進度不回灌原題；作者以既有原題狀態為準。
- 共用中側欄與搜尋篩選提供「只看其他人貢獻」。
- 一般觀看者由集合展示開關控制筆跡／文字各別可見；有效貢獻者可互看作者作業。所有既有集合套用這個新規則。
- 舊獨立作者作業保留為「舊共用作業」唯讀參考，筆跡預設隱藏、可自行開啟，避免與原題筆跡重疊；不搬移至原題。舊版獨立共用目標的未同步草稿不自动套用，可在設定取回本機草稿。 作者共用寫入要求 source_item_id 與 generation，舊客戶端回 SOURCE_TARGET_CHANGED（409），先保留草稿並重新載入。
- 存入／更新來源時，授權的來源筆跡保存在新的 R2 JSON 資產並建立 saved_draw 引用；已存内容不跟著 live 原題變動。私人 workspace 永遠獨立。
- 更新／刪除已存版本後的無引用資產由既有稽核／GC 流程管理；本輪不開啟實體資產自動刪除。

## 發布前：使用者需執行

前置：正式 D1 已完成 0002、0003、0004。此版本另外需要 0005、0006；不需要新增 secret／binding。尚未確認正式庫已套用這兩份，不可直接推送部署。

在專案根目錄執行（使用安裝的 Wrangler）。不要重跑整份 schema.sql，也不要對既有庫直接重跑 0006 的兩條 ALTER。

```powershell
Set-Location D:\Document_J\redolve

# 已完成 0005 可跳過這一段；未完成／不確定時依此重跑（0005 可重複）。
node .\node_modules\wrangler\bin\wrangler.js d1 time-travel info redolve-db
if ($LASTEXITCODE -ne 0) { throw '無法取得正式 D1 bookmark；停止' }
# 保存 current bookmark。
node .\node_modules\wrangler\bin\wrangler.js d1 execute redolve-db --remote --file=.\worker\migrations\0005_shared_search_cache.sql
if ($LASTEXITCODE -ne 0) { throw '0005 失敗；停止部署並保留輸出' }

# 唯讀檢查 0005 前置完整性與 0006 目前狀態。
& .\scripts\apply-shared-source-sync.ps1 -CheckOnly
# 0005 前置不符、7403 或其他例外時停止；先處理例外，不續跑。

# 先顯示新的 Time Travel bookmark；只補缺少欄位，安裝觸發器並驗證。
& .\scripts\apply-shared-source-sync.ps1
& .\scripts\apply-shared-source-sync.ps1 -CheckOnly
```

最終必須顯示：`progress_seq=1，previous_status=1，source_triggers=2，schema_version=2`。腳本同時要求 0005 的 3 張表、28 個 trigger、ready=1、missing_versions=0。

CheckOnly 數字為 0 表示尚未安裝。安裝中斷可再次執行腳本：逐欄檢查避免重複 ALTER；完成後重跑不寫入。不要使用 `d1_migrations` 的存在與否判斷本專案手動執行的 migrations。

Wrangler 原生輸出異常或 exit code 非 0 時保留原始輸出。7403 請用相同 CLI 的 whoami 檢查帳號；OAuth 重新 login，API Token 確認 account／D1 權限。

**完成上述 schema 驗證後才依核准的 Git 推送觸發自動部署。** 本轮沒有執行遠端 migration、推送或手動部署。

## 本地

停止本地 Worker，執行下列命令（僅 .wrangler/state；既有本地 D1 先備份）：

```powershell
node .\scripts\init-local-db.mjs
if ($LASTEXITCODE -ne 0) { throw '本地初始化失敗；停止' }
node .\scripts\init-local-db.mjs --check
if ($LASTEXITCODE -ne 0) { throw '本地 schema 未就緒；停止' }
npm run worker:dev
```

## 部署後實機驗收

1. 一張已有筆跡／筆記的原題加入集合；共用中直接顯示原有作業，不變成空白。
2. 在原題及共用中交替書寫、打字，重整後一致；再把同題加入第二集合，作業一致。
3. 自己貢獻題完成／取消完成／封存／還原，在我上傳與各共用集檢視一致；他人題標記只影響本人進度。
4. 「只看其他人貢獻」應排除本人題，科目大綱與搜尋結果一致；前往搜尋及返回保留範圍。
5. 一般觀看者分別測試隱藏全部、只看筆跡、只看文字；不得以來源 draw URL 繞过設定。
6. 他人存入後改原題作業，已存題保持原版本；更新來源後獲得新版本，私人訂正保留；更新預覽不應持續誤報展示範圍變更。
7. 移出題目／撤銷貢獻權後，live 題目／書寫不可讀寫，既有合法存入版本保持可用。
8. 原題修改後共用中條件清單請求應回 200 新內容；內容未變時允許 304。沒有新題通知或事件。

## 測試範圍與成本

- 本機真實 SQLite/D1、R2、完整 Worker 路由回歸涵蓋雙向作業、跨集合、獨立進度、可見性、CAS、generation、快取失效、固定來源保存與撤權。
- 桌面／手機瀏覽器使用合成 API，只驗證前端載入、寫入及篩選；不代表正式帳號或 iOS 實機已驗收。
- 原題筆跡／筆記儲存會更新參與集合的 shared_seq 與搜尋 revision；原題進度更新會增加 progress_seq 及本人在各集合的 revision，不使其他成員清單失效。這是同步及快取正確性所需的有限 fan-out。未加入任何集合的原題不產生集合版本更新。
- 共用閱讀不另外寫入 R2；只有存入／更新固定版本時新增來源筆跡資產。大量集合／高頻儲存的正式 rows_written 仍需部署後觀察。

參考：[D1 Wrangler 指令](https://developers.cloudflare.com/d1/wrangler-commands/)、[D1 batch 交易](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。
