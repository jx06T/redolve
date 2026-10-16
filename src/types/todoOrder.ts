import type { WidgetItem } from './homeWidgets';
import { taipeiDay } from './homeWidgets';

// Missing IDs (new tasks) append in stable creation order. Historical tasks are
// displayed separately and never participate in today's organization.
export function orderedCurrentTodos(items: WidgetItem[], order: string[] = [], today = taipeiDay()): WidgetItem[] {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return items.filter(i => i.kind === 'todo' && (i.completed_at === null || taipeiDay(i.completed_at) >= today)).sort((a, b) =>
    (order.length ? Number(b.completed_at !== null) - Number(a.completed_at !== null) : 0)
    || (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)
    || a.created_at - b.created_at || a.id.localeCompare(b.id));
}
export function organizeTodoOrder(items: WidgetItem[], selection: string[], mode: 'top' | 'sort'): string[] {
  const unfinished = items.filter(i => i.completed_at === null).map(i => i.id), allowed = new Set(unfinished);
  const selected = [...new Set(selection)].filter(id => allowed.has(id)), chosen = new Set(selected);
  if (!selected.length) return items.map(i => i.id);
  const first = mode === 'top' ? 0 : unfinished.findIndex(id => chosen.has(id));
  const remaining = unfinished.filter(id => !chosen.has(id));
  remaining.splice(first, 0, ...selected);
  return [...items.filter(i => i.completed_at !== null).map(i => i.id), ...remaining];
}
