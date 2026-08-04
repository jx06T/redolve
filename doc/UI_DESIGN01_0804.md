# Redolve UI/UX 設計與互動規範 (UI Design Document)

- **文件版本**：v1.0
- **日期**：2026-08-04
- **核心目標**：無縫解題流程、心流式刷題、雙手協同手勢與全景自動化。

---

## 一、 頂部全域導航列 (Top Navigation Bar - 科目層級)

**佈局位置**：橫跨螢幕最上方，高度固定（60px），不隨任何操作捲動。

### 功能與互動

1. **科目切換 (Subject Selector)**：
   - 左側的大型下拉選單（如：`數學 ▾`、`物理 ▾`、`化學 ▾`、`生物 ▾`）。
   - **互動**：切換科目後，整個系統的數據、側欄與畫布瞬間切換為該科目的上下文。
2. **全域搜尋 (Global Search)**：
   - 頂部正中央。
   - **互動**：輸入關鍵字（如「APCS 歷屆」或「動能守恆」），可跨章節找出相關題目。
3. **全域工具 (Global Tools)**：
   - 右側放置「護眼模式 (智慧反色)」開關，以及回到首頁「戰情室 (Dashboard)」與設定的入口。

---

## 二、 左側：單元大綱與導航欄 (Sidebar - 章節與快速跳轉)

**佈局位置**：頂部導航列下方，佔據左側約 25% 寬度（桌面端）。

### 功能與互動

1. **章節篩選器 (Topic Filter)**：
   - 頂端的標籤（Tag）或選單（如：空間向量、矩陣、機率）。
   - **互動**：選擇特定章節後，右側的「無限流畫布」會立刻載入該章節的所有未訂正題目。
2. **狀態過濾 (Status Toggle)**：
   - 未訂正 / 已訂正的切換開關。
3. **錯題大綱清單 (Minimap / Anchor Navigation)**：
   - 下方為該章節題目的縮圖與題號清單。
   - **互動 1（點擊跳轉）**：點擊清單中的第 N 題，右側畫布會平滑捲動（Smooth Scroll）並精準定位到該題。
   - **互動 2（滾動連動）**：當在右側畫布往下滑動到特定題目時，左側清單對應題目會自動高亮（Active State），利用 `IntersectionObserver` 完美同步閱讀進度，並更新 URL 為 `/study/:subject/:topic/:problemId`。
4. **側欄收合 (Focus Mode)**：
   - 點擊邊緣拉柄可收合側欄，右側畫布擴展至 100% 全螢幕專注模式。

---

## 三、 右側：同章節無限流畫布 (Infinite Stream Canvas)

這是整個系統的靈魂。不再是單題切換，而是一個垂直串聯的無縫解題空間。

**佈局位置**：側欄右側，佔據剩餘 75%（收合時為 100%）。設定為 `overflow-y: auto` 的滾動容器。

### 功能與互動

1. **連續題目渲染 (Virtualized Problem Feed)**：
   - 這個容器內垂直排列著該章節的所有題目。每一題包含「考卷底圖」與「專屬的透明 Canvas 圖層」。
   - 透過虛擬滾動（React Virtual），只有出現在畫面中（Viewport）的 2~3 題會真實掛載 `<canvas>` 實例，確保記憶體不崩潰。
2. **動態高度擴展 (Auto-expanding per Problem)**：
   - 每一題的下方預設留有空白計算區。當筆跡逼近該題的底部邊界時，該題的容器高度會自動向下推展，把下一題往下方擠，永遠不怕計算空間不夠。
3. **題目視覺分隔 (Visual Dividers)**：
   - 在上一題的計算區底部與下一題的頂部之間，加入一條帶有題號的柔和分隔標籤（如：`--- Problem 2 ---`），作為視覺緩衝。
4. **觸控分離 (Pointer Separation)**：
   - Apple Pencil 寫字，手指滑動畫布。你可以順暢地寫完第一題，手指一滑，直接進入第二題繼續寫，中斷感降至絕對的零。

---

## 四、 懸浮工具層 (Floating UI)

工具列絕對定位於「右側畫布容器」之上（`position: fixed`），不隨題目列表滾動，永遠固定在雙手最舒適的相對位置。

### 1. 左下角：左手高頻控制區
- **彈簧橡皮擦 (Spring-loaded Eraser)**：大尺寸圓形觸控區。左手大拇指按住不放即切換為橡皮擦（支援跨題目的局部擦除），鬆開恢復畫筆。
- **雙指復原 (Two-finger Undo)**：支援手勢觸發。

### 2. 右上角：右手畫筆設定
- 極簡的 3 種顏色與 2 種粗細切換。

### 3. 右下角：智慧工作流推進器 (Smart CTA)
- **標記為已訂正 (Mark as Resolved)**：
  - 這顆大按鈕永遠懸浮在右下角。
  - **智慧目標鎖定**：系統會判斷「當前佔據畫面比例最大」的是哪一題。
  - **連鎖互動 (The Flow)**：當你點擊按鈕，系統會將當前這題標記為完成 ➔ 該題的底圖與筆跡會套用淡出折疊動畫（Collapse） ➔ 下面的題目會像瀑布一樣自動向上遞補，自動將下一道未訂正的挑戰送到筆尖之下。

---

## 五、 批次上傳彈窗與 Webcamera 即時拍攝 UI/UX 規範 (Upload Modal & Webcamera UI)

點擊導航列的「上傳錯題」時，系統會開啟居中磨砂玻璃彈窗 (`UploadModal`)，支援「檔案批次選取」與「視訊鏡頭即時拍攝」雙模式。

