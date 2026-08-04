# 跨帳號題目派發與獨立筆跡層功能

實現「題目擁有者將特定錯題推播至指定帳號」，接收者在自己的刷題清單中看到該題，
並能以 Apple Pencil 獨立標注與維護自己的訂正狀態，互不干擾。

---

## User Review Required

> [!IMPORTANT]
> **派發方式確認**：系統用什麼識別「接收者」？
> 選項 A：輸入對方的 **電子郵件** (`users.email`)
> 選項 B：輸入一個 **邀請碼 / 房間碼**（不需要知道對方 email）
>
> 目前計畫假設 **選項 A（email）**，若需要邀請碼機制請在批准前告知。

> [!IMPORTANT]
> **接收者能否刪除派發來的題目？**
> 選項 A：只能更改自己的 status（unsolved/resolved），不能從清單移除
> 選項B：可以從自己清單「略過」（新增 dismissed 狀態），但不影響擁有者
>
> 目前計畫假設 **選項 A**（不可移除）。

> [!WARNING]
> **Schema Migration**：`dispatches` 是新增資料表，對現有 `items`、`shares` 表**不做任何修改**。
> 現有唯讀 token 分享功能**完全保留且不受影響**。

---

## Open Questions

> [!NOTE]
> **接收者的圖片存取**：接收者要看題目圖片，但圖片是以擁有者 `user_id` 存在 R2。
> 計畫在 Worker 的圖片代理路由加一個「dispatch 授權查詢」來穿透現有 user_id 隔離，
> 屬於最小侵入性的改法。

> [!NOTE]
> **Dashboard 統計**：接收者的 Dashboard 要不要統計被派發的題目？
> 目前計畫：**不納入**，Dashboard 只顯示自己上傳的題目統計，避免資料混淆。

---

## Proposed Changes

### 1. DB Layer — 新增 dispatches 資料表

#### [MODIFY] [schema.sql](file:///d:/Document_J/redolve/worker/schema.sql)

在現有 `shares` 表後方追加新表與索引：

```sql
-- 跨帳號題目派發表（與 token 分享完全獨立）
CREATE TABLE IF NOT EXISTS dispatches (
    id          TEXT PRIMARY KEY,           -- UUID，前綴 dp_
    item_id     TEXT NOT NULL,              -- 來自 items.id（擁有者的題目）
    owner_id    TEXT NOT NULL,              -- 題目擁有者 user_id
    receiver_id TEXT NOT NULL,             -- 接收者 user_id
    draw_data   TEXT,                      -- 接收者的獨立筆跡 JSON（DrawData 格式）
    vector_clock TEXT,                     -- 接收者的向量時鐘（防衝突）
    status      TEXT DEFAULT 'unsolved',   -- 接收者自己的訂正狀態
    dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (item_id, receiver_id),         -- 同一題不能重複派發給同一人
    FOREIGN KEY(item_id)     REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY(owner_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dispatches_receiver ON dispatches(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatches_owner    ON dispatches(owner_id, item_id);
```

---

### 2. Worker Types — 新增 DispatchRow

#### [MODIFY] [types.ts](file:///d:/Document_J/redolve/worker/types.ts)

新增 `DispatchRow` interface，讓 D1 查詢有型別安全。

```typescript
export interface DispatchRow {
  id: string;
  item_id: string;
  owner_id: string;
  receiver_id: string;
  draw_data: string | null;
  vector_clock: string | null;
  status: 'unsolved' | 'resolved';
  dispatched_at: string;
}
```

---

### 3. Worker Routes — 新路由檔

#### [NEW] [dispatches.ts](file:///d:/Document_J/redolve/worker/routes/dispatches.ts)

全部掛載 `authMiddleware`，共 **5 個端點**：

| 方法 | 路徑 | 功能 |
|---|---|---|
| `POST` | `/api/problems/:id/dispatch` | 擁有者輸入 email 派發 |
| `DELETE` | `/api/dispatches/:dispatchId` | 擁有者撤銷派發 |
| `GET` | `/api/dispatches/received` | 接收者取得被派發的題目列表 |
| `PATCH` | `/api/dispatches/:dispatchId/draw` | 接收者儲存筆跡（向量時鐘保護） |
| `PATCH` | `/api/dispatches/:dispatchId/status` | 接收者更新訂正狀態 |

關鍵邏輯說明：

- **`POST /dispatch`**：先以 email 查 `users` 表取得 `receiver_id`，若查無此帳號回傳 `404`（防止枚舉攻擊應只回傳「查無此帳號，請確認對方已登入過 Redolve」）。
- **`PATCH /.../draw`**：邏輯完全複製現有 `PATCH /:id/draw`（向量時鐘 seq 比較），但讀寫目標是 `dispatches.draw_data` 與 `dispatches.vector_clock`，確認 `receiver_id = userId`。

---

### 4. Worker Routes — 修改現有路由

#### [MODIFY] [problems.ts](file:///d:/Document_J/redolve/worker/routes/problems.ts)

**改動點 A：圖片代理穿牆（第 180-203 行）**

現有邏輯 `item.user_id !== userId` 直接 404。需在此條件之後，追加一個 dispatch 授權查詢：

```typescript
// 原有 owner 授權
if (item.user_id === userId) { /* 正常代理 */ }

// 新增：dispatch 接收者授權
const dispatch = await c.env.DB
  .prepare('SELECT id FROM dispatches WHERE item_id = ? AND receiver_id = ?')
  .bind(problemId, userId).first();
if (!dispatch) return c.json({ error: ... }, 404);
// 通過 -> 正常代理 R2 物件
```

