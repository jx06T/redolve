import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { analysisService } from '../services/analysisService';
import type { AnalysisFollowup, AnalysisReport } from '../types/analysis';
import { AnalysisCitations } from './AnalysisCitations';

export function AnalysisConversation({ report }: { report: AnalysisReport }) {
  const [turns, setTurns] = useState<AnalysisFollowup[]>([]), [question, setQuestion] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const controller = useRef(new AbortController()), running = useRef(false);
  useEffect(() => {
    const next = new AbortController(); controller.current = next;
    void analysisService.followups(report.id, next.signal).then(rows => { if (!next.signal.aborted) setTurns(previous => [...new Map([...rows, ...previous].map(turn => [turn.id, turn])).values()]); }).catch(e => { if (!next.signal.aborted) setError(e.message); });
    return () => next.abort();
  }, [report.id]);
  const send = async (text: string, id: string = crypto.randomUUID()) => {
    if (running.current || !text.trim()) return;
    running.current = true; setBusy(true); setError(''); setHistoryOpen(true); const signal = controller.current.signal;
    setTurns(previous => [...previous.filter(t => t.id !== id), { id, question: text.trim(), status: 'pending', answer: null, evidence: [], createdAt: new Date().toISOString(), error: null }]);
    try {
      const turn = await analysisService.ask(report.id, text.trim(), id, signal);
      if (!signal.aborted) { setTurns(previous => previous.map(t => t.id === id ? turn : t)); setQuestion(previous => previous.trim() === text.trim() ? '' : previous); }
    } catch (e) { if (!signal.aborted) { setError((e as Error).message); setTurns(previous => previous.map(t => t.id === id ? { ...t, status: 'failed', error: '連線未完成，可使用相同問題重試' } : t)); } }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const citations = [...new Map([...report.evidence, ...turns.flatMap(turn => turn.evidence)].map(item => [item.id, item])).values()];
  return <section aria-label="報告追問" className="space-y-5 rounded-3xl border border-border-subtle bg-surface p-5 md:p-6">
    <div><h2 className="text-lg font-semibold">報告追問</h2><p className="mt-2 text-xs leading-6 text-text-muted">依據這份報告當時的資料回答，追問記錄保留至 {new Date(report.detailExpiresAt).toLocaleDateString()}。</p></div>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send(question); }}><label className="block text-sm" htmlFor="analysis-followup">想進一步了解什麼？</label><textarea id="analysis-followup" rows={3} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：這些題目共同混淆了什麼？下一週可以怎麼複習？" className="w-full resize-y rounded-2xl border border-border-subtle bg-page-bg p-4 text-sm" />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-text-muted">{question.length}／2,000</span><button type="submit" disabled={busy || !question.trim() || turns.some(t => t.status === 'pending')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm text-primary-600 disabled:opacity-40 dark:text-primary-300"><Send size={15} />{busy ? '回答中…' : '送出追問'}</button></div>
    </form>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {!!turns.length && <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)} className="border-t border-border-subtle pt-3">
      <summary className="min-h-11 cursor-pointer rounded-xl py-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">歷次追問 · {turns.length} 則{turns.some(turn => turn.status === 'pending') ? ' · 有回答處理中' : ''}</summary>
      <div className="space-y-5 pt-3">{turns.map(turn => <article key={turn.id} className="space-y-3 border-t border-border-subtle pt-5"><p className="ml-auto max-w-xl whitespace-pre-wrap break-words rounded-2xl bg-primary/5 px-4 py-3 text-sm">{turn.question}</p>
      {turn.answer && <><p className="whitespace-pre-wrap text-sm leading-7">{turn.answer.text}</p><AnalysisCitations ids={turn.answer.evidenceIds} evidence={citations} /></>}
      {turn.status === 'pending' && <p role="status" className="text-sm text-text-muted">正在整理回答…{!busy && <button className="ml-2 min-h-11 underline" onClick={() => { void analysisService.followups(report.id, controller.current.signal).then(setTurns).catch(e => setError(e.message)); }}>重新載入回答</button>}</p>}
      {turn.status === 'failed' && <div className="text-sm text-text-muted">{turn.error}<button className="ml-2 min-h-11 underline" disabled={busy} onClick={() => void send(turn.question, turn.id)}>重試這則追問</button></div>}
    </article>)}</div>
    </details>}
  </section>;
}
