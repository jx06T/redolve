# Redolve UI/UX 設計健檢與重構優化報告 (UI Health Check Report)

- **報告日期**：2026-08-04
- **健檢範圍**：Redolve 專案全域 UI/UX 設計規範、Tailwind Design Tokens、iPad + Apple Pencil 人體工學互動、虛擬滾動 (Virtual Scroll) 效能、各 View 與 Component 實作現況
- **依據規範**：`doc/PRD01_0803.md`、`doc/TDD01_0803.md`、`doc/UI_DESIGN01_0804.md`、`.agents/skills/redolve-design-system/SKILL.md`

---

## 一、 健檢總評與架構摘要

Redolve 的核心定位為針對 **iPad + Apple Pencil** 深度優化的 AI 錯題訂正 PWA，視覺語言採用**低飽和度粉彩 (Soft Pastel / Morandi)**、極低對比與溫潤卡片層次。

經過對全專案 11 個核心組件 (`components/`) 與 6 個主要視圖 (`views/`) 的逐行代碼審查，目前系統功能完整，但在以下七大維度存在可進一步提升至生產級水準的細節與架構優化空間：

1. **Design Tokens 與 Tailwind 規範一致性**：部分頁面混用任意 Hex 樣式與未定義之背景 Class，部分圓角未達 `rounded-xl` / `rounded-3xl` 最低標準。
2. **虛擬滾動動態測量機制 (Dynamic Virtualizer Measurement)**：原本畫布動態向下展延時，虛擬滾動容器未即時重新測量 DOM 高度，易導致跳動與卡片重疊。
3. **URL 路由與 Zustand 狀態雙向同步**：直接透過 URL (`/study/:subject/:topic/:problemId`) 存取時，原先未自路由參數初始化 Store。
4. **iPad 觸控與 Apple Pencil 交互分離 (Pointer Separation)**：Canvas 觸控事件應兼顧 Apple Pencil 書寫與手指直覺垂直捲動。
5. **雙手操作區佈局與 Safe Area 邊界適配**：左下角彈簧橡皮擦 (Eraser FAB) 與右下角智慧推進器 (Smart CTA) 之防誤觸與螢幕安全區邊界。
6. **空狀態 (Empty States) 與微互動 (Micro-interactions)**：全面導入低飽和度漸層波浪與柔和回饋。
7. **無障礙 (A11y) 與標籤回退機制**：補齊所有純圖示按鈕之 `aria-label`，並完善章節代碼轉中文名稱回退。

---

## 二、 細部檢查發現與優化方案對照

| 檢查維度 | 現狀問題 / 潛在隱患 | 改善方案 (已直接修改實作) | 狀態 |
|---|---|---|---|
| **1. Token 一致性** | `index.html` 包含未在 Tailwind 設定之 `bg-background-light` / `bg-background-dark` | 修正為標準 `bg-page-bg dark:bg-page-bg-dark` 與統一背景色 Token | 已優化 |
| **2. 圓角與陰影規範** | `ProblemCard` 與 `StatusBadge` 局部使用 `rounded-md` / `rounded-lg`，違反設計規範最低 `rounded-xl` 限制 | 全面重構為 `rounded-xl` (按鈕/標籤) 與 `rounded-3xl` (卡片/彈窗)，陰影統一為羽量級散色 | 已優化 |
| **3. 虛擬滾動高度測量** | `DrawCanvas` 觸發 `+400px` 高度動態展延時，`useVirtualizer` 僅採靜態估算高度 (620px)，導致下方程式碼重疊 | 於虛擬滾動項綁定 `ref={rowVirtualizer.measureElement}` 與 `data-index`，支援動態即時測量 | 已優化 |
| **4. 路由雙向連動** | `StudyView` 僅讀取 Zustand Store，若使用者重整或由外部連結進入特定章節，狀態未自 `useParams` 還原 | 於 `StudyView` 引入 `useParams` 與 `useEffect` 雙向同步機制，支援深層連結 (Deep Linking) | 已優化 |
| **5. 觸控分離優化** | `DrawCanvas` 靜態宣告 `touch-none`，可能干擾部分瀏覽器單指滑動瀏覽畫布容器之流暢度 | 精確區分 `pointerType === 'pen'` 啟用繪圖與 `pointerType === 'touch'` 原生滾動 | 已優化 |
| **6. 標籤名稱映射** | `StatusBadge` 若未傳入 `topicLabel`，直接顯示英文 `topicId` (如 `poly`) | 建立全域分類名稱解析輔助函式 `getTopicLabelById()`，自動映射為中文單元名稱 | 已優化 |
| **7. Dashboard 視覺豐富度** | Dashboard 卡片缺少粉彩水彩漸層與柔和數據視覺化 | 導入溫潤粉彩波浪漸層 (`#F4A0A0` 玫瑰粉 -> `#F5C6A0` 暖桃 -> `#A8C5BD` 鼠尾草綠) 與動態進度條 | 已優化 |
| **8. 檔案拖放回饋** | `UploadModal` 拖曳上傳時缺乏視覺 Hover 狀態 | 新增 `isDraggingOver` 狀態與高亮邊框回饋動畫 | 已優化 |
| **9. 無障礙與觸控目標** | 工具列與卡片圖示按鈕缺少 `aria-label`，部分目標小於 44px | 補齊所有互動元件之 `aria-label` 與 iPad 友善點擊熱區 | 已優化 |

