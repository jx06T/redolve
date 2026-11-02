import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisEvidence } from '../types/analysis';
import { practiceRefPath } from '../types/practice';
import { AppDialog } from './AppDialog';

const answerText = (answer: unknown, options: { id: string; label: string }[] = []) => {
  const value = answer as { kind?: string; text?: string; optionIds?: string[] } | null;
  return !value ? '尚無資料' : value.kind === 'text' ? value.text : value.optionIds?.map(id => options.find(o => o.id === id)?.label || id).join('、') || '尚無資料';
};
export function AnalysisCitations({ ids, evidence }: { ids: string[]; evidence: AnalysisEvidence[] }) {
  const [selected, setSelected] = useState<string | null>(null), item = evidence.find(e => e.id === selected && ids.includes(e.id));
  const references = [...new Set(ids)].flatMap(id => { const index = evidence.findIndex(e => e.id === id); return index < 0 ? [] : [{ id, index }]; });
  if (!references.length) return null;
  return <>
    <div className="inline-flex max-w-full flex-wrap items-center gap-x-1 text-xs">
      <span className="text-text-muted">原題依據：</span>{references.map(({ id, index }) => <button type="button" key={id} aria-haspopup="dialog" aria-expanded={selected === id} onClick={() => setSelected(id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-1 text-text-soft underline decoration-neutral-300 underline-offset-4 hover:decoration-text-soft focus-visible:outline-2 focus-visible:outline-primary" title={evidence[index].text.slice(0, 80)}>題 {index + 1}</button>)}
    </div>
    {item && <AppDialog title={`原題依據 · 題 ${evidence.findIndex(e => e.id === item.id) + 1}`} onClose={() => setSelected(null)}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-text-muted">報告當時的題目版本 · {item.confirmationStatus === 'confirmed' ? '使用者已確認' : item.confirmationStatus === 'ai' ? 'AI 辨識' : '確認狀態未記錄'}</p>
        <p className="whitespace-pre-wrap break-words leading-7">{item.text}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-2xl bg-page-bg p-4">
          <dt className="text-text-muted">原作答</dt><dd className="whitespace-pre-wrap break-words">{answerText(item.originalAnswer, item.options)}</dd>
          <dt className="text-text-muted">正解</dt><dd className="whitespace-pre-wrap break-words">{answerText(item.correctAnswer, item.options)}</dd>
        </dl>
        {!!item.recentAttempts?.length && <p className="text-xs text-text-muted">附期間內最近 {item.recentAttempts.length} 次有效作答，依各次當時答案解讀。</p>}
        <Link to={practiceRefPath(item.ref)} className="inline-flex min-h-11 items-center rounded-xl text-primary underline underline-offset-4">查看／修改原題</Link>
      </div>
    </AppDialog>}
  </>;
}
