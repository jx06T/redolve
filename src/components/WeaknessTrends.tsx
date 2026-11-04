import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analysisService } from '../services/analysisService';
import type { WeaknessTrend } from '../types/weakness';

export function WeaknessTrends({ subjectId, days }: { subjectId: string; days: number }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<WeaknessTrend[]>(), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRows(undefined); setError('');
    void analysisService.weaknesses(subjectId, days, controller.signal).then(value => { if (!controller.signal.aborted) setRows(value.trends); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [subjectId, days, open]);
  return <details className="space-y-3 border-t border-border-subtle pt-5" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">弱點追蹤</summary>
    {open && <>
      <p className="text-sm text-text-muted">關聯題數來自目前有效的訂正與作答標記。重作表現依所選 {days} 天計算。</p>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {!rows && !error && <p role="status" className="text-sm text-text-muted">載入弱點追蹤…</p>}
      {rows?.length === 0 && <p className="text-sm text-text-muted">在訂正或練習結算確認弱點後，這裡會顯示進度。</p>}
      {rows?.map(row => <article key={row.id} className="space-y-2 rounded-xl border border-border-subtle p-3 text-sm">
        <h3 className="font-medium">{row.title}</h3>
        <p className="text-text-muted">關聯 {row.questions} 題 · 本期確認 {row.confirmedAttempts} 次（其中再出現 {row.recurringAttempts} 次）· 同題重作答對 {row.sameQuestionCorrect} 題</p>
        {row.delayedCorrect > 0 && <p className="text-text-muted">隔至少一週、未看原圖重作答對 {row.delayedCorrect} 題</p>}
        <p>驗證目標　{row.target}</p>
        <Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" to={`/practice?${new URLSearchParams({ subject: subjectId, questions: row.evidenceQuestionIds.join(',') })}`}>重作相關原題</Link>
      </article>)}
    </>}
  </details>;
}
