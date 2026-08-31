---
name: tailwind-color-system
description: >-
  Tailwind CSS v4 配色系統設計指引（通用版）。任何以 Tailwind v4 + Vite 為基礎的新專案，
  在建立 index.css @theme 區塊、定義品牌色、進行 Dark Mode 設定，或審查元件是否出現
  直接色碼（hex / rgb）時，必須載入此文件。觸發條件：寫 @theme、定義 Token、
  設定 Dark Mode、審查 className 是否出現 bg-[#...] 等 arbitrary 色碼。
triggers:
  - 新專案初始化配色系統
  - 定義或修改 @theme Token
  - 審查元件是否違反「禁止直接色碼」規則
  - Dark Mode 切換機制設計
  - v3 → v4 遷移工作
---

# Tailwind CSS v4 — 配色系統設計指引

本文件規範層次結構與命名慣例，不預設具體色碼，可直接套用於任何新專案。

---

## 核心執行規則（必讀）

**建立 Token 後，整個代碼庫任何地方都不得出現直接色碼。** 這條規則不設例外。

| 禁止寫法 | 正確替代 |
|---------|---------|
| `className="bg-[#6366F1]"` | `className="bg-primary"` |
| `className="text-gray-500"` | `className="text-text-muted"` |
| `style={{ color: '#374151' }}` | `style={{ color: 'var(--color-text-main)' }}` |
| `border: '1px solid #E5E7EB'` | `className="border border-border-subtle"` |
| `fill="#xxx"` (SVG inline) | `fill="currentColor"` + 父層 `className="text-primary"` |
| `ctx.fillStyle = '#xxx'` (Canvas) | 由 props 傳入，props 來自上層 Token 解析 |
| `bg-[#xxx]/20` | `bg-primary/20`（Token + opacity modifier） |
| `className="text-blue-500"` | 定義對應語意 Token 後使用 |

---

## 1. CSS-first 配置基礎

**安裝：**

```bash
npm install tailwindcss @tailwindcss/vite
```

**`vite.config.ts`（無需 postcss.config.js / tailwind.config.ts）：**

```typescript
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

**`src/index.css` 唯一入口結構：**

```css
@import "tailwindcss";

/* Step 1: Dark Mode Variant 宣告（必須在 @theme 之前） */
@custom-variant dark (&:where(.dark, .dark *));

/* Step 2: 所有 Token 定義（Light Mode 預設值） */
@theme {
  /* ... 見下方五層架構 ... */
}

/* Step 3: Dark Mode Token 覆寫 */
@layer theme {
  .dark {
    /* ... 見 Dark Mode 章節 ... */
  }
}

/* Step 4: Base 全域樣式 */
@layer base {
  /* ... */
}
```

**v4 正確寫法對照（v3-era 語法已不推薦）：**

| 正確（v4） | 不應再出現（v3） |
|---|---|
| `@import 'tailwindcss'` | `@tailwind base/components/utilities` |
| `@theme { --color-x: ...; }` | `tailwind.config.ts` 的 `theme.extend` |
| `@utility name { ... }` | `@layer utilities { .name { ... } }` |
| `@custom-variant dark (...)` | JS `darkMode: 'class'` 配置 |
| `@layer theme { .dark { ... } }` | JS plugins 的 `addVariant` |
| `var(--color-x)` in CSS | CSS `theme()` function |

---

## 2. 配色系統的五個層次

從「原始色階」到「語意色」由低到高分五層。**元件程式碼只使用第 5 層；第 1~4 層是建構基礎，非必要不直接用於元件。**

```
Layer 1  Brand Primary Scale   品牌主色階  (50 ~ 950)
Layer 2  Neutral Scale         中性灰階    (50 ~ 950)
Layer 3  Accent Scale          點綴色      (依設計決定數量)
Layer 4  Brand Aliases         品牌語意別名
Layer 5  Core UI Tokens        核心介面語意 + Status 狀態色   ← 元件主要使用此層
```

### Layer 1：Brand Primary Scale

```css
@theme {
  --color-primary-50:  <最淺>;
  --color-primary-100: <...>;
  --color-primary-200: <...>;
  --color-primary-300: <...>;
  --color-primary-400: <...>;
  --color-primary-500: <主色 — 品牌 LOGO 色>;
  --color-primary-600: <深一階，常用於 hover>;
  --color-primary-700: <...>;
  --color-primary-800: <...>;
  --color-primary-900: <...>;
  --color-primary-950: <最深>;

  /* 語意快捷別名 */
  --color-primary:       var(--color-primary-500);
  --color-primary-hover: var(--color-primary-600);
}
```

自動生成的 utilities：`bg-primary-500` `text-primary` `border-primary-hover` `ring-primary-200` ...

### Layer 2：Neutral Scale

```css
@theme {
  --color-neutral-50:  <幾乎白>;
  --color-neutral-100: <...>;
  --color-neutral-200: <...>;
  --color-neutral-300: <...>;
  --color-neutral-400: <...>;
  --color-neutral-500: <中灰>;
  --color-neutral-600: <...>;
  --color-neutral-700: <...>;
  --color-neutral-800: <...>;
  --color-neutral-900: <...>;
  --color-neutral-950: <幾乎黑>;
}
```

> Neutral Scale 在 Dark Mode 下通常整體反轉（50 ↔ 950），只需在 `.dark` 覆寫即可。

### Layer 3：Accent Scale

```css
@theme {
  /* 完整色階（選用，可只定義用到的色號） */
  --color-accent-300: <...>;
  --color-accent-500: <主點綴色>;
  --color-accent-700: <...>;

  /* 語意別名（推薦直接用這些） */
  --color-accent-warm:    <暖色調點綴，例：珊瑚 / 桃粉>;
  --color-accent-cool:    <冷色調點綴，例：薄荷 / 薰衣草>;
  --color-accent-neutral: <中性點綴，例：奶油黃>;
}
```

### Layer 4：Brand Aliases

```css
@theme {
  --color-brand:        <品牌代表深色，用於 Logo / 標題>;
  --color-brand-light:  <品牌淺色，用於次要裝飾>;
  --color-brand-dark:   <品牌最深，高對比場景>;
  --color-brand-accent: <品牌點綴色>;
}
```

### Layer 5：Core UI Tokens（元件優先使用此層）

```css
@theme {
  /* 背景層次（由外到內，由深到淺 / 由淺到深） */
  --color-page-bg:          <最底層頁面背景>;
  --color-surface:          <卡片 / 面板背景>;
  --color-surface-elevated: <懸浮層：Modal / Dropdown / Tooltip>;

  /* 邊框 */
  --color-border-subtle: <細線 / 分隔線（低對比）>;

  /* 文字三級 */
  --color-text-main:  <主要文字（高對比）>;
  --color-text-soft:  <中間層文字>;
  --color-text-muted: <輔助文字（低對比，說明用）>;

  /* 狀態色 */
  --color-status-success: <成功 / 完成>;   /* 偏綠 */
  --color-status-warning: <警告 / 注意>;   /* 偏黃橙 */
  --color-status-danger:  <錯誤 / 危險>;   /* 偏紅 */
  --color-status-info:    <資訊 / 提示>;   /* 偏藍 */

  /* 專案專用（依需求新增，例：繪圖工具色） */
  /* --color-status-<name>: <描述>; */
}
```

---

## 3. Dark Mode 覆寫機制

```css
/* index.css @layer theme 區塊 */
@layer theme {
  .dark {
    /* Primary（dark 下通常略微調亮） */
    --color-primary:       var(--color-primary-400);
    --color-primary-hover: var(--color-primary-500);

    /* Neutral（對稱反轉） */
    --color-neutral-50:  <原 950 的值>;
    --color-neutral-100: <原 900 的值>;
    /* ... */
    --color-neutral-950: <原 50 的值>;

    /* Core UI Tokens（依暗色視覺標準重新定義） */
    --color-page-bg:          <深色背景>;
    --color-surface:          <深色卡片>;
    --color-surface-elevated: <深色懸浮層>;
    --color-border-subtle:    <深色分隔線>;
    --color-text-main:        <淺色主要文字>;
    --color-text-muted:       <低亮度輔助文字>;

    /* 陰影：dark 下需更高 alpha */
    --shadow-sm: 0 1px 3px 0 rgba(0,0,0,0.3), 0 1px 2px 0 rgba(0,0,0,0.2);
    /* ... */
  }
}
```

**切換（JavaScript）：**

```typescript
// 開啟 Dark Mode
document.documentElement.classList.add('dark');

// 關閉
document.documentElement.classList.remove('dark');

// 讀取系統偏好並初始化
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) document.documentElement.classList.add('dark');
```

**元件使用（Token 會自動切換，通常不需手動加 dark: 前綴）：**

```tsx
// Token 在 .dark 下自動切換，無需 dark: prefix
<div className="bg-surface text-text-main border border-border-subtle">

