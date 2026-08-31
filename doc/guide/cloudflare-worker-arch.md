---
name: cloudflare-worker-arch
description: >-
  Cloudflare Worker 前後端配置與 AI API 集成架構指引，適用於以
  Hono + Cloudflare Workers + D1 + R2 + KV 為基礎的全端 PWA 專案。
  涵蓋 wrangler.jsonc 宣告、Bindings 型別、CORS / Auth Middleware、
  Hono 路由模組結構、AI Provider 工廠模式、Gemini SDK + REST 雙滾梯備援、
  以及安全實務清單。觸發條件：初始化 Worker 專案、設定 Cloudflare 資源、
  新增路由模組、整合 AI API、審查安全配置。
triggers:
  - 初始化 Cloudflare Worker 或 Pages 專案
  - 設定 wrangler.jsonc D1 / R2 / KV 資源
  - 撰寫或修改 Hono 路由 / Middleware
  - 整合 Gemini 或其他 AI API
  - 審查 CORS / JWT / Secret 安全配置
---

# Cloudflare Worker — 前後端配置與 AI API 集成架構

---

## 整體架構

```
Browser (Vite SPA + PWA)
  │
  ├── 開發環境：Vite Proxy → wrangler dev :8787
  └── 生產環境：Cloudflare Pages → Cloudflare Workers
                    │
                    ▼
             Hono App (worker/index.ts)
               ├── Middleware: CORS → Security Headers → Error Handler
               ├── /api/auth       JWT + OAuth
               ├── /api/items      D1 + R2 + AI 標記
               ├── /api/taxonomy   D1 分類樹
               ├── /api/search     D1 FTS5
               ├── /api/dashboard  D1 統計
               ├── /api/keys       API Key 管理
               └── /              公開分享 / SPA Fallback

Cloudflare Bindings
  ├── D1 (DB)       SQLite 主資料庫
  ├── R2 (STORAGE)  圖片 / 二進位物件儲存
  └── KV            輕量鍵值快取
```

**技術選型原則：**
- Worker 框架：**Hono**（輕量、型別安全、Web-standard API）
- 不使用 Workbox；Service Worker 手寫，快取策略明確可控
- 本地開發透過 Vite Proxy 直連 Worker，生產環境由 Cloudflare 路由

---

## 1. Cloudflare 資源宣告（wrangler.jsonc）

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-project-api",
  "main": "worker/index.ts",
  "compatibility_date": "2024-10-22",
  "compatibility_flags": ["nodejs_compat"],

  // 明文環境變數（非敏感）
  "vars": { "ENV": "production" },

  // D1 SQLite
  "d1_databases": [{
    "binding": "DB",
    "database_name": "my-project-db",
    "database_id": "<YOUR_D1_ID>"
  }],

  // R2 Object Storage
  "r2_buckets": [{
    "binding": "STORAGE",
    "bucket_name": "my-project-images"
  }],

  // KV Namespace
  "kv_namespaces": [{
    "binding": "KV",
    "id": "<YOUR_KV_ID>"
  }]
}
```

**敏感 Secret 不得進入 `wrangler.jsonc` 或 git：**

```ini
# .dev.vars（本地開發，已加入 .gitignore）
GEMINI_API_KEY=...
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ALLOWED_ORIGINS=http://localhost:3000
```

```bash
# 生產環境：透過 CLI 寫入
wrangler secret put GEMINI_API_KEY
wrangler secret put JWT_SECRET
```

---

## 2. Worker Bindings 型別定義

```typescript
// worker/types.ts
export interface Bindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;

  // Secrets（wrangler secret put）
  GEMINI_API_KEY?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // 可選配置
  AI_PROVIDER?: string;     // 'gemini' | 'openai'，預設 'gemini'
  ALLOWED_ORIGINS?: string; // 逗號分隔的額外允許 Origin
  ENV?: string;
  FRONTEND_URL?: string;
}

export interface Variables {
  // authMiddleware 注入，route handler 以 c.get('userId') 取得
  userId: string;
  userEmail: string | null;
}
```

```typescript
// worker/index.ts
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
```

---

## 3. Middleware 層

### 3.1 CORS（worker/middleware/cors.ts）

```typescript
import { cors } from 'hono/cors';

