---
name: apple-pencil-drawing
description: >-
  Apple Pencil 書寫優化、防誤觸設計、筆跡儲存與離線同步架構指引，
  適用於以 Canvas + Pointer Events API + perfect-freehand 為基礎的
  iPad PWA 書寫功能。涵蓋 PointerType 分離、四層防誤觸策略、
  壓力感測、非破壞性向量橡皮擦、雙手指 Undo/Redo 手勢、
  DrawData 資料結構、跨裝置縮放、IntersectionObserver Canvas 優化，
  以及 IndexedDB 離線儲存 + Vector Clock 雲端同步。
  觸發條件：建立繪圖元件、實作橡皮擦、處理 iPad 觸控分離、
  設計手跡資料結構或離線同步邏輯。
triggers:
  - 建立或修改 Canvas 繪圖元件
  - 實作 Apple Pencil / 觸控輸入分離
  - 防止 iPad 書寫時頁面誤滾動
  - 實作橡皮擦（軟體或硬體尖端）
  - 雙手指 Undo / 三手指 Redo 手勢
  - 設計筆跡資料儲存格式
  - 離線書寫 + 連線後雲端同步
---

# Apple Pencil 書寫優化與手跡儲存架構

---

## 設計核心原則

| 原則 | 說明 |
|------|------|
| PointerType 隔離 | `pen` / `touch` / `mouse` 走完全不同邏輯路徑，不共用分支 |
| CSS 防滾優先 | 在 CSS 層解決滾動問題，減少對 `e.preventDefault()` 的依賴 |
| Vector-only 儲存 | 所有筆跡以座標點陣列存儲，不存像素點陣圖 |
| 非破壞性橡皮擦 | 橡皮擦切割向量段，不刪除整條 Stroke |
| 離線優先 | 書寫後立即存 IndexedDB，恢復連線後再同步雲端 |

---

## 1. PointerType 分離架構

Pointer Events API 的 `e.pointerType` 是輸入分離的核心：

```typescript
const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
    // Apple Pencil 或滑鼠：始終允許繪圖
    if (e.pointerType === 'pen') {
      setPencilDetected(true);               // 標記已偵測 Pencil，可用於 UI 顯示
      canvasRef.current!.style.touchAction = 'none'; // 立即鎖定，防止 Pencil 觸發系統手勢
    }
    isMultiTouchGestureRef.current = false;  // 重置多指鎖定狀態

  } else if (e.pointerType === 'touch') {
    // 手指輸入
    if (!allowTouchDrawing) return;          // Pencil 模式下手指不繪圖

    // 多指攔截：非第一根手指的 pointer 一律拒絕
    if (!e.isPrimary || isMultiTouchGestureRef.current) {
      isMultiTouchGestureRef.current = true;
      setIsDrawing(false);
      return;
    }
  }

  // 通用邏輯：鎖定 pointer 確保 move 事件不因滑出 canvas 而中斷
  e.currentTarget.setPointerCapture(e.pointerId);
};
```

**`allowTouchDrawing` 全域狀態（Zustand store）：**
- `false`（預設）：Pencil 模式，手指保留給系統手勢
- `true`：無 Pencil 情境（手機用戶），手指可書寫

---

## 2. 防誤觸：四層疊加策略

**四層缺一不可，任何單層都不足以完整防護。**

### 層 1：全域 CSS Base（index.css）

```css
@layer base {
  html, body {
    overflow: hidden;
    overscroll-behavior: none; /* 禁止 iOS bounce / rubber-band 效果 */
  }

  body {
    touch-action: manipulation; /* 禁止雙擊縮放，保留單點點擊 */
    user-select: none;
    -webkit-user-select: none;
  }
}
```

### 層 2：Canvas 動態 touch-action

```css
/* Pencil 書寫中 → 完全鎖定 */
canvas.pencil-active {
  touch-action: none;
}
```

```typescript
// Pencil down → 鎖定（防 Pencil 觸發系統手勢）
canvasRef.current!.style.touchAction = 'none';

// Pencil up / cancel → 依狀態恢復
e.currentTarget.style.touchAction = readOnly
  ? 'pan-y'                              // 唯讀：允許垂直捲動
  : (allowTouchDrawing ? 'none' : 'pan-y');
```

### 層 3：touchstart 以 passive:false 攔截

```typescript
// passive: false 才能呼叫 e.preventDefault()
container.addEventListener('touchstart', handleTouchStart, { passive: false });
container.addEventListener('touchend',   handleTouchEnd,   { passive: true });

const handleTouchStart = (e: TouchEvent) => {
  const hasStylus = Array.from(e.touches).some((t: any) => t.touchType === 'stylus');

  if (hasStylus) {
    e.preventDefault(); // Pencil 正在書寫 → 阻止手指觸發任何副作用
    return;
  }

  // 允許手指繪圖時，單指也要 preventDefault 防止 overflow 容器捲動
  if (allowTouchDrawing && e.touches.length === 1) {
    e.preventDefault();
  }
};
```

