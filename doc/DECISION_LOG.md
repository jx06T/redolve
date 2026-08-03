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

### 6. FTS5 全文檢索索引手動編輯同步 (FTS5 Search Sync)
- **問題發現**：原先 `PUT /api/problems/:id` 在使用者手動修正題目單元或關鍵字時，僅更新 `items` 表，並未同步寫入 `items_fts` 虛擬表，導致搜尋該自訂關鍵字時無法被索引查出。
- **決策與優化**：在 `PUT /api/problems/:id` 更新 D1 時補上 `INSERT OR REPLACE INTO items_fts` 指令，確保手動標籤與 FTS5 檢索保持一致。

### 7. 筆跡顯隱 Toggle 與二刷原題 (US 3.1 Implementation)
- **需求核對**：PRD US 3.1 要求使用者二刷題目時可一鍵隱藏舊筆跡對著乾淨考卷重新解題。
- **決策與優化**：在 `ProblemCard.tsx` 的工具列新增 Eye / EyeOff 眼睛按鈕，控管 `inkVisible` 狀態，並傳遞至 `<DrawCanvas>` 控管 Canvas 2D / SVG 筆跡圖層的不透明度與繪製開關。

### 8. 訂正完成自動順暢滾動至下一題 (US 4.2 Implementation)
- **需求核對**：PRD US 4.2 要求點擊「標記為已訂正」時，題目除標示完成外應自動滾動到下一題。
- **決策與優化**：在 `ProblemCard.tsx` 的 `handleToggleStatus` 中新增 `onStatusResolved` 回調，並在 `StudyView.tsx` 透過 `@tanstack/react-virtual` 的 `rowVirtualizer.scrollToIndex(currentIndex + 1, { align: 'start', behavior: 'smooth' })` 實現自動無縫平滑滾動。

### 9. 畫布動態寬度自適應 (Dynamic Canvas Width Scaling)
- **問題發現**：原本 `<canvas>` width 寫死 800px，在不同 iPad 或螢幕寬度下可能導致指針點位 `x, y` 與 Canvas 內建像素解析度不完全等比，造成筆劃偏移。
- **決策與優化**：在 `DrawCanvas.tsx` 引入 `ResizeObserver` 動態捕捉容器 `clientWidth`，實時設定 `canvasWidth` 狀態，確保 1:1 像素精準對齊。
