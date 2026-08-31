---
name: settings-persistence-architecture
description: >-
  Redolve 全系統狀態與設定持久化架構指引。涵蓋前端 localStorage (Zustand Persist)、
  sessionStorage、IndexedDB (離線資料與筆跡重播佇列)、URL Hash/Route 狀態同步，
  以及後端 Cloudflare D1 (SQLite + FTS5)、R2 物件儲存與 KV 快取的完整持久化邏輯與跨層同步機制。
triggers:
  - 調整或擴充 Zustand 全域持久化設定 (redolve-preferences)
  - 修改本機離線資料庫 (IndexedDB redolve_offline_db) 結構或版本
  - 調整使用者偏好、繪圖工具設定或 iPad 觸控手勢持久化邏輯
  - 修改 Cloudflare D1 表結構、FTS5 全文檢索索引或 R2 圖檔命名空間
  - 審查跨裝置資料同步、向量時鐘 (Vector Clock) 衝突解決與登入遷移資料流
---

# Redolve 全系統設定與狀態持久化架構指引

---

## 1. 持久化全景架構與分層模型

Redolve 採用**「多層次、本機優先、雲端雙軌」**的持久化架構，將應用程式中的所有設定、身分憑證、繪圖偏好、離線資料庫與雲端實體精確分流至最適儲存媒介：

```
應用程式全域狀態與設定 (Redolve State & Settings)
  │
  ├── [前端本機持久化層 (Client-Side Storage)]
  │     ├── localStorage
  │     │     ├── redolve-preferences ─── Zustand Persist (UI、繪圖工具、iPad 偏好)
  │     │     ├── redolve_auth_token ──── JWT 身分憑證 (供 API 攔截器讀取)
  │     │     └── rdv_client_id ───────── 向量時鐘客戶端唯一 UUID
  │     │
  │     ├── sessionStorage
  │     │     ├── redolve_guest_banner_dismissed ─ 訪客橫幅關閉記憶
  │     │     └── redolve_last_source ──────────── 批次上傳最後選取之年度與卷別
  │     │
  │     ├── IndexedDB (redolve_offline_db v3)
  │     │     ├── offlineProblems ─────── 訪客/離線完整錯題記錄 (Blob + Metadata)
  │     │     └── syncQueue ───────────── 離線手寫筆跡自動重播佇列
  │     │
  │     └── URL / History 狀態
  │           ├── Path: /study/:subjectId/:topicId ─── 路由與課綱視角狀態
  │           ├── Hash: #pencil, #taxonomy, #apikeys ── 設定頁分頁記憶
  │           └── Query: ?auth_token=... / ?auth=... ── 認證回呼與圖片代理 Token
  │
  └── [後端邊緣雲端持久化層 (Edge Cloud Storage)]
        ├── Cloudflare D1 (SQLite)
        │     ├── users ────────── 會員基本資料表 (Google OAuth)
        │     ├── items ────────── 錯題核心資料表 (包含 draw_data 與 vector_clock)
        │     ├── items_fts ────── FTS5 全文檢索虛擬表 (關鍵字 Token + OCR + 筆記)
        │     ├── taxonomies ───── 108 課綱官方 Seed 與使用者自訂科目/單元樹
        │     ├── api_keys ─────── iOS 捷徑專用 API Key (bcrypt 雜湊儲存)
        │     ├── shares ───────── 題目公開分享短連結與權限記錄表
        │     └── problem_shares ─ 題目協同檢視與筆記授權關聯表
        │
        ├── Cloudflare R2 (Object Storage)
        │     └── images/${userId}/${problemId}.jpg ── 私有錯題高清原始圖檔
        │
        └── Cloudflare KV / Environment Secrets
              └── JWT_SECRET, GEMINI_API_KEY, GOOGLE_CLIENT_ID/SECRET
```

---

## 2. 第一層：Zustand 偏好設定持久化 (`localStorage: redolve-preferences`)