> passive:false 有效能代價。若全 App 無需原生滾動，可在全域 `overflow: hidden` 解決，
> 減少各個 canvas 掛載 passive:false 的數量。

### 層 4：WebkitTouchCallout 禁長按選單

```tsx
<div style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
  <canvas ... />
</div>
```

---

## 3. 壓力感測與筆跡渲染

### e.pressure 值域

| 輸入類型 | pressure 值 |
|---------|------------|
| Apple Pencil | 0.0 ~ 1.0（真實壓力） |
| 滑鼠（按下） | 固定 0.5 |
| 手指觸控 | 固定 0.5 |

```typescript
const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
  const pressure = e.pressure || 0.5;
  setCurrentPoints(prev => [...prev, [x, y, pressure]]);
  //                                     ↑ 第三維度：壓力
};
```

### perfect-freehand 配置

```typescript
import getStroke from 'perfect-freehand';

function getStrokeOptions(tool: 'pen' | 'highlighter', width: number) {
  if (tool === 'highlighter') {
    return {
      size:       width <= 1 ? 14 : width <= 2 ? 18 : 30,
      thinning:   0.02, // 幾乎不隨壓力變細
      smoothing:  0.6,
      streamline: 0.6,
      opacity:    0.32, // 半透明螢光效果
    };
  }
  // 鋼筆：自然壓感
  return {
    size:       width <= 1 ? 1.5 : width <= 2 ? 2.5 : 6,
    thinning:   0.5,  // 壓力越大線條越粗
    smoothing:  0.5,
    streamline: 0.5,
    opacity:    1.0,
  };
}

// 渲染至 Canvas 2D Context
const strokePoints = getStroke(scaledPoints, opts);
const path = new Path2D(getSvgPathFromStroke(strokePoints));
ctx.fillStyle = activeColor; // 由 props 傳入，不在此硬編碼色碼
ctx.globalAlpha = opts.opacity;
ctx.fill(path);
```

**Quadratic Bézier 路徑生成（保持平滑）：**

```typescript
function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return '';
  return points.reduce((acc, [x0, y0], i, arr) => {
    if (i === 0) return `M ${x0},${y0}`;
    const [x1, y1] = arr[i - 1];
    return `${acc} Q ${x1},${y1} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
  }, '');
}
```

---

## 4. 橡皮擦機制

### 觸發偵測

```typescript
// 硬體橡皮擦（Apple Pencil 2 尖端翻轉 / 側鍵）
const isHardwareEraser = e.buttons === 32 || e.button === 5;
const isEffectiveEraser = isEraserActive || activeTool === 'eraser' || isHardwareEraser;
```

| 偵測條件 | 觸發方式 |
|---------|---------|
| `e.buttons === 32` | Apple Pencil 2 橡皮擦尖端 |
| `e.button === 5` | Pencil 側鍵（部分機型） |
| `activeTool === 'eraser'` | 軟體橡皮擦工具 |

### 非破壞性向量切割橡皮擦

橡皮擦**不刪除整條 Stroke**，而是按照四個步驟切割：

```typescript
const eraseAt = (screenX: number, screenY: number) => {
  const eraserRadius = getEraserRadius(activeWidth);
  const stepSize = Math.max(2, eraserRadius * 0.35);
  const nextStrokes: Stroke[] = [];

  for (const stroke of strokes) {
    // 步驟 1：Bounding Box 快速排除（無交集的 Stroke 直接保留）
    if (noIntersect(stroke, screenX, screenY, eraserRadius)) {
      nextStrokes.push(stroke);
      continue;
    }
    // 步驟 2：密集化插值（防止快速滑動產生切割缺口）
    const densified = densifyPoints(stroke.points, stepSize);
    // 步驟 3：以橡皮擦圓為邊界，圓內點丟棄，圓外連續點成為子筆段
    const chunks = splitByEraser(densified, screenX, screenY, eraserRadius ** 2);
    nextStrokes.push(...chunks.map(pts => ({ ...stroke, points: pts })));
  }
  setStrokes(nextStrokes);
};
```

**連續拖動線性插值（防止快速滑動造成橡皮擦跳格）：**

```typescript
const performErase = (screenX: number, screenY: number) => {
  if (lastErasePosRef.current) {
    const { x: lx, y: ly } = lastErasePosRef.current;
    const dist = Math.hypot(screenX - lx, screenY - ly);
    const stepSize = Math.max(3, getEraserRadius(activeWidth) * 0.4);
    if (dist > stepSize) {
      const steps = Math.min(24, Math.ceil(dist / stepSize));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        eraseAt(lx + (screenX - lx) * t, ly + (screenY - ly) * t);
      }
      lastErasePosRef.current = { x: screenX, y: screenY };
      return;
    }
  }
  eraseAt(screenX, screenY);
  lastErasePosRef.current = { x: screenX, y: screenY };
};
```

**視覺橡皮擦游標（使用 CSS Token，Dark Mode 自動適配）：**

```tsx
{isErasingLive && eraserCursorPos && (
  <div
    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2
               rounded-full border border-status-danger/70 bg-status-danger/15 z-20"
    style={{
      left:   eraserCursorPos.x,
      top:    eraserCursorPos.y,
      width:  getEraserRadius(activeWidth) * 2,
      height: getEraserRadius(activeWidth) * 2,
    }}
  />
)}
```

---

## 5. 雙手指手勢（Undo / Redo）

**設計：** 雙指 = Undo、三指 = Redo。  
**安全性：** Pencil 書寫時，手掌觸碰不得觸發手勢。

```typescript
const handleTouchStart = (e: TouchEvent) => {
  // Pencil 偵測：stylus touchType 或已知 pen pointer 活躍中
  const hasStylus = Array.from(e.touches).some((t: any) => t.touchType === 'stylus');
  if (hasStylus) return; // Pencil 書寫中 → 不觸發任何手勢

  const count = Math.max(e.targetTouches.length, e.touches.length);

  if (count >= 2 && count <= 3) {
    e.preventDefault();
    isMultiTouchGestureRef.current = true;
    setIsDrawing(false);    // 中止任何進行中的筆畫
    setCurrentPoints([]);

    pendingTouchCountRef.current = count;

    // 50ms debounce：等手指數量穩定（避免 1→2 過渡觸發錯誤手勢）
    clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastUndoTimestampRef.current <= 350) return; // 350ms throttle 防連擊
      lastUndoTimestampRef.current = now;

      if (pendingTouchCountRef.current === 2) undoLastStroke();
      else if (pendingTouchCountRef.current === 3) redoLastStroke();
    }, 50);
  }
};

