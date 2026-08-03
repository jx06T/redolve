# Redolve 實作路徑規劃 (Implementation Roadmap)

- **基準文件**：[TDD04_0804.md](d:/Document_J/redolve/doc/TDD04_0804.md) (v1.3.0)
- **目前碼庫狀態**：骨架結構，Worker 只有 health check，Schema 為 v1.0.0 舊版
- **建立日期**：2026-08-04

---

## 覽視地圖

```
階段 0: 前置準備          → 確保工具鏈正確起動
階段 1: 基礎設施 + 後端骨架   → Worker 可經驗證接受請求
階段 2: 課綱 + AI 標籤流程    → iOS 捷徑上傳圖片可自動打標
階段 3: 前端 PWA 核心         → iPad 畫布可用，離線可寫入
階段 4: 核心功能補全        → 搜尋、分享、Dashboard
階段 5: 上線準備 + 部署         → Cloudflare Pages + Workers 正式部署
```

---

## 階段 0: 前置準備 (Prerequisites)

> **目標**：確保本地開發環境就緒。

### 0.1 Cloudflare 資源建立

- [ ] `wrangler login` 登入 Cloudflare 帳號
- [ ] `wrangler d1 create redolve-db` 建立 D1 資料庫，將 `database_id` 填入 `wrangler.jsonc`
- [ ] `wrangler r2 bucket create redolve-images` 建立 R2 儲存桶
- [ ] `wrangler kv namespace create REDOLVE_KV` 建立 KV 命名空間，將 `id` 填入 `wrangler.jsonc`

### 0.2 Secrets 注入

```powershell
wrangler secret put GEMINI_API_KEY
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put ADMIN_SECRET
```

### 0.3 `wrangler.jsonc` 更新

依照 TDD04 第 2.1 節補入 `kv_namespaces` 綁定。

### 0.4 安裝缺少套件

```powershell
npm install bcryptjs drizzle-orm better-auth
npm install -D @types/bcryptjs wrangler@latest
```

---

## 階段 1: 基礎設施 + 後端骨架

> **目標**：Worker 可安全驗證身份、接受上傳、存取 R2。不需前端可獨立驗證。

### 1.1 更新 `worker/schema.sql` 為 v1.3.0

- [ ] 依照 TDD04 第 4.1 節全量替換 `worker/schema.sql`
  - 移除 `api_keys.key` 明文欄位，改為 `key_hash` + `key_prefix`
  - 新增 `taxonomies` 表
  - `items` 表：移除 `subject`/`topic`，新增 `topic_id`/`keyword_tokens`/`vector_clock`/`updated_at`
  - `shares` 表：明確 `expires_at NULL` 語意
  - Index：移除 `idx_user_subject_topic`，新增 `idx_user_created`
  - FTS5：`keywords` 欄位改為 `keyword_tokens`
- [ ] `npm run d1:init` 執行 Schema 初始化

### 1.2 CORS 安全配置

- [ ] 依照 TDD04 第 3.2 節將 `cors()` 改為 Origin Allowlist

### 1.3 標準錯誤回應格式

- [ ] 安裝 Hono 全局 `onError` 攔截點
- [ ] 依照 TDD04 第 6.1 節廂義 `{ error: { code, message } }` 格式

### 1.4 better-auth 雙軌驗證

- [ ] 安裝 `better-auth`，設定 Google OAuth Provider
- [ ] `GET/POST /api/auth/*` 路由交由 better-auth 接管
- [ ] 廂義 Auth Middleware：從 Session Cookie 或 `Authorization: Bearer` Header 提取 `user_id`

### 1.5 API Key 生成與驗證

- [ ] `POST /api/keys`：生成 `rdv_` 前綴 Key，`bcrypt.hash()`，寫入 `api_keys`，回傳明文 Key 一次
- [ ] `GET /api/keys`：回傳 `key_prefix` 打碼列表
- [ ] `DELETE /api/keys/:hash`：撤銷指定 Key
- [ ] API Key Middleware：取出該用戶所有 hash，`bcrypt.compare()` 驗證

### 1.6 R2 Worker Proxy 圖片存取

- [ ] 依照 TDD04 第 3.3 節
- [ ] `GET /api/problems/:id/image`：驗證 `user_id` 後從 R2 `STORAGE.get(item.image_url)` 串流

---

## 階段 2: 課綱 + AI 標籤流程

