# Redolve API 介面規格與使用說明書 (API Reference Manual)

- **文件版本**：v1.3.0
- **基準規格**：[PRD01_0803.md](PRD01_0803.md)、[TDD04_0804.md](TDD04_0804.md)
- **基礎端點 (Base URL)**：
  - 本地開發環境：`http://localhost:3000/api`（經 Vite 反向代理）或 `http://127.0.0.1:8787/api`（Worker 直連）
  - 雲端生產環境：`https://<YOUR_WORKER_DOMAIN>/api`

---

## 1. 認證機制 (Authentication)

Redolve API 提供三種驗證通道，所有受保護端點（標記為 Protected）均會經由 `worker/middleware/auth.ts` 驗證請求者身分並隔離租戶資料：

### 1.1 API Key 驗證 (推薦：iOS 捷徑 / 自動化腳本)
- **請求標頭**：`Authorization: Bearer rdv_<YOUR_API_KEY>`
- **說明**：在「設定」頁面產生的專屬 API Key。伺服器僅以 bcrypt hash 比對，金鑰具備完整寫入與讀取權限。

### 1.2 Session Cookie 驗證 (Web 前端 PWA)
- **請求標頭**：`Cookie: rdv_session=<SESSION_TOKEN>` 或 `Authorization: Bearer <TOKEN>`
- **說明**：供前端 PWA 登入與日常操作使用。

### 1.3 本地開發預設降級 (Dev Fallback)
- **說明**：若未帶任何認證標頭，本地開發環境自動降級至 `dev_user_default` 測試帳號，便於即開即測。

---

## 2. 通用錯誤回應格式 (Error Handling)

當 API 請求發生錯誤時，回傳格式遵循統一結構：

```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "人類可讀之錯誤描述訊息"
  }
}
```

| HTTP 狀態碼 | 常用錯誤代碼 (Code) | 說明 |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_REQUEST` | 請求參數或上傳檔案格式不合法 |
| `401 Unauthorized` | `UNAUTHORIZED` | 認證失敗或缺少有效金鑰 |
| `403 Forbidden` | `FORBIDDEN` | 權限不足（例如非管理員嘗試執行 Seed） |
| `404 Not Found` | `NOT_FOUND` | 找不到指定之題目、圖片或分享 Token |
| `409 Conflict` | `CONFLICT` | 筆跡儲存發生 Vector Clock 序號衝突 |
| `410 Gone` | `SHARE_EXPIRED` | 分享短連結已超過有效期限 |
| `500 Internal Error` | `INTERNAL_SERVER_ERROR` | 伺服器內部異常 |

---

## 3. 系統核心模組 (System Endpoints)

### 3.1 系統健康檢查 (Health Check)
- **端點**：`GET /api/health`
- **權限**：公開 (Public)
- **回應範例 (200 OK)**：
```json
{
  "status": "ok",
  "service": "Redolve API Engine",
  "version": "1.3.0",
  "timestamp": "2026-08-04T12:45:00.000Z"
}
```

---

## 4. 錯題管理模組 (Problems API)

### 4.1 上傳錯題 (Upload Problem)
上傳考卷照片並立即回傳 `problemId`，背景自動非同步啟動 Gemini AI 課綱分類與關鍵字抽取。

- **端點**：`POST /api/problems`
- **權限**：Protected
- **Content-Type**：`multipart/form-data`
- **請求參數 (Form Data)**：
  - `file` 或 `image`（二進位檔案，必填）：題目圖片（JPEG/PNG/WebP）
  - `source`（文字，選填）：題目出處（例如：`113年全模第12題`），預設為 `iOS Shortcut`
  - `topic_id`（文字，選填）：預設指派之單元 ID
- **回應範例 (200 OK)**：
```json
{
  "id": "8a7c2e3f-91b4-4e20-8021-39d8e5781a90",
  "status": "processing"
}
```
- **cURL 範例**：
```bash
curl -X POST "http://127.0.0.1:8787/api/problems" \
  -H "Authorization: Bearer rdv_abcdef1234567890abcdef" \
  -F "file=@/path/to/math_problem.jpg" \
  -F "source=113年北模數學第5題"
