# 題目內文複製修正與發布

## 更改

- 我上傳：維持取得原題完整 OCR 文字。
- 我存入：複製目前存入版本的完整 OCR；原題變更不會自動覆蓋，明確更新來源才採用新版。
- 共用中：依集合目前存取權複製原題完整 OCR；撤權、移除題目、來源刪除後不可取得。
- 刷題及搜尋詳細檢視使用相同規則。按鈕與成功提示統一「複製題目文字」。空內文提示無文字，不替換成來源、分類、作者或個人筆記。
- 僅點擊複製才 GET 文字。一般存入題卡讀取不傳送完整內文；不增加每張題卡的文字請求。

## 正式 D1：先 migration，再推送部署

在專案根目錄 PowerShell 執行。使用專案安裝的 Wrangler；本步驟不部署。

```powershell
Set-Location D:\Document_J\redolve
& .\scripts\apply-saved-question-text.ps1 -CheckOnly
& .\scripts\apply-saved-question-text.ps1
& .\scripts\apply-saved-question-text.ps1 -CheckOnly
```

最後必須顯示 `source_text=1`。此腳本只套用 0008，要求既有共用及 0007 已完成。執行前印出 Time Travel bookmark，請保留；新增欄位後才回填。失敗停止，可重跑，不重複新增欄位。CheckOnly 只查 schema。

`legacy_text_unavailable` 是無法安全還原舊版本內文的筆數，允許大於 0：舊存入題先前沒有保存 OCR，來源已刪除或版本／題圖不同就無法回填。保留題圖、分類與個人訂正，複製時提示無文字；來源仍可存取時，可用既有「更新來源」取得新版本內文。不要把新版文字強行填入舊版。

0008 為新增可空欄位及回填，舊 Worker 可繼續服務。未完成 migration 不應部署新 Worker，否則存入／更新來源及存入內文端點會遇到缺少欄位。

## 本地 D1

停止本地 Worker 後執行；只操作 `.wrangler/state`，修改前自動備份本地 D1。

```powershell
node .\scripts\init-local-db.mjs
node .\scripts\init-local-db.mjs --check
npm run worker:dev
```

## 驗收

1. 分別於我上傳／我存入／共用中按複製，貼上到文字編輯器，確認完整題文與換行；不是來源或筆記。
2. 搜尋詳細檢視做同樣驗收。
3. 空 OCR 不寫入資訊替代文字。
4. 來源撤權後，共用題不可讀；先前已存入者仍可複製已取得版本。
5. 實體 iPhone／iPad 驗證剪貼簿權限與非同步複製。自動瀏覽器驗證使用合成 API 及剪貼簿替身，不能取代 Safari 裝置驗收。
