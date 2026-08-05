# Redolve 系統配置與部署指南 (Configuration & Deployment Guide)

本文件集中整理 Redolve 專案上線前需統一配置的所有 Cloudflare 資源、密鑰 Secrets、OAuth 設定與初始化指令。

---

## 1. Cloudflare 資源建立 (CLI 指令)

請在終端機中執行以下指令建立邊緣資源：

```powershell
# 1. 登入 Cloudflare 帳號
wrangler login

# 2. 建立 D1 資料庫 (請複製回傳的 database_id)
wrangler d1 create redolve-db

# 3. 建立 R2 儲存桶
wrangler r2 bucket create redolve-images

# 4. 建立 KV 命名空間 (請複製回傳的 id)
wrangler kv namespace create REDOLVE_KV
```


√ Select an account » 50313tjx06@gmail.com's Account
✅ Successfully created DB 'redolve-db' in region APAC
Created your new D1 database.

{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "redolve-db",
      "database_id": "966ad241-9a03-4719-99d6-c18314d7bf94"
    }
  ]
}

✅ Created bucket 'redolve-images' with default storage class of Standard.

Configure your Worker to write objects to this bucket:

{
  "r2_buckets": [
    {
      "bucket_name": "redolve-images",
      "binding": "redolve_images"
    }
  ]
}


🌀 Creating namespace with title "redolve-api-REDOLVE_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{
  "kv_namespaces": [
    {
      "binding": "REDOLVE_KV",
      "id": "b09131c5f54446f6bff12e368190572a"
    }
  ]
}

---

## 2. Secrets 金鑰注入

請執行以下指令將環境密鑰注入 Cloudflare Workers 生產環境：

```powershell
# Google Gemini API 金鑰
wrangler secret put GEMINI_API_KEY

# better-auth Session 簽名密鑰 (可使用 openssl rand -hex 32 生成)
wrangler secret put BETTER_AUTH_SECRET

# 管理者 Google 帳號白名單（逗號分隔多個 email）
# 取代原來的 ADMIN_SECRET，讓 Seed 操作綁定到 Google 帳號而非靜態 token
wrangler secret put ADMIN_EMAILS

# (選用) AI 供應商指定，預設為 gemini
wrangler secret put AI_PROVIDER
```

---

## 3. `wrangler.jsonc` 綁定設定

建立完資源後，請將獲得的 ID 填入 `wrangler.jsonc`：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "redolve-api",
  "main": "worker/index.ts",
  "compatibility_date": "2024-10-22",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "redolve-db",
      "database_id": "<填入你的 D1_DATABASE_ID>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "STORAGE",
      "bucket_name": "redolve-images"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "<填入你的 KV_NAMESPACE_ID>"
    }
  ]
}
```

---

## 4. Google OAuth 2.0 憑證設定

供更好的網頁端登入體驗（better-auth 整合）：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立 OAuth 2.0 轉發憑證（Web Application）。
3. 設定授權轉向 URI：
   - 本地開發：`http://localhost:5173/api/auth/callback/google`
   - 生產環境：`https://<YOUR_WORKER_DOMAIN>/api/auth/callback/google`
4. 將 Client ID 與 Client Secret 填入系統設定或 Secret。

---

## 5. 課綱分類樹初始化 (Seed)

Worker 部署完成後，以**管理者 Google 帳號登入** PWA ，們進「設定」頁面的「自訂科目與單元分類」標籤頁。

頁面底部會顯示「系統管理（管理者專區）」區塊（對非管理者帳號不顯示）。
點擊「執行課綱 Seed」按鈕即可全量寫入 D1 + KV，頁面上會顯示植入節點數量。

> 管理者帳號由 `ADMIN_EMAILS` secret 控制（逗號分隔多個 email）。
> 課綱改版時點擊一次即可全量更新。

預期回應（顯示於頁面）：
```
上次執行結果：成功植入 48 個節點
```

---

## 6. CORS 網域白名單

在 `worker/middleware/cors.ts` 或環境變數中，確認允許存取的 PWA 前端網域：
- 本地開發：`http://localhost:5173`
- 生產環境：`https://<YOUR_PWA_DOMAIN>.pages.dev`


wrangler secret put ADMIN_EMAILS