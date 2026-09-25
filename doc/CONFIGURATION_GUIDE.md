# Redolve 設定與部署指南

Redolve 以同一個 Cloudflare Worker 提供前端靜態資源與 `/api`。正式網址為 `https://redolve.jx06t.com`；瀏覽器登入使用同站的 HttpOnly session cookie。

## 既有資源與設定

`wrangler.jsonc` 已設定 D1 `DB`、R2 `STORAGE`、KV `KV`、靜態資源 `ASSETS`，以及訪客 AI 與上傳的速率限制 binding。新環境部署時，先建立對應資源，再更新各 binding 的 ID。速率限制對各 Cloudflare 資料中心分別生效，不應視為全球單一配額。

Worker 必需的秘密值：

```powershell
wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put ADMIN_EMAILS
```

`JWT_SECRET` 應使用密碼學安全的隨機值（至少 32 bytes）。`GOOGLE_CLIENT_ID` 目前在 `wrangler.jsonc` 的 `vars` 中。`FRONTEND_URL` 預設使用正式同站網址；如使用其他前端來源，須在 Worker 環境設定中加入精確 origin，並確認 cookie 同站規則。參考 [`.env.example`](../.env.example)。勿提交 `.dev.vars` 或真實秘密值。

## 資料庫

新建的本地 D1 可用完整 schema 初始化：

```powershell
wrangler d1 execute redolve-db --local --file=./worker/schema.sql
```

既有正式資料庫在部署這版 Worker **之前**，先備份 D1，然後執行新增 session 表的遷移：

```powershell
wrangler d1 execute redolve-db --remote --file=./worker/migrations/0001_auth_sessions.sql
```

遷移採 `IF NOT EXISTS`，可重複執行。既有 `shares.allow_notes` 欄位由分享路由的相容處理補建；完整 schema 已包含此欄位，不需另行執行 `ALTER TABLE`。部署後舊 JWT 因沒有可撤銷 session 記錄而失效，使用者須重新登入。

## Google OAuth

在 Google Cloud Console 建立 Web OAuth 用戶端，將以下 URI 加入「已授權的重新導向 URI」：

- 正式：`https://redolve.jx06t.com/api/auth/callback/google`
- 本地開發：`http://localhost:3000/api/auth/callback/google`

本地 Vite 預設在 `http://localhost:3000`，將 `/api` 轉送到本地 Worker `http://127.0.0.1:8787`。以 `localhost:3000` 開啟網頁可讓 OAuth state 與 session cookie 留在同一個瀏覽器來源。Google 登入完成後只在 URL 帶回 `auth=success`，憑證由 HttpOnly cookie 傳送。

## 驗收順序

1. 套用 D1 遷移，確認 Worker 的秘密值與 Google redirect URI。
2. 執行 `npm run build`，再部署 Worker 與靜態資源。
3. 驗證 Google 登入、重新整理後的登入狀態、登出後 `/api/auth/me` 為訪客。
4. 使用兩個帳號確認題目及圖片不能互相讀取；確認舊的 `?auth=` 圖片網址無法作為授權。
5. 驗證訪客離線收題、連線後分析、登入後同步、分享連結期限及撤銷立即生效。

正式環境部署及實體 iPad／iPhone 驗收需在可用的 Cloudflare、Google 帳號和裝置上完成。