// 需額外調整才使用 dark: variant
<div className="bg-surface dark:ring-1 dark:ring-border-subtle">
```

---

## 4. 陰影與字型 Token

```css
@theme {
  /* 陰影（建議使用品牌色調而非純黑） */
  --shadow-xs: <極細，靜止態元素>;
  --shadow-sm: <小陰影，卡片靜止態>;
  --shadow-md: <中陰影，懸浮 / 焦點>;
  --shadow-lg: <大陰影，Dropdown / Modal>;
  --shadow-xl: <超大陰影，Toast / 最高層>;

  /* 字型 */
  --font-sans:    '<Body 字型>', system-ui, -apple-system, sans-serif;
  --font-display: '<標題字型>', '<Body 字型>', system-ui, sans-serif;
  --font-mono:    '<等寬字型>', 'Courier New', monospace;
}
```

Light mode 陰影：使用品牌色色調（`rgba(brand-deep / 0.05 ~ 0.10)`），比純黑更精緻。  
Dark mode 陰影：改用高 alpha 純黑（`rgba(0,0,0 / 0.25 ~ 0.40)`），深色背景需更強對比。

---

## 5. 特殊場景顏色處理

### Canvas 2D API

Canvas `ctx.fillStyle` 無法接受 CSS Token，需在元件上層解析後以 props 傳入：

```typescript
// 正確：父元件一次性解析 Token 為實際色碼
const resolveToken = (token: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim();

// 傳入 Canvas 元件
<DrawCanvas activeColor={resolveToken('--color-primary')} />

// Canvas 元件內部只接受 prop，不自行查找色碼
interface DrawCanvasProps {
  activeColor: string; // hex / rgb 字串，由外部負責解析
}
```

### SVG Icon

```tsx
// currentColor：由父層 text-* class 控制
<svg className="text-primary" viewBox="...">
  <path fill="currentColor" d="..." />
</svg>

// 或直接套 Tailwind utility
<path className="fill-primary stroke-border-subtle" />
```

---

## 6. Tailwind Utility 速查

| Class | 對應 Token |
|---|---|
| `bg-page-bg` | `--color-page-bg` |
| `bg-surface` | `--color-surface` |
| `bg-surface-elevated` | `--color-surface-elevated` |
| `bg-primary` | `--color-primary` |
| `bg-primary/20` | `--color-primary` 20% 透明度 |
| `text-text-main` | `--color-text-main` |
| `text-text-muted` | `--color-text-muted` |
| `text-primary` | `--color-primary` |
| `border-border-subtle` | `--color-border-subtle` |
| `ring-primary` | `--color-primary`（focus ring） |
| `shadow-sm` | `--shadow-sm` |
| `shadow-md` | `--shadow-md` |
| `font-sans` | `--font-sans` |
| `font-display` | `--font-display` |
| `bg-status-success` | `--color-status-success` |
| `text-status-danger` | `--color-status-danger` |

---

## 7. v3 → v4 重新命名（視覺 Bug 陷阱）

這些名稱在 v4 仍能編譯，但**效果比 v3 小一級**，極易造成不明顯的視覺差異：

| v3 Class | v4 實際效果 | 正確 v4 寫法 |
|---|---|---|
| `shadow-sm` | 比 v3 `shadow-sm` 更小 | `shadow-xs` |
| `shadow` | 比 v3 `shadow` 更小 | `shadow-sm` |
| `rounded-sm` | 比 v3 `rounded-sm` 更小 | `rounded-xs` |
| `rounded` | 比 v3 `rounded` 更小 | `rounded-sm` |
| `blur-sm` | 比 v3 `blur-sm` 更小 | `blur-xs` |
| `blur` | 比 v3 `blur` 更小 | `blur-sm` |
| `drop-shadow-sm` | 同 shadow 系列，下移一級 | `drop-shadow-xs` |

---

## 8. Token 命名規範

**命名結構：** `--color-{layer}-{variant?}-{scale?}`

| 層次 | 範例 | 說明 |
|------|------|------|
| Layer 1 | `--color-primary-500` | 品牌主色第 5 級 |
| Layer 2 | `--color-neutral-300` | 中性灰第 3 級 |
| Layer 3 | `--color-accent-warm` | 暖色點綴語意別名 |
| Layer 4 | `--color-brand` | 品牌代表色 |
| Layer 5 | `--color-surface` | 卡片背景語意 |
| Layer 5 | `--color-text-muted` | 輔助文字語意 |
| Layer 5 | `--color-status-success` | 成功狀態語意 |

**禁止命名方式：**

| 禁止 | 原因 |
|------|------|
| `--color-blue` | 無語意，難維護 |
| `--color-button-background` | 元件級命名，耦合太高 |
| `--primary-color` | 缺少 `color-` 前綴，Tailwind 無法生成 utilities |
| `--color-#6366F1` | 以色碼命名，語意為零 |

**元件選用 Token 優先順序：**

```
1. Core UI Token    → bg-surface, text-text-main, border-border-subtle
2. Status Token     → text-status-success, bg-status-danger/10
3. Brand Alias      → text-brand, bg-brand-accent
4. Primary Scale    → bg-primary-100（需精確色階時）
5. Neutral Scale    → text-neutral-600（表格、程式碼塊）

禁止直接使用色碼 / Tailwind 內建色（blue-500, gray-300 等）
```