**改動點 B：GET / 題目列表（第 116-161 行）不修改**

接收者的題目透過獨立的 `GET /api/dispatches/received` 路由取得，
前端用兩個獨立的 API call 分別撈資料後合併，
**避免 UNION 跨表分頁邏輯的複雜性**（這是評估中最難的點，用此方案完全規避）。

---

### 5. Frontend Types

#### [MODIFY] [src/types/index.ts](file:///d:/Document_J/redolve/src/types/index.ts)

新增 `DispatchedItem` interface，在 `Item` 之上包一層：

```typescript
export interface DispatchedItem {
  dispatch_id: string;
  item: Item;           // 原題目資料（擁有者的 image_url、keywords 等）
  owner_email: string;  // 顯示「誰派給你的」
  draw_data: string | null;    // 接收者自己的筆跡
  vector_clock: string | null;
  status: 'unsolved' | 'resolved';
  dispatched_at: string;
}
```

---

### 6. Frontend API Service

#### [MODIFY] [src/services/api.ts](file:///d:/Document_J/redolve/src/services/api.ts)

新增 5 個 API function，對應 Worker 的 5 個新端點：

```typescript
dispatchProblem(problemId, receiverEmail)
revokeDispatch(dispatchId)
fetchReceivedDispatches()
updateDispatchDrawData(dispatchId, drawData, seq)
updateDispatchStatus(dispatchId, status)
```

---

### 7. Frontend Components

#### [MODIFY] [src/components/ProblemCard.tsx](file:///d:/Document_J/redolve/src/components/ProblemCard.tsx)

新增一個 `isDispatched?: boolean` 與 `dispatchId?: string` prop：
- 頂部顯示一個**細小的橫幅**「由 [owner_email] 派發」，使用 dusty-rose 系列色
- 派發題的圖片 URL 改用帶 dispatch 授權的 `GET /api/problems/:id/image`（接收者 token 合法，無需額外路由）

筆跡儲存時，依照 `isDispatched` 判斷呼叫：
- `updateProblemDrawData(id, ...)` — 自己的題目
- `updateDispatchDrawData(dispatchId, ...)` — 收到的題目

#### [MODIFY] [src/components/DrawCanvas.tsx](file:///d:/Document_J/redolve/src/components/DrawCanvas.tsx)

新增 `onSave: (drawData, seq) => Promise<void>` callback prop，
把儲存邏輯外移給父元件（ProblemCard）決定呼叫哪個 API，
DrawCanvas 本身不需要知道題目是「自己的」還是「派發來的」。

#### [NEW] src/components/DispatchModal.tsx

輸入對方 email → 送出派發的簡單 Modal。
設計規格：`rounded-3xl`，`bg-white dark:bg-[#202023]`，單一 input，送出後顯示 Toast 確認。

#### [MODIFY] [src/components/Sidebar.tsx](file:///d:/Document_J/redolve/src/components/Sidebar.tsx)

在現有「全部 / 未訂正 / 已訂正」狀態篩選的下方，新增一個「收到的題目」分頁 Tab。
點擊後切換為顯示 `fetchReceivedDispatches()` 回傳的清單，走同一個虛擬滾動流。

---

### 8. Frontend Store

#### [MODIFY] [src/store/useStore.ts](file:///d:/Document_J/redolve/src/store/useStore.ts)

新增 state slice：

```typescript
// 新增
receivedDispatches: DispatchedItem[];
setReceivedDispatches: (items: DispatchedItem[]) => void;
updateDispatchInStore: (dispatchId: string, patch: Partial<DispatchedItem>) => void;
```

---

## Verification Plan

### Automated Tests（手動逐一驗證）

```
# 1. DB Migration
npx wrangler d1 execute redolve-db --local --file=worker/schema.sql

# 2. Worker type check
npx tsc --noEmit

# 3. Dev server
npm run dev
```

### Manual Verification

| 情境 | 預期結果 |
|---|---|
| 擁有者輸入合法 email 派發 | Worker 插入 `dispatches` 記錄，回傳 201 |
| 接收者重新整理 | Sidebar「收到的題目」出現該題，顯示「由 xxx 派發」橫幅 |
| 接收者 Apple Pencil 標注 | 筆跡存入 `dispatches.draw_data`，不影響 `items.draw_data` |
| 接收者標記已訂正 | `dispatches.status` 變 resolved，擁有者看自己的狀態不變 |
| 擁有者撤銷派發 | 接收者清單消失，再次呼叫圖片代理 → 403 |
| 輸入不存在的 email | Worker 回 404，前端顯示 Toast「查無此帳號」 |
| 重複派發同一題給同一人 | DB UNIQUE 約束觸發，Worker 回 409 |

---

## 實作順序建議

```
Phase 1 (後端基礎，約 2.5 hr)
  1. schema.sql — 加 dispatches 表
  2. worker/types.ts — 加 DispatchRow
  3. worker/routes/dispatches.ts — 5 個端點
  4. worker/routes/problems.ts — 圖片代理穿牆
  5. worker/index.ts — 掛載 dispatchesRouter

Phase 2 (前端整合，約 3 hr)
  6. src/types/index.ts — 加 DispatchedItem
  7. src/services/api.ts — 5 個新 function
  8. src/store/useStore.ts — 新增 receivedDispatches slice
  9. src/components/DrawCanvas.tsx — onSave callback 外移
  10. src/components/ProblemCard.tsx — isDispatched 分支 + 派發橫幅
  11. src/components/DispatchModal.tsx — [NEW] 派發輸入 Modal
  12. src/components/Sidebar.tsx — 收到的題目 Tab
```

**總預估工時：5.5 小時**
