---
name: auth-guest-permissions
description: >-
  Redolve 訪客試用模式與會員登入帳號之權限分離、限制規範、提示導引與同步機制指引。
  涵蓋零摩擦試用哲學、本機 IndexedDB 與雲端 D1/R2 雙軌架構、權限對照矩陣、
  後端限流與安全隔離、前端 UI 提示與導引元件、以及登入自動無縫同步資料流。
triggers:
  - 調整或審查訪客 (Guest) 與登入會員 (Auth) 權限邊界
  - 修改認證中介軟體 (authMiddleware / optionalAuthMiddleware)
  - 開發或維護 OfflineSyncManager 本機至雲端同步邏輯
  - 調整訪客提示橫幅 (GuestNoticeBanner)、上傳提示或 API Key 鎖定邏輯
  - 審查多租戶資料隔離與後端 API Rate Limit 機制
---

# Redolve 訪客與登入帳號權限分離、限制規範與提示機制指引

---

## 1. 核心架構理念與設計哲學

Redolve 作為專為 iPad 與學生設計的錯題複習 PWA，在身分與權限設計上採取**「零摩擦試用 (Zero-Friction Trial)」**與**「本機優先、平滑升級 (Local-First & Seamless Upgrade)」**之核心架構：

```
訪客試用 (Guest Mode)                       登入會員 (Authenticated Mode)
────────────────────────                    ──────────────────────────────
儲存層: 瀏覽器 IndexedDB                      儲存層: Cloudflare D1 (SQLite) + R2
檔案層: 本機 Blob URL (記憶體快取)            檔案層: R2 Object Storage (CDN 代理)
AI 分析: /api/problems/analyze-guest         AI 分析: 背景異步分析 (ctx.waitUntil)
識別碼: temp_* 暫時 ID                       識別碼: UUID v4 永久 ID
安全邊界: IP 限流 (20 次/分)                  安全邊界: User ID 限流 (60 次/分)
```

### 設計原則
1. **零門檻即開即用**：使用者進入應用程式後，無需強制註冊或登入即可直接上傳考卷照片、執行即時 AI 題目辨識、使用 Apple Pencil 進行向量書寫訂正，並檢視本機題庫。
2. **雙軌資料隔離**：
   - 訪客資料完全侷限於客戶端瀏覽器 `IndexedDB` (`offlineProblems` 資料庫)，不佔用伺服器儲存配額。
   - 會員資料儲存於 Cloudflare D1 與 R2，並透過 JWT 與 API Key 嚴格綁定 `user_id`，確保租戶隔離。
3. **無感平滑升級 (Seamless Upgrade)**：當訪客決定登入 Google 帳號時，系統自動啟動 `OfflineSyncManager`，將本機所有錯題、筆跡、標籤與筆記一次性無縫遷移至雲端，無需手動重新匯出或匯入。

---

## 2. 訪客 vs. 登入會員 權限對照矩陣

下表詳列 Redolve 各功能模組在訪客與登入會員身分下的支援度、資料落點與後端防護機制：