> **目標**：iOS 捷徑上傳圖片後，5 秒內 AI 自動寫入 `topic_id` + `keywords`。

### 2.1 課綱分類樹

- [ ] 建立 `worker/data/taxonomy-seed.ts`：依照學測/分科測驗課綱建立分層 JSON 樹
  - level 0：各科目（數學、物理、化學、生物...）
  - level 1：各單元
  - level 2 (選用)：各子主題
- [ ] `POST /api/admin/taxonomy/seed`：驗證 `ADMIN_SECRET`，寫入 D1 `taxonomies` + KV `taxonomy:tree`
- [ ] 執行種子 API 建立課綱樹

### 2.2 AIService 抽象層

- [ ] 建立 `worker/services/ai/AIService.ts`：定義 `TagResult` 與 `AIService` interface
- [ ] 建立 `worker/services/ai/GeminiService.ts`：實作 Gemini Flash 呼叫，包含誤課綱 ID 樹的 Prompt
- [ ] 建立 `worker/services/ai/index.ts`：工廠函式，依 `env.AI_PROVIDER` 動態選擇

### 2.3 題目上傳 API

- [ ] `POST /api/problems`
  1. 接收 `FormData`，驗證 user_id
  2. `STORAGE.put(objectKey, imageBody)` 寫入 R2（key 格式：`images/{userId}/{uuid}.jpg`）
  3. 寫入 D1 `items`（`image_url = objectKey`, `status = 'processing'`）
  4. 回傳 200 OK + `{ id }`
  5. `ctx.waitUntil()` 背景呼叫 AIService，3 次指數退退重試，失敗時 `status=unsolved` + `topic_id=null`

### 2.4 題目 CRUD API

- [ ] `GET /api/problems`：Cursor-based 分頁，支援 `topic_id`/`status` 過濾
- [ ] `GET /api/problems/:id`：單題 Metadata
- [ ] `PUT /api/problems/:id`：手動修正 `topic_id`/`keywords`
- [ ] `DELETE /api/problems/:id`：刪除 D1 + R2 圖片

---

## 階段 3: 前端 PWA 核心

> **目標**：iPad Safari 可開啟圖片並寫入向量筆跡，離線下寫入本地佇列。

### 3.1 路由設定

- [ ] 安裝 `react-router-dom`
- [ ] 建立路由結構：`/`、`/study/:topicId`、`/study/:topicId/:problemId`、`/problem/:id`

### 3.2 全域狀態管理

- [ ] Zustand store：`items`、`currentTopic`、`syncQueue`、`user`

### 3.3 虛擬滾動列表

- [ ] 安裝 `@tanstack/react-virtual`（已存在）
- [ ] `StudyList` 元件：virtual rows，Cursor-based `fetchNextPage`
- [ ] 題目卡片：顯示圖片（用 `/api/problems/:id/image` Worker Proxy）

### 3.4 畫布組件 (DrawCanvas)

- [ ] 視口限定掛載：`IntersectionObserver` 偵測是否在 viewport，離開即卸載 canvas context
- [ ] `DrawData` JSON Schema 實作：`{ strokes, eraserMasks, expansions? }`
- [ ] `perfect-freehand` 整合：`getStroke()` 輸入轉換為 SVG path
- [ ] PointerType 分離：`pen` 模式禁用 touch 滾動
- [ ] 掌壓防誤觸 Guard：`pointerType === 'touch'` 且有 `pen` 作用時忽略 touch
- [ ] 左下角彈簧橡皮擦 FAB：`onTouchStart` 切換橡皮擦模式，鬆開復原
- [ ] 雙指復原：`touchstart` 中 `e.touches.length === 2` 觸發狀態棧回退
- [ ] Auto-Expanding Canvas：筆尖距底部 100px 時添加 400px 空白計算區

### 3.5 筆跡同步

- [ ] Debounce 2s 後出發 `PATCH /api/problems/:id/draw`
- [ ] Request body 附加 `vector_clock: { clientId, seq }`
- [ ] 409 Conflict 處理：接受 Server 最新資料覆覆本地狀態

### 3.6 PWA 離線支援

- [ ] 安裝 `vite-plugin-pwa` 或手動建立 Service Worker
- [ ] 廂義三段快取策略：App Shell (Cache-first) / API (Network-first) / 圖片 (SWR)
- [ ] `online` 事件監聽：連線復復時自動排程 IndexedDB 佇列同步
- [ ] `manifest.json`：安裝至主畫面功能 (`"display": "standalone"`)

