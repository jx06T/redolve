# 隱私與服務條款實作紀錄

更新：2026-10-11

## 已完成

- 公開頁面：`/about/privacy`、`/about/terms`，訪客可閱讀；入口位於 `/about`。
- 桌面頂部導覽及漢堡選單加入「關於」；手機底部五項導覽維持現有設計。桌面導覽於 lg 顯示，較窄螢幕使用漢堡選單，避免增加入口後橫向溢出。
- 法律文件只使用標題、段落、少量粗體、灰色底線連結，沿用深淺色主題。
- AI 正文使用「第三方 AI 服務提供者」；具名供應商、用途及政策連結集中在頁尾，可隨部署變更維護，不以概括文字免除資料用途變更的告知責任。
- 服務提供者以 Redolve 維護者 jx06T 標示；使用者提供聯絡信箱 `50313tjx06@gmail.com`。
- 使用者確認 Gemini API 專案已啟用 Cloud Billing；政策依付費服務資料使用條款撰寫。不得因 Worker placement 為 gcp:asia-east1 而宣稱使用 Vertex AI 或資料僅儲存在臺灣。
- 依現有程式說明：Google OAuth、必要 Cookie、訪客 IndexedDB、帳號草稿 localStorage、靜態 PWA 快取、Gemini 圖片與分類提示、Cloudflare 儲存、Google Fonts、API 金鑰雜湊、共用與訂閱操作、管理及檢舉。
- 明確說明：訪客辨識仍會傳圖至 AI；登出不清除本機草稿；共用本人原題使用同一份筆跡與筆記；新私人集合也預設允許再分享；授權存入及獨立分享不因一般下架、移除來源或撤權自動回收。
- 不承諾自助帳號刪除、立即物理刪檔、零保留、端對端加密或永久備份。資料權利與帳號刪除採人工聯絡，依法處理個資及侵權請求。
- 2026-10-11 補充服務條款第九節：盡力維持服務正常運作並採合理維護措施；不保證上傳／儲存的圖片、筆跡、筆記及其他資料永久存在或隨時可存取，提醒不可作為唯一保存位置並自行下載／匯出／備份。保留依法不得免除的責任，不以使用者未備份一概免責。
- 免責範圍保留依法不得限制的責任；不捏造收費方案、管轄法院、回應天數或完整法遵認證。
- 關於頁同步修正兩段舊說明：本人原題共用作業同步、獨立單題持連結即可觀看。

## 待辦與維護責任

- Gemini Developer API 年齡相容性：Google 現行條款限制用於面向或可能由未滿 18 歲使用者存取的服務。本次使用者要求先不新增年齡限制／驗證；未宣稱產品符合此規則，未將家長同意寫成豁免。後續需釐清可支援高中生的供應商方案與適用條款；本次文件不解決此相容性問題。
- 維護者需持續收取聯絡信箱，依適用法律處理個資查閱、更正、停止利用、刪除與侵權申訴。手動刪除應檢查來源、已存版本、獨立分享、資產引用與備份，不只刪 users 列；不得以已有版本或資產共用為由忽略合法個資刪除要求。
- 變更 AI 專案、啟用訓練資料紀錄／回饋、新增追蹤工具或改變授權流程時，重新核對政策與實作；必要時取得同意。
- 實體資產自動清理目前未啟用；評估保存政策與自動清理需另外實作。一般題目刪除不等於立即消除所有 R2 物件。

## 核對依據

- `worker/routes/auth.ts`：OAuth 資料欄位、7 天登入 Cookie、10 分鐘流程 Cookie、登出；目前無整帳號刪除端點。
- `worker/services/ai/GeminiService.ts`、`worker/services/ai/prompts.ts`：Gemini Developer API 題圖及分類提示。
- `worker/services/questionSharing.ts`、`worker/routes/shares.ts`、`worker/routes/saved.ts`、`worker/routes/collections.ts`：固定版本、再分享授權、筆跡範圍及撤銷。
- `src/services/offlineStorage.ts`、`src/services/ownedWorkService.ts`、`src/services/ownedWorkController.ts`、`src/services/workService.ts`、`public/sw.js`、`index.html`：本機資料、靜態快取、字型。
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)：付費專案資料使用、保留及年齡條件。
- [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/)：基礎設施對使用者連線資料的處理。
- [Google Privacy Policy](https://policies.google.com/privacy?hl=zh-TW)。
- [個人資料保護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)：資料權利及告知事項。文件依實作揭露，並非個案法律意見或全面法遵審查。

## 發布

- 本次不修改 Worker、資料結構或認證流程，不需 migration。
- TypeScript、正式建置、PWA 發版檢查及法律頁／導覽的訪客瀏覽驗證完成後，依使用者授權推送既有分支，觸發現有自動部署。

## 驗證結果

- TypeScript 檢查與 Vite 正式建置通過。
- PWA 發版測試 4/4 通過，CSS／JS 與 Service Worker manifest 對應。
- `tests/legal-pages.browser.py` 通過：320／390／768／1024／1280 寬度的法律頁、About 入口、頂部與漢堡導覽、手機底部五項導覽、深色模式、聯絡連結及訪客直接存取；頁面無橫向溢出，未新增題目／集合 API 請求或寫入操作。
- `git diff --check` 通過；瀏覽器模擬驗證不代表實體 iPhone／iPad 已驗收。