| 功能模組 / 操作項目 | 訪客試用模式 (Guest) | 登入會員 (Authenticated) | 後端端點與安全防護機制 |
| :--- | :--- | :--- | :--- |
| **題目列表載入** | 讀取本機 IndexedDB 合併資料 | 查詢 D1 資料庫，支援 Cursor 分頁 | `GET /api/problems`<br>`optionalAuthMiddleware` (未帶 Token 回傳空陣列 `[]`，不報 401) |
| **單題詳情與 OCR 文本** | 從記憶體與 IndexedDB 讀取 | 從 D1 讀取並校驗擁有者身分 | `GET /api/problems/:id`<br>`GET /api/problems/:id/text`<br>`authMiddleware` (非擁有者且未被分享回傳 403 Forbidden) |
| **題目圖片載入** | 瀏覽器 `blob:` URL 快取 | 經 Worker 串流 R2 私有圖檔 | `GET /api/problems/:id/image`<br>`optionalAuthMiddleware` (校驗 JWT / `?auth=` Token / 分享 Token) |
| **錯題上傳與儲存** | 本機 IndexedDB 暫存 (ID: `temp_*`) | 存入 R2 圖檔與 D1 結構化記錄 | 訪客：走本機 IndexedDB + 訪客分析 API<br>會員：`POST /api/problems` (`authMiddleware`) |
| **AI 自動分類與打標** | 呼叫訪客即時分析 API (無狀態) | 背景非同步打標 (`ctx.waitUntil`) | 訪客：`POST /api/problems/analyze-guest`<br>會員：`POST /api/problems` |
| **手動重新 AI 分析** | 提取本機 Blob 重新呼叫訪客分析 | 讀取 R2 圖檔重新呼叫 Gemini AI | 訪客：前端 `useProblemActions` 攔截轉訪客 API<br>會員：`POST /api/problems/:id/analyze` (`authMiddleware`) |
| **手寫筆跡繪製與儲存** | 前端 Zustand 內存狀態暫存 | D1 向量時鐘樂觀鎖更新 (`draw_data`) | `PATCH /api/problems/:id/draw`<br>`authMiddleware` (支援協同分享者 `allow_ink=1` 寫入) |
| **題目訂正狀態切換** | 前端 Zustand 狀態樂觀更新 | D1 更新 `status` 與累加複習次數 | `PATCH /api/problems/:id/status`<br>`authMiddleware` (`unsolved` / `resolved` / `archived`) |
| **文字筆記與標籤編輯** | 前端狀態更新 + IndexedDB 標籤持久化 | D1 更新欄位並同步 SQLite FTS5 索引 | `PUT /api/problems/:id`<br>`authMiddleware` (自動更新 `items_fts`) |
| **題目刪除** | 清除 IndexedDB 記錄並釋放 Blob URL | 批次刪除 R2 物件、D1 資料、FTS5 與 Shares | 訪客：本地清理<br>會員：`DELETE /api/problems/:id` (`authMiddleware`) |
| **iOS 捷徑 API Key 管理** | 禁止使用 (鎖定並引導登入) | 建立、檢視遮罩、撤銷 `rdv_...` 金鑰 | `GET/POST/DELETE /api/keys`<br>`authMiddleware` (嚴格禁止訪客存取) |
| **自訂課綱科目與單元** | 僅支援讀取官方 108 課綱 Seed | 自由新增、重新命名、刪除個人自訂節點 | `POST/PUT/DELETE /api/taxonomy`<br>`authMiddleware` (寫入帶有 `user_id` 之自訂節點) |
| **生成題目公開分享連結** | 不支援 (本機未上傳圖檔無法對外分享) | 建立唯讀或協同筆跡分享短連結 | `POST /api/problems/:id/share`<br>`authMiddleware` (產生 `st_...` 分享 Token) |
| **檢視他人公開分享題目** | 允許 (免登入即可瀏覽分享之題) | 允許 (免登入即可瀏覽分享之題) | `GET /share/:token`<br>`GET /share/:token/image` (公開公開路由，校驗過期時效) |
| **跨裝置即時同步** | 不支援 (限於當前瀏覽器環境) | 支援 iPad、Mac、iPhone 跨裝置同步 | 雲端 D1 + R2 + Google OAuth Session |
| **進度儀表板統計** | 前端彙整 IndexedDB 本機題數與分類 | 後端 D1 SQL 聚合運算與 Top 3 弱點分析 | `GET /api/dashboard`<br>`optionalAuthMiddleware` (訪客回傳零值，由前端完成合併計算) |
| **全站全文檢索** | 前端過濾當前已載入題庫 | SQLite FTS5 全表 MATCH + LIKE 加權評分 | `GET /api/search`<br>`authMiddleware` (未登入者僅能使用前端頁面內搜尋) |

---

## 3. 限制規範與防護機制 (Restrictions & Rate Limits)

### 3.1 訪客模式之具體限制

1. **資料揮發性風險**：
   - 題目圖檔以 Blob 形式儲存於瀏覽器記憶體與 IndexedDB。
   - 使用者若清除瀏覽器快取、使用無痕模式關閉分頁、或更換裝置，本機試用資料將遺失且無法復原。
2. **功能鎖定範圍**：
   - 無法產生 iOS 捷徑專用 API Key (`rdv_*`)。
   - 無法於雲端持久化自訂的學科分類或課綱單元。
   - 無法對他人生成題目公開分享連結。
   - 無法使用 SQLite FTS5 雲端全文檢索。
