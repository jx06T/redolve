# Redolve - 心流式 AI 錯題本 PWA

> 專為學測/分科測驗考生打造，結合 **iPad + Apple Pencil 雙手協同手勢**、**Gemini AI 自動課綱標籤**與 **Cloudflare Edge 邊緣運算** 的 Serverless 錯題系統。

---

## 核心特色 (Key Features)

- **極速拍照收錄 (iOS 捷徑無感上傳)**  
  考場/學校檢討考卷時，拿起 iPhone 捷徑拍照即可離線自動壓縮與上傳，1 秒完成收錄，不打斷學習節奏。

- **Gemini AI 自動化分類**  
  自動依據學測/分科測驗課綱 Taxonomy 辨識「科目」、「單元」與動態「關鍵字」，擺脫手動整理與打標籤的繁瑣摩擦。

- **雙手協同與 Apple Pencil 繪圖引擎**  
  - **PointerType 掌壓防誤觸**：攔截觸控事件，手掌貼在螢幕上計算時頁面不亂跳。
  - **彈簧橡皮擦 (Spring-loaded Eraser)**：左手長按懸浮鈕瞬間切換局部向量擦除，鬆開即刻恢復畫筆。
  - **雙指復原 (Two-finger Undo)**：雙指輕觸螢幕瞬間回退上一步。

- **虛擬滾動與動態長高畫布 (Auto-expanding Canvas)**  
  - 視口內卡片才動態掛載真實 `<canvas>`，實現 60fps 順暢無縫向上/向下無限刷題。
  - 計算推導過長時，卡片自動向下延伸空白計算區。

- **D1 FTS5 雙軌中文全文檢索**  
  支援輸入中文關鍵字秒級搜尋題目，並可一鍵生成「唯讀分享短連結」，供同學免登入查看（可自由隱藏/顯示筆跡）。

- **智慧護眼反色模式 (Invert Filter)**  
  一鍵將刺眼的白底黑字考卷轉換為柔和深灰底與淺灰字，降低夜間算題視覺疲勞。

---

## 技術堆疊 (Tech Stack)

| 層級 | 技術選型 | 說明 / 備註 |
| :--- | :--- | :--- |
| **前端 (Frontend)** | React 18, Vite (SPA), TypeScript, Tailwind CSS | PWA + 響應式低對比設計系統 |
| **狀態管理與虛擬化** | Zustand, `@tanstack/react-virtual` | 跨組件狀態與 Viewport-only 虛擬滾動列表 |
| **繪圖引擎 (Canvas)** | 原生 HTML5 `<canvas>` + `perfect-freehand` | 向量點位與向量筆跡 Masking 局部擦除 |
| **後端 API (Backend)** | Cloudflare Workers, Hono Framework | Edge Runtime 邊緣運算 API |
| **資料庫與儲存** | Cloudflare D1 (SQLite) + Cloudflare R2 | 多租戶資料隔離、FTS5 中文全文檢索與影像儲存 |
| **AI 視覺辨識** | Google Gemini 2.5 / 3.5 Flash API | Structured Outputs 課綱自動分類 |
| **身分驗證 (Auth)** | better-auth (Google OAuth) + 自建 API Key | PWA Web 端與 iOS 捷徑雙軌驗證 |

---

## 專案架構 (Project Structure)

```text
redolve/
├── doc/                    # 需求規格與技術設計文件
│   ├── PRD01_0803.md       # 產品需求規格書 (PRD)
│   └── TDD01_0803.md       # 技術設計文件 (TDD)
├── src/                    # 前端 React SPA 原始碼
│   ├── assets/             # 靜態資源
│   ├── components/         # React 組件 (Canvas, Cards, Auth, Dashboard)
│   ├── hooks/              # 自訂 Hooks (Pointer, Touch, Offline Sync)
│   ├── lib/                # 工具函式與 IndexedDB 客戶端
│   ├── pages/              # 頁面路由 (Dashboard, StudyListView, Search)
│   ├── store/              # Zustand 全域狀態
│   ├── App.tsx             # 應用程式進入點
│   └── index.css           # Tailwind CSS & 低對比設計 Token
├── worker/                 # Cloudflare Worker 後端 API
│   ├── index.ts            # Hono API 路由與中間件
│   └── schema.sql          # Cloudflare D1 資料庫綱要與 FTS5 虛擬表
├── index.html              # HTML 進入點 (含 iPad Viewport 防誤觸設定)
├── package.json            # 專案套件設定
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 打包配置
├── tailwind.config.js      # Tailwind CSS 主題 Token 配置
└── wrangler.jsonc          # Cloudflare Worker, D1 & R2 綁定配置
```

---

## 快速開始 (Quick Start)

### 1. 環境需求
- [Node.js](https://nodejs.org/) (v18+)
- npm / pnpm

### 2. 安裝依賴項
```bash
npm install
```

### 3. 前端開發伺服器
啟動 Vite 開發伺服器（預設網址 `http://localhost:3000`）：
```bash
npm run dev
```

### 4. Cloudflare Worker 本地模擬環境
初始化本地 D1 資料庫表單與啟動 Worker 本地邊緣環境：
```bash
# 初始化本地 D1 資料表與 FTS5 虛擬表
npm run d1:init

# 啟動 Wrangler Dev 本地 API 伺服器
npm run worker:dev
```

### 5. 正式環境編譯 (Production Build)
進行 TypeScript 型別檢查與前端打包：
```bash
npm run build
```

---

## 相關文檔 (Documentation)

- [產品需求規格書 (PRD)](file:///d:/Document_J/redolve/doc/PRD01_0803.md)
- [技術設計文件 (TDD)](file:///d:/Document_J/redolve/doc/TDD01_0803.md)

---

## 授權條款 (License)

Private Repository - Redolve Project.
