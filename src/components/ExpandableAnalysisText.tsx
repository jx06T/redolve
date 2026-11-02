import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keep the original interpretation available without filling the page with long paragraphs. */
export function ExpandableAnalysisText({ text, lines = 3, footer }: { text: string; lines?: 2 | 3; footer?: ReactNode }) {
  const id = useId(), paragraph = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false), [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * lines + 1);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines]);
  return <div className="space-y-2">
    <p ref={paragraph} id={id} className={'whitespace-pre-wrap break-words text-sm leading-7 ' + (expanded ? '' : lines === 2 ? 'line-clamp-2' : 'line-clamp-3')}>{text}</p>
    {(overflows || footer) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {overflows && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} className="inline-flex min-h-11 items-center rounded-xl text-xs text-text-soft underline decoration-border-subtle underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">{expanded ? '收起分析' : '展開完整分析'}</button>}
      {footer}
    </div>}
  </div>;
}