3. **訪客 AI 請求頻率限制 (IP-based Rate Limit)**：
   - 後端對 `/api/problems/analyze-guest` 採取基於 IP 之固定視窗 (Fixed Window) 計數：
     - **上限**：每分鐘最多 **20 次** 辨識請求 (`GUEST_RATE_LIMIT = 20`)。
     - **超出限制**：回傳 HTTP 429 (`TOO_MANY_REQUESTS`，訊息：「訪客分析頻率過高，請稍後再試」)。
   - **單檔限制**：最大 15MB (`PAYLOAD_TOO_LARGE`)，格式限 JPEG、PNG、WebP、HEIC、HEIF。

### 3.2 登入會員之規範與限制

1. **會員上傳頻率限制 (User-based Rate Limit)**：
   - 後端對 `/api/problems` 採取基於 `user_id` 之固定視窗計數：
     - **上限**：每分鐘最多 **60 次** 上傳請求 (`UPLOAD_RATE_LIMIT = 60`)。
     - **超出限制**：回傳 HTTP 429 (`TOO_MANY_REQUESTS`，訊息：「上傳頻率過高，請稍後再試」)。
2. **多租戶資料庫安全隔離**：
   - 所有的 D1 查詢與變更操作（SELECT、UPDATE、DELETE）均強制綁定 `WHERE user_id = ?`，杜絕任何橫向越權存取漏洞 (IDOR)。
3. **R2 儲存路徑隔離**：
   - 圖片物件路徑強制採用命名空間隔離：`images/${userId}/${problemId}.jpg`，防止不同使用者之間檔案路徑衝突或未授權覆寫。

---

## 4. 前端提示、警告與導引機制 (UI Prompts & Hints)

為了提供清楚的使用者體驗，系統在各關鍵操作節點設置了對應的提示橫幅、標籤與對話框：

### 4.1 全站頂部提示橫幅 (`GuestNoticeBanner`)

- **觸發位置**：進度儀表板 (`DashboardView`)、刷題學習頁面 (`StudyView`) 頂部。
- **呈現條件**：使用者未登入 (`!currentUser`) 且未於當次 Session 關閉提示。
- **UI 特色**：柔和淡粉紫色系 (`bg-primary-50/70`、`border-primary-200/60`)，符合 Redolve 設計系統。
- **提示文案**：
  > **本機訪客試用模式 (未登入)**
  > 手寫筆跡與刷題紀錄僅暫存於本機。登入 Google 帳號即可免費啟用 iPad / Mac 跨裝置雲端同步與 iOS 截圖一鍵傳送。
- **互動行為**：
  - 點擊「登入 / 註冊」：開啟 `AuthModal`。
  - 點擊「關閉 (X)」：狀態儲存於 `sessionStorage.setItem('redolve_guest_banner_dismissed', 'true')`，於當前工作階段不再干擾。

### 4.2 頂部導航列身分狀態 (`Navbar`)

- **桌面版 (Desktop)**：
  - 未登入時：於導航列顯眼位置顯示「登入 / 註冊」CTA 按鈕。
  - 身分按鈕：大頭貼呈現「訪」字標章，副標題顯示「訪客試用」。
- **行動版抽屜選單 (Mobile Drawer)**：
  - 抽屜選單頂部常駐訪客橫條：「訪客試用模式 — 登入以同步多裝置資料」，並附帶快捷登入按鈕。

### 4.3 錯題批次上傳彈窗提示 (`UploadModal`)

- **彈窗內橫條**：
  > 訪客上傳之錯題僅暫存於此瀏覽器。登入 Google 帳號可自動備份至雲端。
- **上傳成功 Toast 回饋**：
  - **訪客模式**：`成功儲存 N 張錯題至本機！登入後將自動備份並進行 AI 解析。` (持續 5 秒)
  - **會員模式**：`成功批次上傳 N 張錯題！AI 正在背景自動打標中...` (持續 4 秒)

### 4.4 iOS 捷徑金鑰管理鎖定 (`ApiKeySettingsSection`)