### 3.7 狀態切換

- [ ] `PATCH /api/problems/:id/status`：`unsolved` ↔ `resolved`
- [ ] 標記完成後自動滾動到下一題

---

## 階段 4: 核心功能補全

> **目標**：搜尋、分享、Dashboard。

### 4.1 全域 FTS5 中文搜尋

- [ ] `GET /api/search?q={keyword}`：雙軌查詢（FTS5 MATCH + JSON_EACH LIKE）
- [ ] 前端：`/search?q={keyword}` 頁面，結果列表

### 4.2 分享功能

- [ ] `POST /api/problems/:id/share`：生成 Token，`expires_at = NULL`
- [ ] `DELETE /api/problems/:id/share/:token`：撤銷分享
- [ ] `GET /share/:token`：公開路由，驗證 Token + 到期時間
- [ ] `GET /share/:token/image`：Worker Proxy 圖片（Token 取代 Auth）
- [ ] 前端 `/share/:token` 頁面，依 `allow_ink` 顯示/隱藏筆跡

### 4.3 Dashboard 戰情室

- [ ] `GET /api/dashboard`：回傳各科錯題統計 + 前 3 最需複習單元
  - SQL 依照 TDD04 第 12 節廂義
- [ ] 前端 `/` Dashboard 頁：Progress Bar + 快速入口

### 4.4 智慧反色模式

- [ ] CSS `filter: invert(0.9) hue-rotate(180deg) grayscale(0.2)` 套用於 `.exam-paper-image`
- [ ] Toggle 按鈕及全域暗色模式切換

---

## 階段 5: 上線準備

> **目標**：部署到 Cloudflare Pages + Workers，生產環境就緒。

### 5.1 Cloudflare Pages 前端部署

- [ ] `npm run build` 產出 `dist/`
- [ ] Cloudflare Pages：連接 GitHub repo，設定 Build command `npm run build`、Output `dist/`
- [ ] 設定自訂網域（若有）

### 5.2 Worker 部署

- [ ] `npm run worker:deploy`
- [ ] 確認生產環境 Secrets 已注入（`wrangler secret list`）
- [ ] 執行一次 `POST /api/admin/taxonomy/seed` 建立課綱樹

### 5.3 CORS Origin 更新

- [ ] 將正式網域加入 `ALLOWED_ORIGINS` 白名單

### 5.4 E2E 冒煙測試

- [ ] iOS 捷徑：上傳一張圖片，確認在 PWA 顯示且 AI 標籤正確
- [ ] iPad：離線寫入筆跡，再接網確認同步
- [ ] 分享連結：同學免登入可檢視

---

## 依賴順序小結

```
階段 0 (前置)
  └─ Cloudflare 資源建立
  └─ Secrets 注入
  └─ wrangler.jsonc 更新
  └─ 套件安裝

階段 1 (基礎)
  ├─ Schema 更新至 v1.3.0      [從 schema.sql 開始]
  ├─ CORS + 錯誤格式
  ├─ better-auth + API Key Middleware
  └─ R2 Worker Proxy

階段 2 (AI 流程)
  ├─ 課綱 Seed API
  ├─ AIService 抽象層 + GeminiService
  └─ 題目 CRUD API (含 AI 背景標籤)

階段 3 (前端)
  ├─ 虛擬滾動 + 畫布組件 (核心)
  ├─ PointerType 分離 + 彈簧橡皮擦 + 雙指復原
  ├─ Auto-Expanding Canvas
  └─ PWA SW + IndexedDB 離線佇列

階段 4 (補全)
  ├─ FTS5 搜尋
  ├─ 分享功能
  └─ Dashboard

階段 5 (上線)
  └─ 部署 + E2E 冒煙測試
```

---

## 定義：階段 1 完成標準

```bash
# Worker 商統檢查
curl https://redolve-api.<your-worker>.workers.dev/api/health
# 應回傳：{ "status": "ok" }

# 驗證 CORS 正確指向
# Browser DevTools：檢查 CORS header 只允許 PWA domain

# 驗證 API Key 流程
# 1. POST /api/keys 獲得 raw key
# 2. 確認驗證 D1 api_keys 無明文欄位（只存 hash）
# 3. 確認 GET /api/problems 以該 key 可驗證

# 驗證 R2 Proxy
# 上傳圖片後 GET /api/problems/:id/image 可居然回傳圖片
```
