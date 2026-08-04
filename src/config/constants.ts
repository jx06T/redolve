import { LayoutDashboard, BookOpen, Settings } from 'lucide-react';

// Navigation Links Configuration
export const NAV_LINKS = [
  { path: '/', label: '總覽 Dashboard', icon: LayoutDashboard },
  { path: '/study/all', label: '刷題本 Study', icon: BookOpen },
  { path: '/settings', label: '設定 Settings', icon: Settings },
];

// Separated Exam Years & Exam Types (年分與卷別獨立分離)
export const EXAM_YEARS = [
  '113年',
  '112年',
  '111年',
  '110年',
  '109年',
  '108年',
  '107年',
  '106年',
];

export const EXAM_TYPES = [
  '學測',
  '分科/指考',
  '全模',
  '北模',
  '中模',
  '南模',
  '建中段考',
  '中一中段考',
  '雄中段考',
  '課本例題',
];

// Drawing Tool Color Palettes (Soft Pastel Morandi Palette)
export const COLOR_PALETTE = [
  { name: 'Indigo (鋼筆經典)', hex: '#6366F1' },
  { name: 'Rose (重點批註)', hex: '#E11D48' },
  { name: 'Blue (觀念補強)', hex: '#3B82F6' },
  { name: 'Dark Grey (深灰石墨)', hex: '#374151' },
];

export const PEN_COLORS = ['#374151', '#6366F1', '#E11D48', '#3B82F6'];

// Stroke Width Options (pt)
export const STROKE_WIDTHS = [1, 2, 4];
export const PEN_WIDTHS = [1, 2, 4];

// Problem Status Filter Options
export const STATUS_FILTER_ITEMS = [
  { key: 'all', label: '全部' },
  { key: 'unsolved', label: '未訂正' },
  { key: 'resolved', label: '已完成' },
] as const;