- **鎖定警示橫幅**：
  - 標題：`iOS 捷徑金鑰需綁定雲端會員帳號`
  - 說明：`iOS 截圖一鍵傳送捷徑會將照片自動歸屬到您的個人帳號。目前您處於訪客試用模式，請先登入 Google 帳號以取得專屬 API Key。`
  - 行動按鈕：「登入 Google 帳號以啟用金鑰」（點擊直接觸發 `AuthModal`）。
- **表單攔截**：訪客若在輸入框嘗試點擊「生成 Key」，會被前端直接攔截並開啟登入對話框。

### 4.5 身分管理與功能比較表 (`AuthModal`)

當訪客點擊登入或身分管理按鈕時，`AuthModal` 呈現清晰的功能差異對照表：

| 功能項目 | 訪客試用 | 登入會員 |
| :--- | :--- | :--- |
| **Apple Pencil 向量書寫與草稿** | 本機暫存 | 雲端永久備份 |
| **iPad / Mac / iPhone 跨裝置同步** | 不支援 | 即時同步 |
| **iOS 截圖一鍵傳送捷徑 (API Key)** | 不支援 | 專屬金鑰 |
| **高中學測・分科課綱章節篩選** | 支援 | 支援並記憶偏好 |

底部提供「使用 Google 帳號一鍵登入 / 免費註冊」按鈕，說明「登入僅讀取基本公開個人檔案與 Email，不存取任何額外隱私資訊」。

---

## 5. 本機至雲端無縫同步機制 (Offline-to-Cloud Sync)

當訪客透過 Google OAuth 完成授權並取得 JWT Token 時，系統會自動將本機所有的錯題資料遷移至雲端帳號。

### 5.1 同步流程圖

```
[使用者點擊 Google 登入]
          │
          ▼
[Google OAuth 回呼完成 → 儲存 JWT Token 到 localStorage]
          │
          ▼
[useStore.setCurrentUser() 觸發]
          │
          ├─ 判定: wasGuest && isNowLoggedIn ?
          │
          ▼ (是)
[啟動 OfflineSyncManager.syncToCloud()]
          │
          ├─ 1. 從 IndexedDB 讀取所有 offlineProblems
          │
          ├─ 2. 遍歷每一道題目:
          │      a. 將 File 物件包裝並呼叫 POST /api/problems
          │      b. 帶入已預解析之 tagResult (避免重複消耗 AI 額度)
          │      c. 取得雲端生成的正式 UUID (newCloudId)
          │      d. 若本機有筆跡 (draw_data) → 呼叫 PATCH /api/problems/:id/draw
          │      e. 若本機狀態有變更 (resolved/archived) → 呼叫 PATCH /api/problems/:id/status
          │      f. 若本機有打字筆記 (typed_notes) → 呼叫 PUT /api/problems/:id
          │      g. 從本機 IndexedDB 刪除該筆暫存記錄
          │      h. 釋放對應的 URL.revokeObjectURL 記憶體
          │      i. 從 store 移除 temp_* 項目防止畫面重複
          │
          ▼
[同步完成] 彈出成功 Toast：「已成功將 N 張本機錯題同步至雲端並自動解析！請重新整理頁面。」
```

### 5.2 資料整合與暫時 ID 規則

1. **暫時 ID 前綴**：本機未上傳項目一律以 `temp_${timestamp}_${random}` 命名。
2. **前端統一 Hook**：
   - 讀取端點由 `useProblems` 統一整合，自動依據目前身分決定是否合併 IndexedDB 與雲端項目。
   - 變更操作由 `useProblemActions` 統一抽象，依據 ID 是否為 `temp_*` 判斷是執行本機 IndexedDB 變更或呼叫雲端 REST API。
3. **登出處理 (Logout)**：
   - 當會員點擊登出時，`OfflineSyncManager.clearOfflineData()` 會主動清空本機暫存並釋放 Blob URL，確保不會有前一位使用者的快取殘留在瀏覽器中。

---

## 6. 後端認證中介軟體實作細節

後端透過 `worker/middleware/auth.ts` 集中管理所有身分識別邏輯：

### 6.1 憑證解析順序 (`resolveAuthCredentials`)

