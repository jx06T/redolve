# 題圖重驗快取與探索載入

## 已修復

- 原因：所有題圖 `no-store`，全域 middleware 也再次覆寫成 `no-store`；探索題卡又等待全部參考筆跡後才建立 img。
- 上傳、集合（探索／延伸／共用）、存入、新舊單題分享圖片統一走 `authorizedImage`。使用 `private, no-cache`、R2 `httpEtag`、`Vary: Cookie, Authorization`。
- 每次請求仍先檢查當前登入／ownership／集合觀看權／entry 狀態／資產可用狀態／分享期限。檢查通過才做 R2 conditional GET；未變更回 304，不取回圖片 body。更新的 R2 內容回 200 與新 ETag。
- middleware 僅讓已驗權的 200／304 圖片保留此策略；其他 API、筆記、JSON、拒絕和錯誤仍 no-store。不使用 Cloudflare 公共快取、Cache API 或 SW 持久離線圖片快取。
- 原題圖片端點解析 assets.storage_key，並拒絕隔離／刪除中的資產；相容未註冊的舊原圖 key。
- 探索／延伸題圖與明細、參考筆跡並行載入，metadata 完成不替換 img。圖片失敗後重試建立新 img；重驗明細失去權限時移除已顯示圖片。

## 成效與邊界

- 實際瀏覽器（沒有 Playwright route 攔截）三次新頁載圖：200／304／304，圖片 body bytes 為 68／0／0。這是合成 PNG 功能測試，非正式環境速度測量。
- 節省重複圖片下載與 R2 body 取得。驗權、資料列表、明細與筆跡請求仍存在；本次不宣稱消除 D1 查詢或所有切頁延遲。
- 題圖是否留在瀏覽器快取、何時清除由瀏覽器決定；無痕、儲存不足、強制重新整理或關閉快取可能仍完整下載。
- 沒有離線可用承諾。撤權影響新的讀取，不可能收回已顯示的畫面、截圖或另外下載的內容。已存入的固定版本仍按本人 ownership 服務，不重新依賴原集合權限。

## 驗證與發布

- `tests/image-revalidation.test.mjs`：全 Worker＋D1＋R2；五種圖片路由、強／弱／多值 ETag、萬用條件、更新、切換帳號、撤權、下架、移除題目、隔離資產、遺失檔案、分享過期、已存版本保留及 JSON no-store。
- 同測試可設定 `IMAGE_CACHE_BROWSER_URL_FILE` 啟用 localhost 瀏覽器測試代理，實際 HTTP cache 成功回 304；撤下公開存取後回 404，img 載入失敗。代理只存在測試環境。
- `tests/external-image-loading.browser.py`：390／1280px 題圖先於未完成的筆跡、metadata 完成不重抓題圖、錯誤重試與失權重驗移除圖片。
- 原有單題分享、共用原題同步、TypeScript、正式建置／SW、PWA 回歸。
- 無 migration、secret、binding 或 Cloudflare 快取規則設定。推送後走既有自動部署；第一次成功載圖後才會有新 ETag 快取。實體 iPhone／iPad 和正式速度仍待驗收。

## 依據

- [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)：no-cache 允許儲存但重用前要求驗證。
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)：conditional GET 與 httpEtag。
