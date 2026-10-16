import type { WidgetItem } from './homeWidgets';
import { taipeiDay } from './homeWidgets';

export type TodoInsertDirection = 'top' | 'bottom';

// Missing IDs (new tasks) append in stable creation order. Historical tasks are
// displayed separately and never participate in today's organization. Completion
// itself never changes rank; only an explicit organization groups completed tasks.
export function orderedCurrentTodos(items: WidgetItem[], order: string[] = [], today = taipeiDay()): WidgetItem[] {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return items.filter(i => i.kind === 'todo' && (i.completed_at === null || taipeiDay(i.completed_at) >= today)).sort((a, b) =>
    (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)
    || a.created_at - b.created_at || a.id.localeCompare(b.id));
}
// Each remaining task is a unique "before" destination; null means the end.
// When everything is selected, there is only one meaningful destination.
export function todoInsertionTargets(items: WidgetItem[], selection: string[]): (string | null)[] {
  const selected = new Set(selection);
  if (!items.some(i => i.completed_at === null && selected.has(i.id))) return [];
  return [...items.filter(i => i.completed_at === null && !selected.has(i.id)).map(i => i.id), null];
}
export function organizeTodoOrder(items: WidgetItem[], selection: string[], beforeId: string | null): string[] | null {
  const unfinished = items.filter(i => i.completed_at === null).map(i => i.id), allowed = new Set(unfinished);
  const selected = [...new Set(selection)].filter(id => allowed.has(id)), chosen = new Set(selected);
  if (!selected.length) return null;
  const remaining = unfinished.filter(id => !chosen.has(id));
  const first = beforeId === null ? remaining.length : remaining.indexOf(beforeId);
  if (first < 0) return null; // A missing/selected destination must never silently become "top".
  remaining.splice(first, 0, ...selected);
  return [...items.filter(i => i.completed_at !== null).map(i => i.id), ...remaining];
}