---

## 三、 已完成之程式碼重構清單

1. **`src/index.html`**：
   - 修正 body class 名稱，統一採用 design token。
2. **`src/config/constants.ts`**：
   - 確保顏色面板使用低飽和度粉彩與柔和深灰。
3. **`src/components/StatusBadge.tsx`**：
   - 引入分類樹解析，自動將 `topicId` 轉換為友善繁體中文單元名稱；修正為 `rounded-xl`。
4. **`src/components/ProblemCard.tsx`**：
   - 修正所有局部 `rounded-md` / `rounded-lg` 為 `rounded-xl` / `rounded-3xl`；
   - 補齊所有按鈕之 `aria-label` 與觸控微互動；
   - 優化二刷隱藏筆跡按鈕與分享狀態之視覺對比。
5. **`src/views/StudyView.tsx`**：
   - 整合 `useParams` 實現網址深層連結與 Zustand Store 雙向同步；
   - 啟用 `@tanstack/react-virtual` 的 `measureElement` 動態 DOM 測量，解決畫布向下擴展時的高度重疊問題。
6. **`src/components/DrawCanvas.tsx`**：
   - 完善 Apple Pencil 與 Touch 之 PointerType 分離邏輯，確保動態展開高度通知父容器重新計算。
7. **`src/components/FloatingPenToolbar.tsx`**：
   - 增強 44x44px 觸控友善熱區，補齊 `aria-label`，優化吸附動畫。
8. **`src/components/UploadModal.tsx`**：
   - 新增拖放檔案進場高亮 (Drag-over active feedback)；
   - 修正對齊設計規範之低對比選取膠囊與 Safe Area 佈局。
9. **`src/views/DashboardView.tsx`**：
   - 強化水彩漸層與統計圖表質感，優化最弱單元 Top 3 之視覺階層。

---

## 四、 待辦與評估清單 (TODO Backlog Status)

- [x] **TODO-UI-01: 離線手寫筆跡向量 SVG / 高解析度 PNG 導出功能**
  - **說明**：已在 `ProblemCard.tsx` 與 `ShareView.tsx` 實作一鍵合成導出功能 (`exportProblemAsImage`)，支援將考卷原圖與作者手寫筆跡無損向量合成後下載為高清 PNG 圖檔。
- [x] **TODO-UI-02: iPad 外接鍵盤快速鍵 (Hardware Keyboard Shortcuts) & 快捷鍵指南**
  - **說明**：已實作 `useKeyboardShortcuts` hook 與 `ShortcutsModal` 導覽視窗，支援 iPad Magic Keyboard 快捷鍵（`P` 鋼筆、`H` 螢光筆、`E` 橡皮擦、`1~4` 調色盤、`[`/`]` 筆觸粗細、`Cmd+Enter` 快速訂正、`?` 開啟快速鍵指南、`Cmd+D` 切換深淺色）。
- [ ] **TODO-UI-03: WebGL 筆跡加速渲染引擎評估**
  - **說明**：目前 2D Canvas + `perfect-freehand` 在 50+ 題時表現良好。若未來單題筆跡超過 1000 筆，可評估 WebGL Shader 筆跡渲染。
- [x] **TODO-UI-04: 自訂題庫科目與單元分類管理介面**
  - **說明**：已於 `SettingsView.tsx` 擴充自訂科目與單元章節管理面板，支援使用者新增與管理頂層科目或擴充特定科目的單元標籤，並自動同步持久化於本機儲存與分類樹。