```

---

### 4.2 取得錯題列表 (List Problems)
支援科目、單元、訂正狀態篩選及高效能 Base64 Cursor 分頁。

- **端點**：`GET /api/problems`
- **權限**：Protected
- **Query 參數**：
  - `limit`（整數，選填）：每頁筆數，預設 `20`
  - `cursor`（字串，選填）：分頁游標（上一頁回傳之 `nextCursor`）
  - `topic_id`（字串，選填）：篩選特定單元 ID
  - `status`（字串，選填）：篩選狀態：`unsolved`（未訂正）、`resolved`（已完成）、`processing`（處理中）
- **回應範例 (200 OK)**：
```json
{
  "items": [
    {
      "id": "8a7c2e3f-91b4-4e20-8021-39d8e5781a90",
      "user_id": "usr_123456",
      "type": "problem",
      "topic_id": "math_senior_permutation",
      "keywords": "[\"排列組合\", \"二項式定理\"]",
      "keyword_tokens": "排列組合 二項式定理 數學",
      "source": "113年北模數學第5題",
      "image_url": "images/usr_123456/8a7c2e3f-91b4-4e20-8021-39d8e5781a90.jpg",
      "draw_data": "{\"strokes\":[],\"canvasHeight\":900}",
      "status": "unsolved",
      "review_count": 0,
      "vector_clock": "{\"clientId\":\"uuid\",\"seq\":1}",
      "updated_at": "2026-08-04T12:00:00.000Z",
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wOC0wNFQxMjowMDowMC4wMDBaIiwiaWQiOiI4YTdjMmUzZi05MWI0LTRlMjAtODAyMS0zOWQ4ZTU3ODFhOTAifQ=="
}
```

---

### 4.3 取得單題元資料 (Get Problem Details)
- **端點**：`GET /api/problems/:id`
- **權限**：Protected
- **回應範例 (200 OK)**：回傳單一 `Item` 物件。

---

### 4.4 取得題目原圖串流 (Get Problem Image)
由 Cloudflare Worker 代理讀取 R2 私有儲存桶，驗證租戶權限後輸出圖片串流。

- **端點**：`GET /api/problems/:id/image`
- **權限**：Protected
- **回應**：`Content-Type: image/jpeg`，包含二進位影像。

---

### 4.5 更新題目中繼資料 (Update Metadata)
使用者手動修正科目單元、關鍵字標籤或來源名稱。更新時會自動同步 D1 FTS5 全文檢索索引。

- **端點**：`PUT /api/problems/:id`
- **權限**：Protected
- **Content-Type**：`application/json`
- **請求 Body**：
```json
{
  "topic_id": "math_senior_permutation",
  "keywords": ["排列組合", "條件機率"],
  "source": "113年北模數學第5題 (更正)"
}
```
- **回應範例 (200 OK)**：`{ "status": "ok" }`

---

### 4.6 儲存手寫向量筆跡 (Save Draw Data)
儲存向量筆跡與延伸畫布高度，具備 Vector Clock 樂觀鎖衝突檢測。

- **端點**：`PATCH /api/problems/:id/draw`
- **權限**：Protected
- **Content-Type**：`application/json`
- **請求 Body**：
```json
{
  "draw_data": {
    "strokes": [
      {
        "points": [[100, 150, 0.5], [102, 155, 0.6]],
        "color": "#374151",
        "width": 2,
        "isHighlighter": false,
        "isEraserMask": false
      }
    ],
    "canvasHeight": 1200
  },
  "vector_clock": {
    "clientId": "client-uuid-1",
    "seq": 5
  }
}
```
- **回應範例 (200 OK)**：`{ "status": "ok" }`
- **衝突回應 (409 Conflict)**：當本地版本序號小於雲端現存版本時回傳目前雲端筆跡供客戶端合併。

---

### 4.7 切換題目完成狀態 (Toggle Status)
將題目標記為「已訂正 (resolved)」或「未訂正 (unsolved)」，標記為已訂正時自動累加 `review_count`。

- **端點**：`PATCH /api/problems/:id/status`
- **權限**：Protected
- **Content-Type**：`application/json`
- **請求 Body**：
```json
{
  "status": "resolved"
}
```
- **回應範例 (200 OK)**：`{ "status": "updated" }`

---

### 4.8 刪除題目 (Delete Problem)
原子性刪除 D1 題目記錄、關聯之 FTS5 檢索記錄、分享 Token，並自 R2 儲存桶永久移除原始圖片檔案。

- **端點**：`DELETE /api/problems/:id`
- **權限**：Protected
- **回應範例 (200 OK)**：`{ "status": "deleted" }`

---

## 5. 全文搜尋模組 (Search API)

### 5.1 全域中文搜尋 (Search Problems)
採用 D1 FTS5 虛擬表進行中文分詞檢索，並具備 JSON_EACH 與 LIKE 容錯降級機制。

- **端點**：`GET /api/search?q=:query`
- **權限**：Protected
- **Query 參數**：
  - `q`（字串，必填）：搜尋關鍵字（例如：`牛頓定律`、`113年全模`）
- **回應範例 (200 OK)**：
```json
{
  "items": [
    {
      "id": "8a7c2e3f-91b4-4e20-8021-39d8e5781a90",
      "keywords": "[\"牛頓運動定律\", \"斜面摩擦力\"]",
      "source": "113年全模物理"
    }
  ]
}
```

---

## 6. 戰情室統計模組 (Dashboard API)

### 6.1 取得統計數據 (Get Dashboard Stats)
計算全科題目總量、訂正率、各科進度分佈及前 3 大薄弱單元熱區。

- **端點**：`GET /api/dashboard`
- **權限**：Protected
- **回應範例 (200 OK)**：
```json
{
  "summary": {
    "total": 42,
    "resolved": 18,
    "unsolved": 23,
    "processing": 1
  },
  "subjects": [
    {
      "subject_id": "math",
      "subject_label": "高中數學",
      "total": 20,
      "resolved": 10
    },
    {
      "subject_id": "physics",
      "subject_label": "高中物理",
      "total": 22,
      "resolved": 8
    }
  ],
  "top_unsolved_topics": [
    {
      "topic_id": "math_senior_permutation",
      "topic_label": "排列組合與機率",
      "unsolved_count": 8
    }
  ]
}
```

---

## 7. API 金鑰管理模組 (API Keys API)

### 7.1 產生新金鑰 (Generate API Key)
建立供 iOS 快捷指令或自動化工具使用的 `rdv_...` 授權金鑰。

- **端點**：`POST /api/keys`
- **權限**：Protected
- **Content-Type**：`application/json`
- **請求 Body**：
```json
{
  "description": "iPhone 16 Pro 快捷指令"
}
```
- **回應範例 (200 OK)**：
```json
{
  "key": "rdv_49f82d1a3c08479e2840b91e7048",
  "key_prefix": "rdv_49f8",
  "description": "iPhone 16 Pro 快捷指令",
  "message": "金鑰已生成，請妥善保管。此明文僅顯示一次。"
}
```

---

### 7.2 列出已建立之金鑰 (List API Keys)
- **端點**：`GET /api/keys`
- **權限**：Protected
- **回應範例 (200 OK)**：
```json
{
  "keys": [
    {
      "key_hash": "$2a$10$abcdef...",
      "key_prefix": "rdv_49f8",
      "description": "iPhone 16 Pro 快捷指令",
      "created_at": "2026-08-04T12:00:00.000Z"
    }
  ]
}
```

---

### 7.3 撤銷金鑰 (Revoke API Key)
- **端點**：`DELETE /api/keys/:hash`
- **權限**：Protected
- **回應範例 (200 OK)**：`{ "status": "revoked" }`

---

## 8. 公開分享模組 (Shares API)

### 8.1 產生分享短連結 (Create Share Link)
為特定錯題產生免登入的 `st_...` 唯讀分享代碼。

- **端點**：`POST /api/problems/:id/share`
- **權限**：Protected
- **Content-Type**：`application/json`
- **請求 Body**：
```json
{
  "allow_ink": true,
  "expires_at": "2026-08-11T23:59:59.000Z"
}
```
- **回應範例 (200 OK)**：
```json
{
  "token": "st_38f2a9e10d84c172",
  "allow_ink": 1,
  "expires_at": "2026-08-11T23:59:59.000Z"
}
```

---

### 8.2 公開讀取分享錯題 (Get Shared Problem - Public)
供受邀者免登入直接檢視題目資訊與手寫推導過程。

- **端點**：`GET /share/:token`
- **權限**：公開 (Public)
- **回應範例 (200 OK)**：
```json
{
  "item": {
    "id": "8a7c2e3f-91b4-4e20-8021-39d8e5781a90",
    "topic_id": "math_senior_permutation",
    "keywords": "[\"排列組合\"]",
    "source": "113年北模數學第5題",
    "draw_data": "{\"strokes\":[...]}",
    "status": "unsolved",
    "created_at": "2026-08-04T12:00:00.000Z"
  },
  "share": {
    "token": "st_38f2a9e10d84c172",
    "allow_ink": true,
    "expires_at": "2026-08-11T23:59:59.000Z"
  }
}
```

---

### 8.3 公開讀取分享題目圖片 (Get Shared Image - Public)
- **端點**：`GET /share/:token/image`
- **權限**：公開 (Public)
- **回應**：二進位圖片串流 (`image/jpeg`)。

---

### 8.4 撤銷分享短連結 (Revoke Share Link)
- **端點**：`DELETE /api/problems/:id/share/:token`
- **權限**：Protected
- **回應範例 (200 OK)**：`{ "status": "revoked" }`

---

## 9. 系統管理員課綱模組 (Admin API)

### 9.1 檢查管理員身分 (Check Admin Status)
- **端點**：`GET /api/admin/me`
- **權限**：Protected (比對 `ADMIN_EMAILS` 白名單)
- **回應範例 (200 OK)**：`{ "isAdmin": true }`

---

### 9.2 課綱資料庫植入 (Seed Taxonomy)
將高中學測與分科測驗之標準課綱分類樹（48 個節點）寫入 D1 `taxonomies` 資料表與 KV 快取。

- **端點**：`POST /api/admin/taxonomy/seed`
- **權限**：Protected (僅限管理員帳號)
- **回應範例 (200 OK)**：
```json
{
  "status": "seeded",
  "count": 48
}
```
