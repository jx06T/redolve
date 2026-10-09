# 2026-10-09 發布複核

## 範圍

- 原未推送提交 `2f44fe2`：共用集合／訂閱 v2、分享 schema、權限路由、存入與來源更新、管理端資產掃描及前端入口。
- 本次工作樹：搜尋三個範圍與離線帳號隔離、FTS metadata 更新、shared notes 可見性、D1 稽核 SQL、GCP Placement、畫筆與匯出共用參數、圖片多選、草稿收合高度、文件。
- 已閱讀上述差異及關鍵流程，完成下列可重現驗證。此複核不代表正式 R2 全量對帳、實機驗收或外部安全稽核已完成。

## 修復與判定

| 範圍 | 結果 |
|---|---|
| 圖片匯入 | 移除 iOS 單選限制，所有檔案選擇器啟用 multiple；一次多選與再次加選都加入同一清單，保留直接原生 input、縮圖預覽及獨立刪除按鈕。 |
| 草稿高度 | 收合改成卡片檢視狀態，不存入 0 或重設預設高度；展開恢復原自訂高度。調整高度沿用最近尚未完成防抖存檔的 draw data，避免捨棄新筆跡；保存 baseWidth，讓跨寬度換算一致。 |
| 畫筆匯出 | 稽核原既存 DrawCanvas／exportImage／strokeOptions 修改後納入提交：共用實際畫筆尺寸、pressure thinning、透明度及平滑參數，修正匯出筆寬與畫面不一致。 |
| 搜尋 | mine＝本人原題及固定已存版本；shared＝目前可讀的相關集合／指定集合；public＝啟用且列入探索的公開集合與題目。訂閱不是觀看授權，撤權即排除來源；已存版本仍在 mine。公開結果不含私人筆記、私人課綱、OCR 或共用筆記。 |
| FTS | 合併歷史重複列，保留最新 OCR；更新 metadata 時與題目 mutation 一同 batch；搜尋現行 metadata，避免舊索引誤命中或未索引題目被漏掉。 |
| 共用層 | 可見文字與筆跡分別驗權；只顯示 notes 時，不因隱藏 ink 而把整層漏掉。 |
| D1 稽核 | 七個 UNION 分支改為七條獨立 SELECT；指南以單行 --command 執行並讀到 count，避免遠端 --file 只有匯入統計。 |
| Worker 配置 | 保留使用者驗證有效的 gcp:asia-east1；保留既有持久 logs/traces 關閉設定，指南提供 tail 除錯。 |
| 文件 | 清除發布指南的舊 migration／再次推送步驟，改成此次部署後操作；README 的歷史 bookmark 移至指南的不用執行紀錄，保存原值。 |
| iPad／手機刻意設計 | viewport、底部 nav 貼齊、Logo 操作及快捷鍵等既有決策不需修改，本次未變更。 |

## 驗證

- TypeScript 型別檢查。
- Miniflare／D1／R2：分享 API、多人 ACL、搜尋範圍與撤權、固定下載版本、guest 離線搜尋隔離。
- SQLite：migration 與回填、七項獨立稽核及 compound SELECT 上限回歸。
- Production build → SW 資產 hash → PWA 發版回歸；Worker dry-run。
- 無頭 Edge＋正式建置＋合成 API：iPhone UA 一次選 2 張、再加 1 張、預覽不刪除、個別刪除；非預設 850px 草稿三次收合／展開不寫入資料，桌面轉 390px 保持比例，調整高度後重新整理仍恢復，舊筆跡不變。
- 發布指南的 schema 表數／欄位查詢及 PowerShell 指令解析。

## 正式環境待使用者執行

依 [SHARING_RELEASE_RUNBOOK.md](SHARING_RELEASE_RUNBOOK.md) 順序確認自動部署、schema、晚到上傳回填、7 項 D1 稽核、管理端 D1/R2 完整掃描，以及 iPhone Chrome／iPad Safari／PWA 與真實帳號的功能驗收。

本次沒有遠端 D1／R2 寫入或刪除，沒有執行 Time Travel restore，沒有新增 secret。實體圖片 GC 保持關閉。
