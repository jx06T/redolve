import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type Position = { top: number; bottom: number };
type Pending = { target: string; positions: Map<string, Position>; scrollTop: number; highlighted: Set<string> };

// Animate only explicitly prepared local reorders, not refreshes or completion.
// Read positions once on each side of React's keyed DOM reorder; no frame loop.
export function useTodoReorderAnimation(list: RefObject<HTMLDivElement>, viewport: RefObject<HTMLDivElement>, ids: string[]) {
  const signature = ids.join('|'), pending = useRef<Pending | null>(null);
  const active = useRef(new Map<HTMLElement, Animation>());
  const cancel = () => {
    pending.current = null;
    for (const animation of active.current.values()) animation.cancel();
    active.current.clear();
  };
  const prepare = (nextIds: string[], highlightedIds: string[] = []) => {
    const target = nextIds.join('|'), root = list.current, scroll = viewport.current;
    if (!root || !scroll || target === signature || matchMedia('(prefers-reduced-motion: reduce)').matches) { cancel(); return; }
    const positions = new Map<string, Position>();
    for (const row of root.querySelectorAll<HTMLElement>('[data-todo-row]')) {
      const rect = row.getBoundingClientRect(); positions.set(row.dataset.todoRow!, { top: rect.top, bottom: rect.bottom });
    }
    // Sample an interrupted animation before cancelling it to keep motion continuous.
    cancel(); pending.current = { target, positions, scrollTop: scroll.scrollTop, highlighted: new Set(highlightedIds) };
  };
  useLayoutEffect(() => {
    const before = pending.current, root = list.current, scroll = viewport.current;
    if (!before || !root || !scroll) return;
    pending.current = null;
    if (before.target !== signature || Math.abs(before.scrollTop - scroll.scrollTop) > 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = scroll.getBoundingClientRect();
    // Finish every geometry read before starting animations.
    const moves = [...root.querySelectorAll<HTMLElement>('[data-todo-row]')].map(row => ({ row, old: before.positions.get(row.dataset.todoRow!), next: row.getBoundingClientRect(), background: getComputedStyle(row).backgroundColor }));
    for (const { row, old, next, background } of moves) {
      if (!old || typeof row.animate !== 'function') continue;
      const delta = old.top - next.top;
      const nearby = old.bottom > bounds.top && old.top < bounds.bottom || next.bottom > bounds.top && next.top < bounds.bottom;
      if (!nearby || Math.abs(delta) < 1 || Math.abs(delta) > bounds.height) continue;
      const animation = row.animate(before.highlighted.has(row.dataset.todoRow!) ? [
        { transform: 'translateY(' + delta + 'px)', backgroundColor: 'rgba(168, 197, 189, 0.22)', offset: 0 },
        { backgroundColor: 'rgba(168, 197, 189, 0.22)', offset: 0.85 },
        { transform: 'translateY(0px)', backgroundColor: background, offset: 1 },
      ] : [
        { transform: 'translateY(' + delta + 'px)' },
        { transform: 'translateY(0px)' },
      ], { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      active.current.set(row, animation);
      animation.onfinish = () => { if (active.current.get(row) === animation) active.current.delete(row); };
    }
  }, [signature]);
  useEffect(() => {
    const scroll = viewport.current, pager = scroll?.closest('[data-dashboard-carousel]'), motion = matchMedia('(prefers-reduced-motion: reduce)');
    scroll?.addEventListener('scroll', cancel, { passive: true }); pager?.addEventListener('scroll', cancel, { passive: true });
    window.addEventListener('resize', cancel); motion.addEventListener('change', cancel);
    return () => { scroll?.removeEventListener('scroll', cancel); pager?.removeEventListener('scroll', cancel); window.removeEventListener('resize', cancel); motion.removeEventListener('change', cancel); cancel(); };
  }, [list, viewport]);
  return { prepare };
}
