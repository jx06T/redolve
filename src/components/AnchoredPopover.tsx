import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const popoverActionClass = 'block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary';

type Position = { left: number; top: number; width: number; maxHeight: number };
const controls = 'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]';

// Nonmodal local actions: portalled out of clipped cards, with native outside interaction.
export function AnchoredPopover({ anchor, title, variant = 'actions', children, onClose }: { anchor: HTMLElement; title: string; variant?: 'actions' | 'confirmation'; children: ReactNode; onClose: () => void }) {
  const id = useId(), root = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  const restore = useRef(true), [position, setPosition] = useState<Position | null>(null);
  const dismiss = (returnFocus: boolean) => { restore.current = returnFocus; close.current(); };
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const measure = () => {
      if (!anchor.isConnected) { dismiss(false); return; }
      const visual = window.visualViewport, margin = 12, gap = -4;
      const left = (visual?.offsetLeft || 0) + margin, right = (visual?.offsetLeft || 0) + (visual?.width || innerWidth) - margin;
      let top = (visual?.offsetTop || 0) + margin, bottom = (visual?.offsetTop || 0) + (visual?.height || innerHeight) - margin;
      for (const edge of document.querySelectorAll<HTMLElement>('[data-overlay-edge]')) {
        const rect = edge.getBoundingClientRect(); if (!rect.width || !rect.height || rect.bottom <= top || rect.top >= bottom) continue;
        if (edge.dataset.overlayEdge === 'top') top = Math.max(top, rect.bottom + margin);
        if (edge.dataset.overlayEdge === 'bottom') bottom = Math.min(bottom, rect.top - margin);
      }
      const box = anchor.getBoundingClientRect();
      if (box.bottom < top || box.top > bottom || box.right < left || box.left > right) { dismiss(false); return; }
      const width = Math.max(0, Math.min(variant === 'actions' ? 200 : 112, right - left));
      const below = Math.max(0, bottom - box.bottom - gap), above = Math.max(0, box.top - top - gap);
      const height = el.scrollHeight, down = below >= height || below >= above;
      const maxHeight = down ? below : above;
      const next = { width, maxHeight, left: Math.max(left, Math.min(box.left + width <= right ? box.left : box.right - width, right - width)), top: down ? box.bottom + gap : Math.max(top, box.top - gap - Math.min(height, maxHeight)) };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof Position] === next[key as keyof Position]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    for (let ancestor: HTMLElement | null = anchor; ancestor; ancestor = ancestor.parentElement) observer.observe(ancestor);
    const mutations = new MutationObserver(measure); mutations.observe(anchor.closest('section') || anchor.parentElement || anchor, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [anchor, variant]);
  useLayoutEffect(() => { if (position) root.current?.querySelector<HTMLElement>(controls)?.focus({ preventScroll: true }); }, [!!position]);
  useEffect(() => {
    const el = root.current, fallback = anchor.parentElement?.closest<HTMLElement>('[tabindex]:not([tabindex="-1"])');
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target) && !anchor.contains(event.target)) dismiss(false); };
    const focusOutside = (event: FocusEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target) && !anchor.contains(event.target)) dismiss(false); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) dismiss(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', focusOutside); document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focusOutside); document.removeEventListener('scroll', scroll, true);
      // Passive cleanup runs after a deleted row has left the DOM, before a new modal takes focus.
      const focused = document.activeElement;
      if (restore.current && (!focused || focused === document.body || el?.contains(focused))) (anchor.isConnected ? anchor : fallback?.isConnected ? fallback : null)?.focus({ preventScroll: true });
    };
  }, [anchor]);
  return createPortal(<div ref={root} id={id} role="dialog" aria-labelledby={id + '-title'} tabIndex={-1} data-anchored-popover={variant}
    style={position ? { ...position, visibility: 'visible' } : { left: 0, top: 0, width: variant === 'actions' ? 200 : 112, visibility: 'hidden' }}
    className={"fixed z-[10000] overflow-y-auto overscroll-contain rounded-lg bg-surface bg-linear-to-br from-transparent via-primary/4 to-primary/10 shadow-[0_4px_20px_rgba(0,0,0,0.03)]"}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>(controls)], index = buttons.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
      }
    }}>
    <h2 id={id + '-title'} className="sr-only">{title}</h2>{children}
  </div>, document.body);
}