const STATIC_ALLOWED_ORIGINS = [
  'https://your-app.pages.dev',
  'https://your-domain.com',
];

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) return '*'; // 同源 / server-to-server

    // 本地開發 IP 範圍
    if (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(:\d+)?$/.test(origin)
    ) return origin;

    // 動態 Origin（從環境變數讀取，支援 staging 環境熱增加）
    const envOrigins = (c.env as Bindings).ALLOWED_ORIGINS;
    const allowed = [
      ...STATIC_ALLOWED_ORIGINS,
      ...(envOrigins?.split(',').map(s => s.trim()) ?? []),
    ];
    if (allowed.includes(origin)) return origin;

    // Cloudflare Pages Preview 子域名
    if (origin.startsWith('https://') && origin.endsWith('.your-app.pages.dev')) return origin;

    return null; // 拒絕
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
```

### 3.2 Auth（worker/middleware/auth.ts）

支援四種憑證方式，按優先順序解析：

| 優先 | 方式 | 載體 | 使用場景 |
|-----|------|------|---------|
| 1 | API Key | `Authorization: Bearer rdv_...` | 長期 / 程式整合 |
| 2 | JWT | `Authorization: Bearer eyJ...` | 登入後 Session |
| 3 | Session Cookie | `Cookie: session=eyJ...` | 瀏覽器自動帶入 |
| 4 | Query Param | `?auth=eyJ...` | `<img>` / media 資源 |

```typescript
// authMiddleware：必須登入，否則 401
export async function authMiddleware(c, next) {
  const { userId, userEmail } = await resolveAuthCredentials(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', userId);
  c.set('userEmail', userEmail);
  await next();
}

// optionalAuthMiddleware：登入與否皆可，由 route handler 判斷
export async function optionalAuthMiddleware(c, next) {
  const { userId, userEmail } = await resolveAuthCredentials(c);
  c.set('userId', userId || '');
  c.set('userEmail', userEmail || '');
  await next();
}
```

**JWT 工具函式：**

```typescript
import { sign, verify } from 'hono/jwt';

export async function createAuthJwt(user, env, expiresInSeconds = 2592000) {
  // 預設 30 天
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.id, email: user.email, iat: now, exp: now + expiresInSeconds },
    getJwtSecret(env)
  );
}
```

### 3.3 全域安全 Headers（worker/index.ts）

```typescript
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});
```

---

## 4. 路由模組結構

**worker/index.ts 入口（Middleware 掛載順序重要）：**

```typescript
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', corsMiddleware);
app.use('*', securityHeadersMiddleware);
app.onError(errorHandler);

