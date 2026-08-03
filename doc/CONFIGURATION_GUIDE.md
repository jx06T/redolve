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

---

## 2. Secrets 金鑰注入

請執行以下指令將環境密鑰注入 Cloudflare Workers 生產環境：

```powershell
# Google Gemini API 金鑰
wrangler secret put GEMINI_API_KEY

# better-auth Session 簽名密鑰 (可使用 openssl rand -hex 32 生成)
wrangler secret put BETTER_AUTH_SECRET

# 課綱 Seed API 管理者憑證 (用於初始化與更新課綱樹)
wrangler secret put ADMIN_SECRET

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

## 5. 課綱分類樹初始化 (Seed API 呼叫)

Worker 部署完成後，請執行一次 Seed API 寫入學測/分科測驗課綱至 D1 與 KV：

```powershell
# 呼叫管理者 Seed 端點
curl -X POST https://<YOUR_WORKER_DOMAIN>/api/admin/taxonomy/seed `
  -H "Authorization: Bearer <填入你的 ADMIN_SECRET>"
```

預期回應：
```json
{
  "status": "seeded",
  "count": 48
}
```

---

## 6. CORS 網域白名單

在 `worker/middleware/cors.ts` 或環境變數中，確認允許存取的 PWA 前端網域：
- 本地開發：`http://localhost:5173`
- 生產環境：`https://<YOUR_PWA_DOMAIN>.pages.dev`