// 所有手指離開後 80ms 才解除多指鎖定
// （防止 finger lift 觸發意外單指繪圖）
const handleTouchEnd = (e: TouchEvent) => {
  if (e.targetTouches.length === 0) {
    setTimeout(() => { isMultiTouchGestureRef.current = false; }, 80);
  }
};
```

---

## 6. 向量手跡資料結構

所有筆跡以純 JSON 儲存，不依賴圖片格式，支援無損縮放與跨裝置播放。

```typescript
interface Stroke {
  color: string;                          // 色碼字串（e.g. "#6366F1"）
  width: number;                          // 筆寬等級（1 | 2 | 3），非 px
  opacity?: number;                       // 0~1，Highlighter 約 0.32
  points: [number, number, number][];     // [x, y, pressure]，base coordinate space
  tool?: 'pen' | 'highlighter';
}

interface DrawData {
  strokes: Stroke[];
  eraserMasks: EraserMask[];       // 備用，目前以向量切割取代
  baseWidth: number;               // 錄製當下的 canvas 寬度（跨裝置縮放基準）
  baseHeight: number;
  calcSpaceHeight: number;         // 可展開計算空間的基礎高度
  expansions?: { addedHeight: number; atY: number }[];
}
```

> `Stroke.color` 儲存的是色碼字串，而非 CSS Token 名稱。  
> 建議定義有限的調色盤（如 5 種顏色），在 Toolbar 層從 Token 解析後傳入 Canvas，
> Canvas 元件內部只接受 `activeColor: string` props，不自行查找 Token。

---

## 7. Canvas 掛載最佳化

### IntersectionObserver：視窗外 Canvas 不渲染

```typescript
useEffect(() => {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => setIsVisible(e.isIntersecting)),
    { threshold: 0.05 }  // 5% 可見即進入 viewport
  );
  observer.observe(containerRef.current!);
  return () => observer.disconnect();
}, []);

// 不可見 → 回退靜態 SVG 快照（零 GPU 消耗）
return isVisible
  ? <canvas ... />
  : <svg>{strokes.map(s => <path d={getSvgPath(s)} fill={s.color} opacity={s.opacity} />)}</svg>;