app.get('/api/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));

app.route('/api/auth',      authRouter);
app.route('/api/items',     itemsRouter);
app.route('/api/taxonomy',  taxonomyRouter);
app.route('/api/search',    searchRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/',              sharesRouter); // SPA fallback / 公開分享

export default app;
```

**路由模組範本（worker/routes/items.ts）：**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

export const itemsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

itemsRouter.use('*', authMiddleware); // 所有 /api/items/* 要求登入

itemsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  // 永遠用 .bind() 參數化，禁止字串拼接 SQL
  const { results } = await c.env.DB
    .prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, 20)
    .all();
  return c.json(results);
});
```

**D1 查詢最佳實踐：**

```typescript
// 批次寫入（避免 N+1 往返）
await db.batch(stmts);

// 游標分頁（避免 OFFSET 效能問題）
const cursor = decodeCursor(c.req.query('cursor') ?? '');
const query = cursor
  ? 'SELECT * FROM items WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
  : 'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
```

---

## 5. AI 服務集成

### 5.1 AIService 抽象介面

```typescript
// worker/services/ai/AIService.ts
export interface AIService {
  tagItem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null>;
}

export interface TagResult {
  topic_id: string | null;   // 對應 taxonomy 節點 ID，嚴格驗證
  keywords: string[];
  keyword_tokens: string[];  // 去停用詞 / 正規化後的搜尋 token
  ocr_text: string;
}
```

### 5.2 Provider 工廠（環境變數切換）

```typescript
// worker/services/ai/index.ts
export function createAIService(env: Bindings): AIService {
  switch (env.AI_PROVIDER ?? 'gemini') {
    case 'gemini': return new GeminiService(env.GEMINI_API_KEY ?? '');
    // case 'openai': return new OpenAIService(env.OPENAI_API_KEY ?? '');
    default:       return new GeminiService(env.GEMINI_API_KEY ?? '');
  }
}
// 切換 Provider 只需設 AI_PROVIDER 環境變數，業務邏輯不動
```

### 5.3 Gemini 雙滾梯備援機制

```typescript
// worker/services/ai/GeminiService.ts

// 有效模型候選列表（隨 Google 官方文件更新）
// 舊版固定版本（1.5 / 2.0 / 2.5 無 -latest）已廢棄，勿使用
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
];

class GeminiService implements AIService {
  async tagItem(imageBytes, taxonomyTree) {
    const modelsToTry = [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)];

    // Attempt 1: 官方 @google/genai SDK（支援 Structured Outputs）
    if (this.aiClient) {
      for (const model of modelsToTry) {
        try {
          const response = await this.aiClient.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [
              { text: systemPrompt },
              { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
            ]}],
            config: {
              responseMimeType: 'application/json',
              responseSchema: sdkSchema, // 從 DB taxonomy 動態建構
              temperature: 0.1,
            },
          });
          if (response.text) return sanitizeResult(JSON.parse(cleanJson(response.text)));
        } catch { /* 嘗試下一個模型 */ }
      }
    }

    // Attempt 2: 直接 REST Fetch（SDK 全部失敗的備援）
    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(restPayload) });
        if (res.ok) {
          const text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return sanitizeResult(JSON.parse(cleanJson(text)));
        }
      } catch { /* 嘗試下一個模型 */ }
    }

    return null; // 全部失敗 → route handler 決定降級行為
  }
}
```

**Structured Outputs Schema 從 DB taxonomy 動態建構（確保 AI 只回合法 ID）：**

```typescript
function buildResponseSchema(tree: TaxonomyNode[]) {
  const validIds = collectAllIds(tree); // 遞迴蒐集所有節點 ID
  return {
    type: 'object',
    properties: {
      topic_id:       { type: 'string', enum: [...validIds, 'null'] },
      keywords:       { type: 'array', items: { type: 'string' } },
      keyword_tokens: { type: 'array', items: { type: 'string' } },
      ocr_text:       { type: 'string' },
    },
    required: ['topic_id', 'keywords', 'keyword_tokens', 'ocr_text'],
  };
}
```

### 5.4 圖片上傳 → R2 → AI 標記流程

```
POST /api/items  (multipart/form-data)
  1. authMiddleware 驗證
  2. 解析 FormData 取得 File
  3. 上傳至 R2 → 取得永久 image_url
  4. 寫入 D1（status: 'processing'）
  5. createAIService(env).tagItem(imageBytes, taxonomyTree)
       成功 → 更新 D1 keywords / topic_id（status: 'unsolved'）
       失敗 → 保留 null，前端顯示「等待標記」
  6. 回傳完整 item JSON
```

---

## 6. 前端 Vite 代理配置

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true, // 允許 LAN 訪問（iPad 真機調試）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787', // wrangler dev 預設 port
        changeOrigin: true,
      },
      '/share': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        bypass: (req) => {
          // HTML 導航 → 前端 SPA shell
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
    },
  },
});
```

---

## 7. 本地開發指令

```bash
# 啟動前端 + Worker（分兩個 terminal）
npm run dev          # Vite → http://localhost:3000
npm run worker:dev   # wrangler dev → http://localhost:8787

# 初始化本地 D1
wrangler d1 execute my-project-db --local --file=./worker/schema.sql

# 建立 Cloudflare 資源（首次）
wrangler d1 create my-project-db
wrangler r2 bucket create my-project-images
wrangler kv namespace create MY_KV

# 寫入 Production Secrets
wrangler secret put GEMINI_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_CLIENT_SECRET
```

---

## 8. 安全實務清單

| 項目 | 要求 |
|------|------|
| 敏感 Secret | 不得進入 `wrangler.jsonc` 或 git，使用 `wrangler secret put` |
| CORS | 精確列舉合法 Origin，禁止 `origin: '*'` 搭配 `credentials: true` |
| JWT Secret | 強亂數至少 32 字元，每個環境用不同 Secret |
| SQL 查詢 | 全部使用 `.bind()` 參數化，禁止字串拼接 |
| R2 存取 | 透過 Worker 代理，不暴露直接物件 URL |
| Auth 中介 | 所有需認證路由掛載 `authMiddleware`，勿依賴前端路由隱藏 |
| Admin 路由 | 額外驗證 `ADMIN_EMAILS` 白名單，不僅憑 JWT 判斷 |
| AI 回傳值 | `sanitizeResult()` 嚴格驗證 topic_id 是否在合法集合內 |
