export type WidgetKind = 'todo' | 'countdown';
export type WidgetItem = {
  id: string; kind: WidgetKind; text: string; target_date: string | null;
  completed_at: number | null; created_at: number; updated_at: number; row_version: number;
};
export type WidgetPreferences = { todos_visible: boolean; countdowns_visible: boolean; row_version: number };
export type WidgetData = { items: WidgetItem[]; preferences: WidgetPreferences };
export type ItemPatch = Partial<Pick<WidgetItem, 'text' | 'target_date' | 'completed_at'>>;
export const defaultWidgetPreferences: WidgetPreferences = { todos_visible: true, countdowns_visible: true, row_version: 0 };
export const DAY_MS = 86400000;
export const taipeiDay = (time = Date.now()) => Math.floor((time + 8 * 3600000) / DAY_MS);
export const completionCutoff = (time = Date.now()) => (taipeiDay(time) - 6) * DAY_MS - 8 * 3600000;
export function validTargetDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2199-12-31') return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function countdownDays(date: string, time = Date.now()) {
  return Math.floor(Date.parse(date + 'T00:00:00Z') / DAY_MS) - taipeiDay(time);
}
export const GSAT_PRESET = { text: '116 學測', target_date: '2027-01-22' };