```

### ResizeObserver：追蹤容器尺寸變化

```typescript
useEffect(() => {
  const updateSize = () => {
    setCanvasWidth(containerRef.current?.clientWidth || 800);
    setCanvasHeight(containerRef.current?.clientHeight || 400);
  };
  updateSize();
  const ro = new ResizeObserver(updateSize);
  ro.observe(containerRef.current!);
  return () => ro.disconnect();
}, []);
```

---

## 8. 跨裝置縮放計算

iPad（1024px 寬）書寫的筆跡，在手機（390px）上顯示需等比縮小。

```typescript
function computeScale(strokes: Stroke[], currentWidth: number, storedBaseWidth?: number): number {
  // 精確縮放：有 baseWidth 直接計算
  if (storedBaseWidth && storedBaseWidth > 0) return currentWidth / storedBaseWidth;

  // 舊格式相容：從座標推斷原始錄製寬度
  if (strokes.length > 0) {
    const maxX = Math.max(...strokes.flatMap(s => s.points.map(p => p[0])));
    if (maxX > currentWidth) {
      const inferredWidth = maxX > 900 ? 1024 : maxX > 700 ? 800 : maxX + 20;
      return currentWidth / inferredWidth;
    }
  }
  return 1.0;
}
```

**儲存時必須記錄 baseWidth：**

```typescript
const emitSave = (strokes, eraserMasks, currentHeight, currentWidth) => {
  const payload: DrawData = {
    strokes, eraserMasks,
    baseWidth: currentWidth,   // 當下 canvas 寬度
    baseHeight: currentHeight,
    calcSpaceHeight,
  };
  onSaveDrawData(payload);
};
```

---

## 9. 離線儲存與雲端同步

### IndexedDB Schema（idb 套件）

```typescript
// src/services/offlineStorage.ts
const db = await openDB('app_offline_db', 3, {
  upgrade(db) {
    db.createObjectStore('syncQueue',       { keyPath: 'id' }); // 繪圖離線佇列
    db.createObjectStore('offlineProblems', { keyPath: 'id' }); // 未上傳的新題目
  },
});
```

### 書寫後立即儲存策略

```typescript
const handleSaveDrawData = async (drawData: DrawData) => {
  updateLocalStore(itemId, drawData);    // 1. 更新 Zustand store（即時 UI 反應）
  try {
    await updateItemDrawData(itemId, drawData, seq); // 2. 嘗試 API 上傳
  } catch {
    await queueOfflineDraw(itemId, drawData, seq);   // 3. 失敗 → 寫入 IndexedDB
  }
};
```

### 恢復連線後自動同步

```typescript
window.addEventListener('online', async () => {
  const items = await getQueuedDraws();
  for (const item of items) {
    const success = await syncCallback(item);
    if (success) await removeQueuedDraw(item.id);
  }
});
```

### Vector Clock（防舊版本覆蓋新版本）

```typescript
interface VectorClock {
  clientId: string; // localStorage 產生的裝置唯一識別碼
  seq: number;      // 每次書寫後遞增
}

// Worker 側驗證：seq 不得小於 DB 中已存的 seq
if (incoming.seq < existing.seq) {
  return c.json({ error: 'CONFLICT' }, 409);
}
```

---

## 10. 實作核對清單

**防誤觸：**
- `[ ]` `html, body { overflow: hidden; overscroll-behavior: none }`
- `[ ]` `body { touch-action: manipulation }` 禁止雙擊縮放
- `[ ]` `touchstart` 以 `{ passive: false }` 掛載
- `[ ]` Pencil down → `canvas.style.touchAction = 'none'`
- `[ ]` Pencil up → 依 readOnly / allowTouchDrawing 恢復 touchAction
- `[ ]` 容器 wrapper 設定 `WebkitTouchCallout: 'none'`

**輸入分離：**
- `[ ]` `pointerType === 'touch'` 時預設 return（除非 allowTouchDrawing）
- `[ ]` `!e.isPrimary` 時拒絕繪圖
- `[ ]` `e.buttons === 32` 觸發硬體橡皮擦
- `[ ]` `setPointerCapture(e.pointerId)` 確保 move 事件不因滑出而中斷

**橡皮擦：**
- `[ ]` Bounding Box 快速排除（效能優化）
- `[ ]` 連續拖動做線性插值補點（防跳格）
- `[ ]` 視覺橡皮擦游標使用 CSS Token（Dark Mode 自動適配）

**手勢：**
- `[ ]` 50ms debounce 等手指數量穩定
- `[ ]` 350ms throttle 防連擊 Undo
- `[ ]` 手指離開後 80ms 才解除多指鎖

**資料與同步：**
- `[ ]` 首次書寫時記錄 baseWidth
- `[ ]` pointerUp 後呼叫 emitSave（含完整 DrawData）
- `[ ]` API 失敗 → 寫入 IndexedDB syncQueue
- `[ ]` `window.online` 事件觸發自動同步
- `[ ]` Worker 端 Vector Clock seq 檢查
