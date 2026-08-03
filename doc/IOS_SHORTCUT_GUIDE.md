# Redolve iOS 捷徑配置指南 (iOS Shortcut Setup Guide)

本指南引導您如何在 iPhone / iPad 上建立「拍照一鍵上傳」iOS 捷徑（Shortcuts），實現考場/學校場景下的極速零摩擦力錯題收錄，並支援自訂考卷出處來源（如：`113年全模`、`建中段考`）。

---

## 1. 前置準備：取得 API Key

1. 開啟 Redolve PWA 網頁端。
2. 進入 **設定 (Settings)** 頁面 (`/settings`)。
3. 在「新增 API 金鑰」欄位輸入備註（例如：`iPhone 拍照捷徑`），點擊 **生成 Key**。
4. 複製生成的明文金鑰（格式為 `rdv_****************`）。
   *(注意：明文僅顯示一次，請妥善保管)*

---

## 2. iOS 捷徑動作建立步驟 (Step-by-Step)

請開啟 iOS 內建的 **捷徑 (Shortcuts)** App，點擊右上角 `+` 新增捷徑，命名為 **「上傳至 Redolve」**，並依照順序加入以下動作：

### 動作 1 (選填進階)：要求輸入考卷出處 (Ask for Input)
- **動作名稱**：要求輸入
- **提示 (Prompt)**：`請輸入考卷出處（例如：113年全模、建中段考）`
- **預設文字 (Default Text)**：`113年全模`
*(若希望零打字秒拍，可省略此步驟，直接在動作 4 的 source 欄位寫死固定考卷名稱)*

---

### 動作 2：拍照 (Take Photo)
- **動作名稱**：拍照
- **設定**：相機設定為「後置相機」，拍「1 張照片」。
*(亦可改為「選擇照片」以支援從相簿批次多選)*

---

### 動作 3：調整影像大小與壓縮 (Resize & Compress Image)
- **動作名稱**：調整影像大小
- **設定**：將「拍照」的輸出調整為「寬度 1080 像素」（高度自動依比例縮放）。
- **動作名稱**：轉換影像
- **設定**：格式選擇 `JPEG`，品質調至 `80%`。
*(此步驟可確保圖片體積小於 500 KB，在 4G/5G 網路下 1.5 秒內完成傳輸)*

---

### 動作 4：發送 POST 請求至 Worker API (Get Contents of URL)
- **動作名稱**：取得 URL 的內容
- **URL**：`https://<YOUR_WORKER_DOMAIN>/api/problems`
  *(例如：`https://redolve-api.your-name.workers.dev/api/problems`)*
- **方法 (Method)**：`POST`
- **標頭 (Headers)**：
  - `Authorization`: `Bearer <填入你的 API_KEY>` (例如：`Bearer rdv_abc123...`)
- **要求主體 (Request Body)**：選擇 `表單 (Form)` 或 `Multipart`
  - 欄位名稱 (Key)：`file`  → 數值 (Value)：選擇上一步「已轉換的影像」
  - 欄位名稱 (Key)：`source` → 數值 (Value)：選擇「動作 1 輸入的文字」 (或填寫 `113年全模`)

---

### 動作 5：顯示通知 (Show Notification)
- **動作名稱**：顯示通知
- **標題**：`Redolve 錯題收錄`
- **內文**：`錯題已順利上傳！考卷來源：Provided Input。AI 正在背景自動辨識課綱與標籤...`

---

## 3. 高級技巧：連續拍照模式與動作按鈕綁定

1. **加入主畫面與鎖定畫面**：在捷徑設定中點擊「加入主畫面」，可放在 iPhone 第一頁隨手拍照。
2. **動作按鈕 (Action Button)**：
   - iPhone 15 Pro / 16 系列：可將實體「動作按鈕」直接綁定此捷徑。按一下按鈕彈出輸入考卷名稱，隨即開啟相機拍照上傳。
3. **連續拍照大師 (Repeat Loop)**：在捷徑中加入「重複 5 次」迴圈，連續拍下同一份考卷的 5 道錯題，自動批次套用同一個考卷來源標籤。

---

## 4. API 回應與運作原理

- 捷徑上傳後，Cloudflare Worker 會立即回傳 HTTP 200 及 `status: processing`。
- 圖片上傳過程不會等待 Gemini AI 標籤分析完成，完全不中斷您的檢討節奏。
- Gemini AI 會在邊緣背景（`ctx.waitUntil`）自動辨識科目、單元與關鍵字，當您回到 iPad 打開 App 時，標籤與考卷來源已自動整合好。