### 1. 考卷出處預設與標籤膠囊 (Preset Source & Session Memory)
- **考卷出處輸入框**：提供專屬文字輸入欄（如：`113年全模數學`）。
- **Session 記憶機制**：一旦輸入出處並成功上傳後，該出處會自動記憶於當前 Session，下次開啟上傳彈窗時自動填入，省去重複輸入的麻煩。
- **常用出處標籤膠囊 (Preset Source Chips)**：輸入框下方提供極簡點擊標籤膠囊（`113年學測`、`112年分科`、`北模`、`中模`、`全模`、`建中段考`、`課本例題`），點擊即可一鍵填入出處。

### 2. 模式一：檔案與多圖批次上傳 (File & Batch Drag-Drop Mode)
- **多檔案選取**：支援選取 1~10 張圖檔，彈窗即時顯示已選圖檔的縮圖預覽清單與刪除按鈕。
- **批次提交按鈕**：顯示「開始批次上傳 (N 張)」，點擊後併發傳送至 Worker API。

### 3. 模式二：Webcamera 裝置鏡頭即時拍攝 (Webcamera Live Capture Mode)
- **鏡頭啟動與即時預覽**：調用 HTML5 `getUserMedia` 顯示實時鏡頭影像串流（`facingMode: environment` 後置鏡頭優先）。
- **快門拍攝按鈕 (Camera Shutter FAB)**：大尺寸柔和快門按鈕，點擊瞬間凍結畫格轉為 JPEG 並加入待上傳縮圖佇列。
- **鏡頭前後切換**：提供一鍵切換「前置/後置鏡頭」之導覽控制。



這類 UI 風格可以總結為「粉彩極簡風 (Pastel Minimalism)」或平面化的「柔和卡片式設計 (Soft Card UI)」。在排除掉 3D 黏土/擬物效果後，其核心在於透過低飽和色彩與圓潤的幾何圖形來傳遞親和力與溫暖感。

以下為您整理的配色、其他視覺特色以及在前端開發上的實踐方式：

一、 配色美學 (Color Palette)
這組設計的靈魂在於「低對比、高明度、低飽和」的色彩計畫。

背景與基底色 (Base Colors)：

以溫暖的奶油白 (Cream White)、米色 (Beige) 或淺燕麥色為主，取代傳統生硬的純白或冷灰色。這能降低視覺疲勞。

點綴色 (Accent Colors)：

採用馬卡龍/粉彩色系 (Pastel colors) 進行數據或模塊的區分。

蜜桃粉 / 珊瑚橘 (Peach / Soft Coral)：作為主要的強調色或進度條。

薄荷綠 (Mint Green)：用於對比區塊或正向數據。

薰衣草紫 (Lavender) & 奶油黃 (Butter Yellow)：作為輔助標籤或次要圖表區塊。

文字與圖標顏色：

避免使用純黑 (#000000)，而是使用深褐灰或深暖灰色，以維持整體柔和的對比度。

二、 其他視覺與排版特色 (非 3D 部分)
極致的圓角幾何 (Maximum Border Radius)：

幾乎沒有銳角。卡片邊緣使用大圓角，按鈕和標籤大量使用「膠囊形狀 (Pill-shape)」或完整的圓形。

流體與波浪數據圖表 (Fluid Data Viz)：

有別於傳統折線圖，這裡的面積圖 (Area Charts) 採用平滑的貝茲曲線 (Bezier Curves)，形成類似波浪或沙丘的流動感。

環形圖 (Donut Charts) 使用極粗的線條與圓滑的端點 (Round Caps)。

模組化卡片佈局 (Bento/Modular Layout)：

介面採用類似便當盒 (Bento box) 的網格系統，將不同數據封裝在獨立的卡片中，並留有非常寬裕的元件間距 (Negative Space/Gap)，讓畫面具備呼吸感。

無框線設計 (Borderless)：

卡片與卡片之間不依賴實體線條 (Border) 分隔，而是依賴底色差異或極其微弱的色彩過渡來界定邊界。

三、 前端實踐方式 (Implementation)
在網頁應用（如 React、Next.js 或 Astro 等框架）的開發中，可以透過以下方式實踐此風格：

1. 色彩變數設定 (CSS Variables / Tailwind 擴充)：
將粉彩顏色定義在全域，方便在組件中重複調用。

CSS
:root {
  --bg-cream: #d4c6bd;
  --card-base: #fcf9f4;
  --text-soft: #4A4543;
  --accent-peach: #F6B8A2;
  --accent-mint: #a6cccc;
  --accent-lavender: #c1c2d6;
  --accent-yellow: #edcea3;
}
2. 幾何與排版 (CSS 屬性)：

圓角控制：卡片外框設定 border-radius: 24px 或更大；膠囊按鈕直接使用 border-radius: 9999px。

佈局：大量依賴 CSS Grid (如 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))) 結合較大的 gap (例如 gap: 24px 或 32px) 來實踐 Bento 排版。

3. 波浪圖表與視覺化實踐 (SVG & Libraries)：

SVG 繪製：若是自定義波浪形狀，可使用 SVG 的 <path> 搭配三次貝茲曲線 (C 或 c 指令) 來刻畫流體波浪。

圖表套件：若使用 Recharts 或 Chart.js，可以將折線圖/面積圖的曲線屬性設定為平滑。例如在 Recharts 中設定 <Area ... type="monotone"/>，並將線條端點樣式 (strokeLinecap) 設為 round，最後將折線下方的填充 (fill) 設為上述定義的粉彩純色，拔除預設的網格線與座標軸，即可達到極簡的視覺效果。