### 2.1 儲存機制與配置
前端透過 `zustand/middleware` 中的 `persist` 中介軟體自動將使用者操作偏好同步至 `localStorage`，鍵名為 `redolve-preferences`。

實作位置：[`src/store/useStore.ts`](file:///d:/Document_J/redolve/src/store/useStore.ts)

```typescript
export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // State definitions and Actions...
    }),
    {
      name: 'redolve-preferences',
      partialize: (state) => ({
        // 篩選與導航偏好
        selectedSubjectId: state.selectedSubjectId,
        selectedTopicId: state.selectedTopicId,
        selectedStatus: state.selectedStatus,
        sidebarCollapsed: state.sidebarCollapsed,
        darkMode: state.darkMode,

        // 懸浮工具列佈局偏好
        toolbarPosition: state.toolbarPosition,
        toolbarOrientation: state.toolbarOrientation,

        // Apple Pencil 與繪圖工具偏好
        tool: state.tool,
        penColor: state.penColor,
        penWidth: state.penWidth,
        paletteColors: state.paletteColors,
        customColors: state.customColors,
        allowTouchDrawing: state.allowTouchDrawing,
        pencilDetected: state.pencilDetected,
      }),
    }
  )
);
```

### 2.2 持久化欄位詳細定義與行為

| 欄位名稱 | 型別 | 預設值 | 功能說明與持久化行為 |
| :--- | :--- | :--- | :--- |
| `selectedSubjectId` | `string \| null` | `'math'` | 目前選取的主科目 ID（如 `math`, `physics`, `all`），重整後自動維持在離開前的科目。 |
| `selectedTopicId` | `string \| null` | `null` | 目前選取的子單元 ID，若切換主科目時與子單元不匹配會自動重設為 `null`。 |
| `selectedStatus` | `'all' \| 'unsolved' \| 'resolved' \| 'archived'` | `'all'` | 題目訂正狀態篩選條件，維持使用者偏好的檢視視角。 |
| `sidebarCollapsed` | `boolean` | `false` | 桌面端側邊欄展開/收合狀態。 |
| `darkMode` | `boolean` | `false` | 深色/淺色外觀主題，變更時同步寫入 `document.documentElement.classList`。 |
| `toolbarPosition` | `{ x: number; y: number } \| null` | `null` | iPad 懸浮筆刷工具列於螢幕上的絕對座標，支援使用者任意拖曳定位並記住位置。 |
| `toolbarOrientation` | `'vertical' \| 'horizontal'` | `'vertical'` | 懸浮工具列之排列方向（垂直或水平佈局）。 |
| `tool` | `'pen' \| 'highlighter' \| 'eraser'` | `'pen'` | 當前作用中的 Apple Pencil 繪圖工具類型。 |
| `penColor` | `string` | `'#374151'` | 當前筆觸顏色 Hex 色碼（如深灰石墨 `#374151`）。 |
| `penWidth` | `number` | `2` | 預設筆觸粗細像素值（1: 細, 2: 標準, 4: 粗）。 |
| `paletteColors` | `PaletteColorItem[]` | `DEFAULT_PALETTE_COLORS` | 自訂筆刷調色盤清單，支援動態新增與刪除自選莫蘭迪色碼。 |
| `customColors` | `string[]` | `[...Hex]` | 調色盤歷史選取自訂色碼陣列。 |
| `allowTouchDrawing` | `boolean` | `true` | 防手掌誤觸 (Palm Rejection) 開關；關閉時僅允許 `pointerType === 'pen'` 繪圖。 |
| `pencilDetected` | `boolean` | `false` | 系統是否曾偵測到 Apple Pencil 硬體訊號，用於動態調整觸控策略提示。 |

---

## 3. 第二層：認證憑證與客戶端識別碼 (`localStorage` 獨立鍵)

為了讓外部 Axios/Fetch API 攔截器能以極高效率同步讀取，部分關鍵鍵值直接以原生 `localStorage` 獨立維護，不納入 Zustand 序列化物件：

### 3.1 `redolve_auth_token` (JWT Session Token)
- **用途**：儲存後端 Google OAuth 回呼簽發的 JWT 加密憑證。
- **寫入時機**：
  - Google OAuth 回呼頁面解析 URL 參數 `auth_token` 後寫入。
  - Google One Tap / Credential 驗證成功後寫入。
- **清除時機**：使用者點擊「登出」(`useStore.logout()`)，或後端回應 HTTP 401 Unauthorized 時自動清除。
- **讀取位置**：[`src/services/api.ts`](file:///d:/Document_J/redolve/src/services/api.ts) 中的 `getAuthToken()` 與 `getAuthHeaders()`，自動注入至所有請求標頭：`Authorization: Bearer <TOKEN>`。

### 3.2 `rdv_client_id` (向量時鐘節點 UUID)
- **用途**：為當前瀏覽器環境生成唯一的節點識別碼，用於向量時鐘 (`Vector Clock: { clientId, seq }`)。
- **機制**：若本機尚未存在則呼叫 `crypto.randomUUID()` 初始化並寫入；用於協同手寫筆跡衝突檢測與增量序號管理。

---

## 4. 第三層：工作階段暫存 (`sessionStorage`)

針對僅需在「當前瀏覽器分頁/工作階段」維持有效、關閉分頁後即應重設的設定，採用 `sessionStorage` 儲存：

| 鍵名 (Key) | 型別 | 預設值 | 功能說明與生命週期 |
| :--- | :--- | :--- | :--- |
| `redolve_guest_banner_dismissed` | `'true' \| null` | `null` | 記錄使用者在當前 Session 是否曾手動關閉頂部訪客提示橫幅 (`GuestNoticeBanner`)。關閉分頁後自動失效，下次造訪重新提醒。 |
| `redolve_last_source` | `string` | `'113年 全模'` | 記錄使用者在批次上傳視窗 (`UploadModal`) 最後選取的「考卷年分 + 卷別」組合字串，便於連續多次上傳時無需重複選取。 |

---

## 5. 第四層：本機離線與訪客資料庫 (`IndexedDB: redolve_offline_db`)

為了支援無網路環境下的完整錯題操作以及訪客零門檻試用，系統使用 `idb` 套件封裝了本機 IndexedDB。

實作位置：[`src/services/offlineStorage.ts`](file:///d:/Document_J/redolve/src/services/offlineStorage.ts)
資料庫名稱：`redolve_offline_db`，目前版本：`3`。

### 5.1 Object Store 1: `offlineProblems` (離線錯題本體)
- **Primary Key**：`id` (字串，格式為 `temp_${timestamp}_${random}`)
- **資料結構**：
```typescript
export interface OfflineProblem {
  id: string;             // 暫時唯一識別碼
  fileData: Blob;         // 考卷圖檔 Blob 二進位資料
  source: string;         // 來源標籤 (例如: 113年 全模)
  topicId: string;        // 課綱分類單元 ID
  timestamp: number;      // 建立時間戳記
  tagResult?: {           // AI 即時解析快取結果
    topic_id: string;
    keywords: string[];
    ocr_text?: string;
  };
}
```

### 5.2 Object Store 2: `syncQueue` (筆跡同步重播佇列)
- **Primary Key**：`id` (題目 ID)
- **資料結構**：
```typescript
interface SyncQueueItem {
  id: string;             // 題目 ID
  drawData: any;          // Vector 向量筆跡 JSON
  seq: number;            // 遞增序號
  timestamp: number;      // 佇列進入時間
}
```
- **重播機制**：透過 `initOnlineSync` 監聽瀏覽器 `window.addEventListener('online')` 事件。當連線恢復時，依序將佇列中的筆跡上傳至雲端，上傳成功即自 Store 刪除。

### 5.3 記憶體 Blob URL 快取與生命週期管理
在 [`src/services/OfflineSyncManager.ts`](file:///d:/Document_J/redolve/src/services/OfflineSyncManager.ts) 中維護靜態 `objectUrlCache = new Map<string, string>()`：
- **建立**：當渲染本機錯題時呼叫 `URL.createObjectURL(fileData)` 並快取。
- **釋放**：當題目被刪除、完成同步或使用者登出時，強制呼叫 `URL.revokeObjectURL(url)` 釋放記憶體，避免大量圖檔造成記憶體洩漏。

---

## 6. 第五層：瀏覽器路由與 Hash 狀態持久化 (URL & History)

系統利用瀏覽器 URL 作為可分享、可回溯的一級狀態持久化媒介：

### 6.1 路由路徑狀態 (`react-router-dom`)
- `/study/:subjectId`：持久化科目檢視（如 `/study/math`、`/study/physics`、`/study/all`）。
- `/study/:subjectId/:topicId`：持久化特定單元分類檢視（如 `/study/math/math-1-1`）。
- 切換科目或單元時自動更新 URL，支援瀏覽器「上一頁/下一頁」精準導航。

### 6.2 設定頁分頁狀態 (URL Hash)
實作位置：[`src/views/SettingsView.tsx`](file:///d:/Document_J/redolve/src/views/SettingsView.tsx)
- `#pencil`：手寫與筆觸偏好設定。
- `#taxonomy`：自訂科目與課綱分類管理。
- `#apikeys`：iOS 捷徑 API Key 管理。
- **雙向同步**：切換 Tab 時呼叫 `window.history.replaceState(null, '', '#tab')`，並監聽 `hashchange` 事件，重整頁面後維持於當前 Tab。

---

## 7. 第六層：Cloudflare D1 雲端關聯資料庫持久化

所有已登入會員的結構化業務資料持久化於 Cloudflare D1 (SQLite)。

資料庫結構檔：[`worker/schema.sql`](file:///d:/Document_J/redolve/worker/schema.sql)

```
+-----------------------------------------------------------------------------------+
|                                 Cloudflare D1 (SQLite)                            |
+-----------------------------------------------------------------------------------+
|  [users]               [api_keys]              [taxonomies]                       |
|  - id (PK)             - key_hash (PK, bcrypt) - id (PK)                          |
|  - email (UNIQUE)      - key_prefix            - user_id (FK -> users, NULL=Seed) |
|  - name                - user_id (FK -> users) - parent_id (FK -> taxonomies)     |
|  - created_at          - description           - label                            |
|                        - created_at            - level                            |
|                                                                                   |
|  [items]                                       [shares]                           |
|  - id (PK, UUID)                               - token (PK, st_...)               |
|  - user_id (FK -> users)                       - item_id (FK -> items)            |
|  - type ('problem'/'image')                    - user_id                          |
|  - topic_id (FK -> taxonomies)                 - allow_ink (0/1)                  |
|  - keywords, keyword_tokens                    - allow_notes (0/1)                |
|  - source (例如: 113年全模)                     - expires_at (DATETIME)            |
|  - image_url (R2 Object Key)                   - created_at                       |
|  - draw_data (向量筆跡 JSON 字串)                                                 |
|  - typed_notes (文字筆記)                                                         |
|  - status ('unsolved'/'resolved'/'archived')   [items_fts] (Virtual Table FTS5)   |
|  - review_count (複習計數)                      - id, user_id                      |
|  - vector_clock ({node, seq} JSON)             - source, keyword_tokens           |
|  - updated_at, created_at                      - typed_notes, problem_text        |
+-----------------------------------------------------------------------------------+
```

### 7.1 D1 持久化關鍵機制
1. **租戶隔離 (Multi-Tenant Isolation)**：所有對 `items`, `api_keys`, `taxonomies` 的查詢與異動一律以 `WHERE user_id = ?` 進行約束。
2. **官方課綱自動種子同步 (Seed Auto-Hydration)**：Worker 啟動或查詢分類時，若 `taxonomies` 表中官方種子數少於預期，自動執行 `ensureSeedTaxonomies(db)` 進行冪等寫入。
3. **FTS5 全文檢索同步維護**：當錯題建立、AI 打標完成或更新 `typed_notes` 時，同步寫入 `items_fts` 虛擬表，支援包含 OCR 全文在內的高效檢索。
4. **樂觀並行控制 (Vector Clock)**：`items.vector_clock` 欄位儲存 `{ node: 'client', seq: number }`，在儲存手寫筆跡時自動比對序號，防止多裝置同時覆蓋。

---

## 8. 第七層：Cloudflare R2 二進位圖檔持久化

題目原始高清圖片與手寫訂正底圖儲存於 Cloudflare R2 Bucket（Binding 名稱：`STORAGE`）。

### 8.1 命名空間與存取路徑
- **物件鍵格式**：`images/${userId}/${problemId}.jpg`
- **生命週期與刪除**：當使用者呼叫 `DELETE /api/problems/:id` 時，後端同時執行 `c.env.STORAGE.delete(item.image_url)` 與 D1 記錄刪除，達成完整清理。

### 8.2 快取標頭策略 (Cache Headers)
- **會員私有圖片存取** (`GET /api/problems/:id/image`)：
  - 標頭：`Cache-Control: private, max-age=3600`
- **公開分享題目圖片代理** (`GET /share/:token/image`)：
  - 標頭：`Cache-Control: public, max-age=86400`

---

## 9. 跨層同步機制與生命週期流轉

### 9.1 訪客升級登入：本地至雲端全量遷移 (`OfflineSyncManager.syncToCloud`)

```
[使用者於訪客模式累積 N 筆錯題與筆跡]
                   │
                   ▼ (完成 Google OAuth 登入)
[useStore.setCurrentUser 觸發]
                   │
                   ├─ 判定 wasGuest && isNowLoggedIn 為真
                   │
                   ▼
[OfflineSyncManager.syncToCloud()]
   │
   ├── 1. 讀取 IndexedDB.offlineProblems 所有項目
   │
   ├── 2. 依序上傳至雲端:
   │        a. 呼叫 POST /api/problems 上傳圖檔並帶入 tagResult
   │        b. 取得伺服器配發之 newCloudId
   │        c. 若本機有筆跡 → 呼叫 PATCH /api/problems/:id/draw 同步 draw_data
   │        d. 若本機有狀態變更 → 呼叫 PATCH /api/problems/:id/status
   │        e. 若本機有筆記 → 呼叫 PUT /api/problems/:id 同步 typed_notes
   │        f. 刪除 IndexedDB 該筆記錄並釋放 Blob URL
   │        g. 移除 store 中的 temp_* 暫存項目
   │
   └── 3. 彈出 Toast 通知：「已成功將 N 張本機錯題同步至雲端並自動解析！」
```

### 9.2 會員登出：本機暫存全面清空 (`useStore.logout`)
當會員登出時，系統執行以下持久化清理步驟：
1. `localStorage.removeItem('redolve_auth_token')`：清除 JWT 憑證。
2. `OfflineSyncManager.clearOfflineData()`：清空 IndexedDB 中的 `offlineProblems` 資料表。
3. `objectUrlCache.forEach(url => URL.revokeObjectURL(url))`：釋放所有快取的 Blob 記憶體。
4. 重設 Zustand Store 內之使用者物件為 `null`，重返乾淨訪客狀態。

---

## 10. 持久化鍵值與欄位總覽速查表

| 持久化層級 | 媒介 / 技術 | 鍵名 / 資料庫欄位 | 資料格式 | 負責元件 / 模組 |
| :--- | :--- | :--- | :--- | :--- |
| **全域偏好** | `localStorage` | `redolve-preferences` | JSON Object | `src/store/useStore.ts` (Zustand Persist) |
| **身分憑證** | `localStorage` | `redolve_auth_token` | String (JWT) | `src/services/api.ts`, `AuthModal` |
| **節點識別** | `localStorage` | `rdv_client_id` | String (UUID) | `src/services/api.ts` (Vector Clock) |
| **訪客橫幅** | `sessionStorage` | `redolve_guest_banner_dismissed` | String ('true') | `GuestNoticeBanner.tsx` |
| **最後標籤** | `sessionStorage` | `redolve_last_source` | String (如 '113年 全模') | `UploadModal.tsx` |
| **離線錯題** | `IndexedDB` | `redolve_offline_db` -> `offlineProblems` | `OfflineProblem` Record | `offlineStorage.ts`, `OfflineSyncManager.ts` |
| **離線筆跡** | `IndexedDB` | `redolve_offline_db` -> `syncQueue` | `SyncQueueItem` Record | `offlineStorage.ts` |
| **設定分頁** | URL Hash | `#pencil`, `#taxonomy`, `#apikeys` | String | `SettingsView.tsx` |
| **導航視角** | URL Path | `/study/:subjectId/:topicId` | Route Params | `StudyView.tsx`, `Sidebar.tsx` |
| **會員資料** | Cloudflare D1 | `users` | SQL Row | `worker/routes/auth.ts` |
| **題目核心** | Cloudflare D1 | `items` | SQL Row (含 Vector Clock) | `worker/routes/problems.ts` |
| **全文檢索** | Cloudflare D1 | `items_fts` | SQLite FTS5 Table | `worker/routes/problems.ts`, `search.ts` |
| **課綱樹狀** | Cloudflare D1 | `taxonomies` | SQL Row | `worker/routes/taxonomy.ts` |
| **iOS 金鑰** | Cloudflare D1 | `api_keys` | SQL Row (bcrypt hash) | `worker/routes/keys.ts` |
| **公開分享** | Cloudflare D1 | `shares` | SQL Row | `worker/routes/shares.ts` |
| **原始圖檔** | Cloudflare R2 | `images/${userId}/${problemId}.jpg` | Binary Image (JPEG/PNG) | `worker/routes/problems.ts` |

---

## 11. 相關實作原始碼參照

### 前端持久化核心
- 全域偏好 Store：[`src/store/useStore.ts`](file:///d:/Document_J/redolve/src/store/useStore.ts)
- 離線資料庫封裝：[`src/services/offlineStorage.ts`](file:///d:/Document_J/redolve/src/services/offlineStorage.ts)
- 離線同步管理員：[`src/services/OfflineSyncManager.ts`](file:///d:/Document_J/redolve/src/services/OfflineSyncManager.ts)
- API Client 與憑證讀取：[`src/services/api.ts`](file:///d:/Document_J/redolve/src/services/api.ts)
- 筆觸設定面板：[`src/components/settings/PencilSettingsSection.tsx`](file:///d:/Document_J/redolve/src/components/settings/PencilSettingsSection.tsx)
- 設定分頁容器：[`src/views/SettingsView.tsx`](file:///d:/Document_J/redolve/src/views/SettingsView.tsx)
- 批次上傳對話框：[`src/components/UploadModal.tsx`](file:///d:/Document_J/redolve/src/components/UploadModal.tsx)

### 後端持久化核心
- 資料庫結構定義：[`worker/schema.sql`](file:///d:/Document_J/redolve/worker/schema.sql)
- 題目與 R2/FTS5 路由：[`worker/routes/problems.ts`](file:///d:/Document_J/redolve/worker/routes/problems.ts)
- 課綱持久化路由：[`worker/routes/taxonomy.ts`](file:///d:/Document_J/redolve/worker/routes/taxonomy.ts)
- API Key 持久化路由：[`worker/routes/keys.ts`](file:///d:/Document_J/redolve/worker/routes/keys.ts)
- 分享短連結路由：[`worker/routes/shares.ts`](file:///d:/Document_J/redolve/worker/routes/shares.ts)
- 認證與使用者路由：[`worker/routes/auth.ts`](file:///d:/Document_J/redolve/worker/routes/auth.ts)
