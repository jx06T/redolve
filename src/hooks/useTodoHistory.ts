import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const WHEEL_THRESHOLD = 250, TOUCH_THRESHOLD = 120;
type TouchDrag = { id: number; x: number; y: number; lastY: number; axis: '' | 'x' | 'y'; eligible: boolean; claimed: boolean };
type Transition = { open: boolean; offset: number; peek: number; smooth: boolean };

// Only the closed list's upper boundary uses a custom gesture. Once opened,
// scrolling stays native except for the remainder of an already-claimed pull.
export function useTodoHistory(account: string, historyVersion: string, hasHistory: boolean, editingHistory: boolean) {
  const viewport = useRef<HTMLDivElement>(null), history = useRef<HTMLDivElement>(null), current = useRef<HTMLDivElement>(null), tail = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null), [expanded, setExpanded] = useState(false);
  const opened = useRef(false), height = useRef(0), transition = useRef<Transition | null>(null);
  const live = useRef({ hasHistory, editingHistory }); live.current = { hasHistory, editingHistory };
  const drag = useRef<TouchDrag | null>(null), wheel = useRef(0), resetTimer = useRef(0), foldTimer = useRef(0);
  const showPull = (distance: number, mode: 'wheel' | 'touch') => {
    const el = hint.current; if (!el) return;
    el.style.opacity = distance ? '1' : '0';
    el.setAttribute('aria-hidden', distance ? 'false' : 'true');
    el.style.setProperty('--todo-pull', String(Math.min(1, distance / (mode === 'wheel' ? WHEEL_THRESHOLD : TOUCH_THRESHOLD))));
    const label = el.querySelector('span');
    if (label) label.textContent = mode === 'wheel' ? '繼續向上滾動以查看過去事項' : '繼續向下拉以查看過去事項';
  };
  const resetPull = () => { clearTimeout(resetTimer.current); wheel.current = 0; showPull(0, 'wheel'); };
  const open = (peek = 72, smooth = true) => {
    const el = viewport.current;
    if (!el || opened.current || !live.current.hasHistory) return;
    resetPull(); clearTimeout(foldTimer.current);
    transition.current = { open: true, offset: Math.max(0, el.scrollTop), peek, smooth };
    opened.current = true; setExpanded(true);
  };
  const close = () => {
    if (!opened.current || !viewport.current) return;
    resetPull(); clearTimeout(foldTimer.current);
    transition.current = { open: false, offset: Math.max(0, viewport.current.scrollTop - height.current), peek: 0, smooth: false };
    opened.current = false; setExpanded(false);
  };
  const scheduleFold = () => {
    clearTimeout(foldTimer.current);
    if (!opened.current || transition.current || !viewport.current || viewport.current.scrollTop < height.current - 1) return;
    foldTimer.current = window.setTimeout(() => {
      if (!drag.current && !live.current.editingHistory && !document.querySelector('[role="dialog"]') &&
          !history.current?.contains(document.activeElement) && (viewport.current?.scrollTop ?? -1) >= height.current - 1) close();
    }, 240);
  };
  const measure = () => {
    const el = viewport.current, start = current.current, end = tail.current, past = history.current;
    if (!el || !start || !end || !past || past.hidden === opened.current) return;
    const nextHeight = opened.current ? start.offsetTop : 0;
    const before = el.scrollTop, pending = transition.current;
    end.style.height = opened.current ? Math.max(0, el.clientHeight - start.getBoundingClientRect().height) + 'px' : '0px';
    if (pending?.open) {
      el.scrollTop = nextHeight + pending.offset;
      el.scrollTo({ top: Math.max(0, nextHeight - pending.peek), behavior: pending.smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    } else if (pending) el.scrollTop = pending.offset;
    else if (opened.current && height.current !== nextHeight) el.scrollTop = Math.max(0, before + nextHeight - height.current);
    height.current = nextHeight; transition.current = null;
    scheduleFold();
  };
  useLayoutEffect(() => { measure(); if (!hasHistory) { resetPull(); close(); } }, [expanded, historyVersion, editingHistory, hasHistory]);
  useLayoutEffect(() => {
    opened.current = false; transition.current = null; height.current = 0; setExpanded(false);
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [account]);
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const observer = new ResizeObserver(measure);
    [el, history.current, current.current].forEach(node => { if (node) observer.observe(node); });
    const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,[contenteditable="true"]');
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || editing(event.target)) return;
      clearTimeout(foldTimer.current);
      if (opened.current) { resetPull(); scheduleFold(); return; }
      if (!live.current.hasHistory || el.scrollTop > 1 || event.deltaY >= 0) { resetPull(); return; }
      if (!event.cancelable) return;
      event.preventDefault();
      const pixels = -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1);
      wheel.current += Math.min(100, pixels); showPull(wheel.current, 'wheel');
      clearTimeout(resetTimer.current);
      if (wheel.current >= WHEEL_THRESHOLD) open();
      else resetTimer.current = window.setTimeout(resetPull, 1100);
    };
    const start = (event: TouchEvent) => {
      resetPull(); clearTimeout(foldTimer.current);
      if (event.touches.length !== 1 || editing(event.target)) { drag.current = null; return; }
      const touch = event.touches[0];
      drag.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, lastY: touch.clientY, axis: '', eligible: !opened.current && el.scrollTop <= 1 && live.current.hasHistory, claimed: false };
    };
    const move = (event: TouchEvent) => {
      const active = drag.current;
      if (!active || event.touches.length !== 1) { resetPull(); drag.current = null; return; }
      const touch = Array.from(event.touches).find(t => t.identifier === active.id); if (!touch) return;
      const dx = touch.clientX - active.x, dy = touch.clientY - active.y;
      if (!active.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) active.axis = 'x';
        else if (Math.abs(dy) > Math.abs(dx) * 1.2) active.axis = 'y';
      }
      if (active.axis === 'x') { active.eligible = false; resetPull(); return; }
      if (active.axis !== 'y' || !active.eligible || !event.cancelable) return;
      if (!active.claimed && dy <= 0) { active.eligible = false; return; }
      event.preventDefault(); active.claimed = true;
      if (opened.current) {
        if (transition.current?.open) transition.current.peek += touch.clientY - active.lastY;
        else el.scrollTop -= touch.clientY - active.lastY;
      } else {
        showPull(Math.max(0, dy), 'touch');
        if (dy >= TOUCH_THRESHOLD) open(48, false);
      }
      active.lastY = touch.clientY;
    };
    const end = () => {
      // Cancelling touchmove already suppresses the tap. Leave touchend native
      // so the browser can finish its gesture and release the scroll chain.
      drag.current = null; resetPull(); scheduleFold();
    };
    const cancel = () => { drag.current = null; resetPull(); scheduleFold(); };
    const key = (event: KeyboardEvent) => {
      if (event.target === el && event.key === 'PageUp' && !event.ctrlKey && !event.metaKey && !event.altKey && !opened.current && el.scrollTop <= 1 && live.current.hasHistory) {
        event.preventDefault(); open(Math.min(180, el.clientHeight * .6));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('scroll', scheduleFold, { passive: true });
    el.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect(); clearTimeout(resetTimer.current); clearTimeout(foldTimer.current);
      el.removeEventListener('wheel', onWheel); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', cancel); el.removeEventListener('scroll', scheduleFold); el.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
    };
  }, [account]);
  return { viewport, history, current, tail, hint, expanded, open, close };
}
