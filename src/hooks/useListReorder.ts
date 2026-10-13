import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';

// Pointer capture works for mouse, touch and pen. Only handles suppress native
// scrolling; the rest of the list keeps its normal editing and swipe behavior.
export function useListReorder(ids: string[], list: RefObject<HTMLDivElement>, viewport: RefObject<HTMLDivElement>, onBegin: () => void, onCommit: (ids: string[]) => void) {
  const [preview, setPreview] = useState<string[] | null>(null), [active, setActive] = useState<string | null>(null);
  const live = useRef({ ids, onBegin, onCommit }); live.current = { ids, onBegin, onCommit };
  const drag = useRef<{ id: string; pointer: number; y: number; startY: number; moved: boolean; order: string[]; capture: HTMLDivElement; scroller: HTMLElement } | null>(null);
  const frame = useRef(0);
  const cancel = () => {
    const current = drag.current; drag.current = null; cancelAnimationFrame(frame.current);
    if (current?.capture.hasPointerCapture(current.pointer)) current.capture.releasePointerCapture(current.pointer);
    setActive(null); setPreview(null);
  };
  const sample = () => {
    const current = drag.current, root = list.current, scroller = current?.scroller;
    if (!current || !root || !scroller) return;
    if (Math.abs(current.y - current.startY) > 4) current.moved = true;
    if (current.moved) {
      const bounds = scroller.getBoundingClientRect(), style = getComputedStyle(scroller);
      const top = bounds.top + parseFloat(style.paddingTop || '0'), bottom = bounds.bottom - parseFloat(style.paddingBottom || '0');
      const first = root.getBoundingClientRect().top - top + scroller.scrollTop - 20;
      const last = root.getBoundingClientRect().bottom - bottom + scroller.scrollTop + 20;
      const speed = current.y < top + 28 ? -6 : current.y > bottom - 28 ? 6 : 0;
      if (speed < 0) scroller.scrollTop = Math.max(Math.max(0, Math.min(first, scroller.scrollTop)), scroller.scrollTop + speed);
      if (speed > 0) scroller.scrollTop = Math.min(Math.max(last, scroller.scrollTop), scroller.scrollTop + speed);
      const other = current.order.filter(id => id !== current.id);
      const rows = [...root.querySelectorAll<HTMLElement>('[data-reorder-id]')].filter(row => row.dataset.reorderId !== current.id);
      const index = rows.filter(row => { const box = row.getBoundingClientRect(); return current.y > box.top + box.height / 2; }).length;
      const next = [...other.slice(0, index), current.id, ...other.slice(index)];
      if (next.some((id, i) => id !== current.order[i])) { current.order = next; setPreview(next); }
    }
    frame.current = requestAnimationFrame(sample);
  };
  const down = (id: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    const capture = viewport.current; if (!capture) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    let scroller: HTMLElement = capture;
    while (scroller.parentElement && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    live.current.onBegin();
    drag.current = { id, pointer: event.pointerId, y: event.clientY, startY: event.clientY, moved: false, order: [...live.current.ids], capture, scroller };
    // The viewport stays mounted while keyed rows move. Capturing on a moving
    // row loses touch capture when React reorders its DOM node.
    capture.setPointerCapture(event.pointerId); setActive(id); setPreview(drag.current.order);
    frame.current = requestAnimationFrame(sample);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    event.stopPropagation(); current.y = event.clientY;
    cancelAnimationFrame(frame.current); sample(); cancelAnimationFrame(frame.current);
    if (current.moved && current.order.some((id, i) => id !== live.current.ids[i])) live.current.onCommit(current.order);
    cancel();
  };
  const keyboard = (id: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (drag.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const next = [...live.current.ids], index = next.indexOf(id);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? next.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
    if (index < 0 || target < 0 || target >= next.length || index === target) return;
    next.splice(index, 1); next.splice(target, 0, id); live.current.onBegin(); live.current.onCommit(next);
  };
  // Remote changes, completion rollover and deletion cancel the local gesture.
  // They must not cause a draft to revive an item that is no longer in this list.
  const signature = ids.join('|');
  useEffect(() => { if (drag.current) cancel(); }, [signature]);
  useEffect(() => {
    const abort = () => cancel();
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('blur', abort); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('blur', abort); window.removeEventListener('keydown', escape); cancelAnimationFrame(frame.current); drag.current = null; };
  }, []);
  return { order: preview || ids, active, surface: {
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) drag.current.y = event.clientY; },
    onPointerUp: up,
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) cancel(); },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && drag.current?.pointer === event.pointerId) cancel(); },
  }, handle: (id: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => down(id, event),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboard(id, event),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { event.preventDefault(); event.stopPropagation(); },
  }) };
}
