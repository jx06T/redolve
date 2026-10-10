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

## Worker 執行區域與 Gemini

`wrangler.jsonc` 頂層已固定以下 Placement Hint，後續 Wrangler／自動部署應保留：

```jsonc
"placement": {
  "region": "gcp:asia-east1"
}
```

2026-10-07 正式環境 Gemini 回傳 `400 FAILED_PRECONDITION: User location is not supported for the API use.`；使用者在 Cloudflare 後台改為 GCP `asia-east1` 後確認恢復，故將相同設定納入版本控制。只在後台修改設定不能代替儲存庫配置，後續部署會使用 Wrangler 檔案。

- `gcp:asia-east1` 是 Cloudflare 的執行位置提示，將整個 `redolve-api` Worker 放在延遲接近該 GCP 區域的 Cloudflare 資料中心；仍在 Cloudflare 執行，不需建立 GCP 專案／伺服器。
- 這是部署配置，無需新增 `.env`／secret 或 D1 migration；不要同時加入 `placement.mode: "smart"`，兩種方式互斥。
- 本地 `wrangler dev` 仍在本機執行，呼叫 Gemini 使用本機網路；此配置不會把本地開發請求轉至 `asia-east1`。
- Placement 不保證固定出口 IP。部署後，對既有題目執行一次「重新分析」並確認成功；需要診斷時，先開啟 `npx wrangler tail redolve-api --format pretty` 再觸發分析。
- 分享版本發布仍須先完成 [分享發布流程](SHARING_RELEASE_RUNBOOK.md) 的資料庫與資產前置步驟；區域配置不取代這些步驟。

配置依據：[Cloudflare Placement 文件](https://developers.cloudflare.com/workers/configuration/placement/)。

## 資料庫

### 本地開發

本地 `wrangler dev` 使用 `.wrangler/state` 下的 D1、R2、KV；正式資料庫套用過 migration 不會更新本地資料庫。本地 `no such table: collections`／`saved_refs` 代表缺少分享 schema。

先停止本地 Worker，再初始化或升級本地 D1：

```powershell
npm run d1:init
npm run d1:check
```

初始化腳本固定使用 `--local`，升級前保留本地 D1 備份至 `.wrangler/local-db-backups/`；保留既有資料，完整 schema 時重跑會跳過。部分套用的分享 schema 會停止並提示人工檢查，不會盲目重跑一次性 migration。`d1:check` 只檢查 schema，不套用 migration；缺少必要結構時 exit code 為 1。

分別開兩個終端機：

```powershell
# 終端機一：本地 API
npm run worker:dev

# 終端機二：前端與即時更新
npm run dev
```

開啟 `http://localhost:3000`。`npm run dev` 只啟動 Vite，不包含 Worker；直接開 `8787` 會使用上次建置的 `dist`。本地 secrets 放在 `.dev.vars`，正式環境 secrets 不會自動下載。本地題庫及圖片也不會自動複製正式環境內容。

若全域 npm 入口異常，可改用 `node scripts/init-local-db.mjs`、`node node_modules/wrangler/bin/wrangler.js dev`、`node node_modules/vite/bin/vite.js`。

### 正式資料庫

以下 0001 為登入改版的初次遷移步驟；本正式環境已執行。**這次共用／訂閱發布請依 [本次部署後操作指南](SHARING_RELEASE_RUNBOOK.md)，不需要重跑 0001 或 0002。** 新環境若只有舊 schema，才先取得 Time Travel bookmark 並執行新增 session 表的遷移：

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