Worker 會依據下列優先順序自動解析請求者身分：
1. **API Key 驗證**：檢查 `Authorization: Bearer rdv_*` 標頭，比對前 8 碼 `key_prefix` 後透過 `bcrypt.compare` 校驗 `key_hash`。
2. **JWT Session 標頭**：檢查 `Authorization: Bearer <JWT_TOKEN>`，使用 `verify(token, secret, 'HS256')` 解碼使用者資訊。
3. **Session Cookie**：檢查 `Cookie: rdv_session=<JWT_TOKEN>` 標頭。
4. **URL Query Param**：檢查 `?auth=<JWT_TOKEN>`（主要用於 `<img>` 標籤與媒體串流直接讀取）。

### 6.2 中介軟體區分

- **`authMiddleware` (嚴格保護)**：
  - 若無法解析有效之 `userId`，立即拒絕請求並回傳 `HTTP 401 Unauthorized`：
    ```json
    {
      "status": "error",
      "error": "Unauthorized",
      "message": "未提供有效之授權憑證或 Token 已過期！請重新登入或提供正確的 Bearer Token / API Key"
    }
    ```
  - 套用端點：`POST /api/problems`, `PUT/DELETE /api/problems/:id`, `PATCH /api/problems/:id/status`, `/api/keys/*`, `POST/PUT/DELETE /api/taxonomy`。
- **`optionalAuthMiddleware` (可選認證 / 訪客友善)**：
  - 無論是否具備憑證均放行，將解析到的 `userId` 注入至 Context (`c.get('userId')`)。
  - 套用端點：`GET /api/problems`, `GET /api/dashboard`, `GET /api/taxonomy`, `POST /api/problems/analyze-guest`。

---

## 7. 相關檔案與實作對照清單

### 前端關鍵檔案
- 提示橫幅元件：[`src/components/GuestNoticeBanner.tsx`](file:///d:/Document_J/redolve/src/components/GuestNoticeBanner.tsx)
- 身分管理彈窗：[`src/components/AuthModal.tsx`](file:///d:/Document_J/redolve/src/components/AuthModal.tsx)
- 批次上傳彈窗：[`src/components/UploadModal.tsx`](file:///d:/Document_J/redolve/src/components/UploadModal.tsx)
- API Key 管理：[`src/components/settings/ApiKeySettingsSection.tsx`](file:///d:/Document_J/redolve/src/components/settings/ApiKeySettingsSection.tsx)
- 本機同步管理員：[`src/services/OfflineSyncManager.ts`](file:///d:/Document_J/redolve/src/services/OfflineSyncManager.ts)
- 本機 IndexedDB 封裝：[`src/services/offlineStorage.ts`](file:///d:/Document_J/redolve/src/services/offlineStorage.ts)
- 題目列表整合 Hook：[`src/hooks/useProblems.ts`](file:///d:/Document_J/redolve/src/hooks/useProblems.ts)
- 題目操作分流 Hook：[`src/hooks/useProblemActions.ts`](file:///d:/Document_J/redolve/src/hooks/useProblemActions.ts)
- 全域狀態管理：[`src/store/useStore.ts`](file:///d:/Document_J/redolve/src/store/useStore.ts)

### 後端關鍵檔案
- 認證中介軟體：[`worker/middleware/auth.ts`](file:///d:/Document_J/redolve/worker/middleware/auth.ts)
- 認證與 OAuth 路由：[`worker/routes/auth.ts`](file:///d:/Document_J/redolve/worker/routes/auth.ts)
- 題目與訪客分析路由：[`worker/routes/problems.ts`](file:///d:/Document_J/redolve/worker/routes/problems.ts)
- API 金鑰路由：[`worker/routes/keys.ts`](file:///d:/Document_J/redolve/worker/routes/keys.ts)
- 課綱分類路由：[`worker/routes/taxonomy.ts`](file:///d:/Document_J/redolve/worker/routes/taxonomy.ts)
- 分享短連結路由：[`worker/routes/shares.ts`](file:///d:/Document_J/redolve/worker/routes/shares.ts)
- 儀表板統計路由：[`worker/routes/dashboard.ts`](file:///d:/Document_J/redolve/worker/routes/dashboard.ts)
- 全文檢索路由：[`worker/routes/search.ts`](file:///d:/Document_J/redolve/worker/routes/search.ts)
