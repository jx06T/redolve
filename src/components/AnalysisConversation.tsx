import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, Send } from 'lucide-react';
import { RichText } from './RichText';
import { analysisService } from '../services/analysisService';
import type { AnalysisFollowup, AnalysisReport } from '../types/analysis';
import { AnalysisCitations } from './AnalysisCitations';

export function AnalysisConversation({ report }: { report: AnalysisReport }) {
  const [turns, setTurns] = useState<AnalysisFollowup[]>([]), [question, setQuestion] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [showLatest, setShowLatest] = useState(false), inputId = useId();
  const controller = useRef(new AbortController()), running = useRef(false), stickToBottom = useRef(true);
  const viewport = useRef<HTMLDivElement>(null), messages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = new AbortController(); controller.current = next; running.current = false; stickToBottom.current = true;
    setTurns([]); setQuestion(''); setError(''); setBusy(false); setLoading(true); setShowLatest(false);
    void analysisService.followups(report.id, next.signal).then(rows => { if (!next.signal.aborted) setTurns(rows); })
      .catch(e => { if (!next.signal.aborted) setError(e.message); })
      .finally(() => { if (!next.signal.aborted) setLoading(false); });
    return () => next.abort();
  }, [report.id]);

  useLayoutEffect(() => {
    const element = viewport.current, content = messages.current;
    if (!element || !content) return;
    const follow = () => { if (stickToBottom.current) element.scrollTop = element.scrollHeight; };
    follow();
    // RichText and math fonts can finish rendering after the response arrives.
    const observer = new ResizeObserver(follow); observer.observe(content); observer.observe(element);
    return () => observer.disconnect();
  }, [report.id]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [turns, loading, error]);

  const scrollToLatest = () => {
    stickToBottom.current = true; setShowLatest(false);
    const element = viewport.current; if (element) element.scrollTop = element.scrollHeight;
  };
  const refresh = async () => {
    const signal = controller.current.signal; setLoading(true); setError('');
    try { const rows = await analysisService.followups(report.id, signal); if (!signal.aborted) setTurns(rows); }
    catch (e) { if (!signal.aborted) setError((e as Error).message); }
    finally { if (!signal.aborted) setLoading(false); }
  };
  const pending = turns.some(turn => turn.status === 'pending');
  const send = async (text: string, id: string = crypto.randomUUID()) => {
    if (running.current || loading || pending || !text.trim()) return;
    const signal = controller.current.signal;
    running.current = true; stickToBottom.current = true; setShowLatest(false); setBusy(true);
    const retry = turns.some(turn => turn.id === id);
    if (!retry) setQuestion('');
    setTurns(previous => retry ? previous.map(turn => turn.id === id ? { ...turn, status: 'pending', error: null } : turn)
      : [...previous, { id, question: text.trim(), status: 'pending', answer: null, evidence: [], createdAt: new Date().toISOString(), error: null }]);
    try {
      const turn = await analysisService.ask(report.id, text.trim(), id, signal);
      if (!signal.aborted) setTurns(previous => previous.map(t => t.id === id ? turn : t));
    } catch (e) {
      if (!signal.aborted) setTurns(previous => previous.map(t => t.id === id ? { ...t, status: 'failed', error: (e as Error).message || '連線未完成，可使用相同問題重試' } : t));
    } finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const citations = [...new Map([...report.evidence, ...turns.flatMap(turn => turn.evidence)].map(item => [item.id, item])).values()];
  const disabled = busy || loading || pending || !question.trim();

  return <section aria-label="報告追問" className="flex h-[min(85dvh,56rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface">
    <header className="shrink-0 border-b border-border-subtle px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">報告追問</h2><span className="text-xs text-text-muted">{turns.length} 則追問</span></div>
      <p className="mt-1 text-xs leading-6 text-text-muted">依據這份報告當時的資料回答，記錄保留至 {new Date(report.detailExpiresAt).toLocaleDateString()}。</p>
    </header>
    <div className="relative min-h-0 flex-1">
      <div ref={viewport} role="log" aria-label="追問對話" aria-live="polite" aria-relevant="additions text" tabIndex={0}
        onScroll={() => {
          const element = viewport.current; if (!element) return;
          const nearBottom = element.scrollHeight - element.clientHeight - element.scrollTop < 64;
          stickToBottom.current = nearBottom; setShowLatest(!nearBottom);
        }} className="h-full overflow-y-auto overscroll-contain touch-pan-y select-text px-4 py-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6">
        <div ref={messages} className="space-y-6">
          {loading && !turns.length && <p role="status" className="py-12 text-center text-sm text-text-muted">正在讀取追問…</p>}
          {!loading && !error && !turns.length && <p className="py-12 text-center text-sm leading-7 text-text-muted">可以追問這份報告中的考點、錯因或下一步練習安排。</p>}
          {error && <div role="alert" className="rounded-2xl bg-page-bg p-4 text-sm"><p>{error}</p><button type="button" disabled={loading} onClick={() => void refresh()} className="mt-2 min-h-11 underline underline-offset-4 disabled:opacity-40">重新載入對話</button></div>}
          {turns.map(turn => <article key={turn.id} className="space-y-4">
            <div className="ml-auto w-fit max-w-[90%] space-y-1 sm:max-w-[80%]"><p className="text-right text-xs text-text-muted">你</p><RichText text={turn.question} className="rounded-2xl bg-primary/8 px-4 py-3 text-sm leading-7" /></div>
            <div className="min-w-0 space-y-2"><p className="text-xs text-text-muted">AI</p>
              {turn.answer && <><RichText text={turn.answer.text} className="text-sm leading-7" /><AnalysisCitations ids={turn.answer.evidenceIds} evidence={citations} /></>}
              {turn.status === 'pending' && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-text-muted"><Loader2 size={15} className="animate-spin" aria-hidden="true" />正在整理回答…{!busy && <button type="button" disabled={loading} className="min-h-11 underline disabled:opacity-40" onClick={() => void refresh()}>重新載入回答</button>}</div>}
              {turn.status === 'failed' && <div className="rounded-2xl bg-page-bg px-4 py-3 text-sm text-text-muted"><p role="alert">{turn.error || '回答未完成，可重試'}</p><button type="button" className="mt-1 min-h-11 underline underline-offset-4 disabled:opacity-40" disabled={busy || loading || pending} onClick={() => void send(turn.question, turn.id)}>重試這則追問</button></div>}
            </div>
          </article>)}
        </div>
      </div>
      {showLatest && <button type="button" onClick={scrollToLatest} className="absolute bottom-3 right-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-3 text-xs shadow-[0_4px_20px_rgba(0,0,0,0.03)]"><ArrowDown size={15} aria-hidden="true" />回到最新訊息</button>}
    </div>
    <form className="shrink-0 space-y-2 border-t border-border-subtle bg-surface p-3 sm:px-5 sm:py-4" onSubmit={e => { e.preventDefault(); void send(question); }}>
      <label className="sr-only" htmlFor={inputId}>想進一步了解什麼？</label>
      <textarea id={inputId} rows={2} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); if (!disabled) void send(question); } }}
        placeholder="例如：這些錯因應該怎麼練習？" className="min-h-20 w-full resize-none rounded-2xl border border-border-subtle bg-page-bg px-4 py-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-primary" />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-text-muted">{question.length}／2,000<span className="ml-3 hidden sm:inline">Enter 送出，Shift＋Enter 換行</span></span>
        <button type="submit" disabled={disabled} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm text-primary-600 disabled:opacity-40 dark:text-primary-300"><Send size={15} aria-hidden="true" />{busy ? '回答中…' : '送出追問'}</button>
      </div>
    </form>
  </section>;
}
