# Redolve 實作決策記錄 (Decision Log)

本文件紀錄開發過程中對於未明確定義細節所採行的最佳化決策與架構選擇。

---

## 決策列表 (Decisions Log)

### 1. Tailwind v4 Token 定義與樣式佈局 (UI & Aesthetics)
- **決策內容**：依照指令，使用 Tailwind CSS v4 `@theme` 區塊在 `src/index.css` 中顯式宣告 Redolve 原生調色盤（Soft Pastel / Low-Contrast）。
- **具體 Token**：
  - `--color-primary`: `#6366F1` (Indigo-500 muted)
  - `--color-page-bg`: `#F4F4F2` (Light) / `#161618` (Dark)
  - `--color-surface`: `#FFFFFF` (Light) / `#202023` (Dark)
  - `--color-surface-border`: `#E5E7EB` (Light) / `#2C2C30` (Dark)
  - `--color-text-main`: `#374151` (Light) / `#D1D5DB` (Dark)
  - `--color-text-sub`: `#9CA3AF`
  - 水彩風波浪漸層色：`#F4A0A0` (Rose) → `#F5C6A0` (Warm Peach) → `#A8C5BD` (Sage Green)
- **佈局原則**：優先強調視覺層級、卡片佈局與排版節奏，嚴格禁止強烈深色陰影與高飽和度色彩。

### 2. 畫布向量擦除與極致渲染效能 (Canvas Interaction)
- **決策內容**：採用 `perfect-freehand` 生成 SVG / Canvas Path，劃分 `pen` 與 `touch` 事件。
- **彈簧橡皮擦 (Spring Eraser)**：採用幾何 Segment Clipping (EraserMask) 取代像素畫布像素擦除，確保無損向量縮放與匯出。
- **視口限定掛載 (Viewport Mount)**：透過 `@tanstack/react-virtual` 搭配 `IntersectionObserver` 僅對當前視口卡片掛載 `<canvas>` 2D 上下文，視口外卡片降級為 SVG 筆跡渲染。

### 3. 多租戶離線同步與衝突解決 (Offline & Sync)
- **決策內容**：採用 Vector Clock `seq` 序號 + Server Last-Write-Wins (LWW) 進行 409 Conflict 衝突檢測。
- **離線佇列**：前端 Service Worker + IndexedDB 監聽 `online` 事件，當恢復連線時自動批次出佇列 `PATCH /api/problems/:id/draw`。

### 4. API 密鑰安全性 (Security & Auth)
- **決策內容**：iOS 捷徑 API Key 採用 `bcrypt.hash` 雜湊儲存，資料庫僅存 `key_hash` 與 `key_prefix` (前綴打碼)。明文 key 僅在建立時一次性回傳。

### 5. AI 標籤重試與靜默降級 (AI Resilience)
- **決策內容**：Worker `ctx.waitUntil()` 呼叫 Gemini 服務時，實作 3 次指數退避重試 (1s, 2s, 4s)。若重試失敗，靜默將 `status` 設定為 `'unsolved'`、`topic_id` 設定為 `null`，前端顯示橘色「尚未分類 — 點此編輯」 Badge，不中斷圖片上傳流程。
