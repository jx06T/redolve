import { useSyncExternalStore } from 'react';
import type { TodoInsertDirection } from '../types/todoOrder';

type Channel = { direction: TodoInsertDirection; listeners: Set<() => void> };
const prefix = 'rdv:todo-insert:v1:', channels = new Map<string, Channel>();
const valid = (value: unknown): TodoInsertDirection => value === 'top' ? 'top' : 'bottom';

function channel(account: string): Channel {
  const key = prefix + encodeURIComponent(account);
  let current = channels.get(key);
  if (!current) {
    let direction: TodoInsertDirection = 'bottom';
    try { direction = valid(localStorage.getItem(key)); } catch { /* Device preference is optional. */ }
    current = { direction, listeners: new Set() }; channels.set(key, current);
  }
  return current;
}
export function useTodoInsertPreference(account: string) {
  const current = channel(account);
  const direction = useSyncExternalStore(listener => { current.listeners.add(listener); return () => { current.listeners.delete(listener); }; }, () => current.direction);
  const remember = (next: TodoInsertDirection) => {
    try { localStorage.setItem(prefix + encodeURIComponent(account), next); } catch { /* Keep this session's choice. */ }
    current.direction = next; current.listeners.forEach(listener => listener());
  };
  return { direction, remember };
}
// This is a per-account device preference; no API request or D1 field is needed.
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  for (const [key, current] of channels) if (event.key === key || event.key === null) {
    current.direction = valid(event.newValue); current.listeners.forEach(listener => listener());
  }
});
