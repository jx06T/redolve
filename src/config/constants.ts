import { LayoutDashboard, BookOpen, Settings, Search, Rss, Compass } from 'lucide-react';

export const SHOW_SHORTCUTS_EVENT = 'redolve:show-shortcuts';

// Navigation Links Configuration
export const NAV_LINKS = [
  { path: '/', label: '總覽', icon: LayoutDashboard },
  { path: '/study', label: '刷題', icon: BookOpen },
  { path: '/search', label: '搜尋', icon: Search },
  { path: '/settings', label: '設定', icon: Settings },
  { path: '/extended', label: '延伸題目', icon: Rss },
];

export const HEADER_NAV_LINKS = [
  ...NAV_LINKS,
  { path: '/explore', label: '探索', icon: Compass },
];

// Separated Exam Years & Exam Types (年分與卷別獨立分離)
export const EXAM_YEARS = [
  '114',
  '113',
  '112',
  '111',
  '110',
  '109',
  '108',
  '107',
  '106',
];

export const EXAM_TYPES = [
  '學測',
  '分科/指考',
  '全模',
  '北模',
  '段考',
  '講義',
  '練習卷',
];

export interface PaletteColorItem {
  name?: string;
  hex: string;
}

// Default Drawing Tool Color Palettes (Soft Pastel Morandi Palette)
export const DEFAULT_PALETTE_COLORS: PaletteColorItem[] = [
  { name: 'Dark Grey', hex: '#374151' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Blue', hex: '#3B82F6' },
];

export const COLOR_PALETTE = DEFAULT_PALETTE_COLORS;
export const PEN_COLORS = DEFAULT_PALETTE_COLORS.map((c) => c.hex);

// Stroke Width Options (pt)
export const STROKE_WIDTHS = [1, 2, 4];
export const PEN_WIDTHS = [1, 2, 4];

// Problem Canvas & Scratchpad Configuration
export const DEFAULT_CALC_SPACE_HEIGHT = 100;
export const DEFAULT_BASE_WIDTH = 800;
export const CALC_SPACE_STEP = 40;

// Problem Status Filter Options
export const STATUS_FILTER_ITEMS = [
  { key: 'all', label: '全部' },
  { key: 'unsolved', label: '未訂正' },
  { key: 'resolved', label: '已完成' },
  { key: 'archived', label: '已封存' },
] as const;

