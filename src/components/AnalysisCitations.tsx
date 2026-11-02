import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisEvidence } from '../types/analysis';
import { practiceRefPath } from '../types/practice';

const answerText = (answer: unknown, options: { id: string; label: string }[] = []) => {
  const value = answer as { kind?: string; text?: string; optionIds?: string[] } | null;
  return !value ? '尚無資料' : value.kind === 'text' ? value.text : value.optionIds?.map(id => options.find(o => o.id === id)?.label || id).join('、') || '尚無資料';
};
export function AnalysisCitations({ ids, evidence }: { ids: string[]; evidence: AnalysisEvidence[] }) {
  const [selected, setSelected] = useState<string | null>(null), item = evidence.find(e => e.id === selected && ids.includes(e.id));
  if (!ids.length) return null;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-text-muted">原題依據</span>{ids.map(id => { const index = evidence.findIndex(e => e.id === id); return index < 0 ? null : <button key={id} aria-expanded={selected === id} onClick={() => setSelected(selected === id ? null : id)} className="min-h-11 rounded-xl border border-border-subtle bg-page-bg px-3 text-xs" title={evidence[index].text.slice(0, 80)}>題 {index + 1}</button>; })}</div>
    {item && <div className="space-y-3 rounded-2xl bg-page-bg p-4 text-sm">
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-text-muted">報告當時的題目版本 · {item.confirmationStatus === 'confirmed' ? '使用者已確認' : 'AI 辨識'}</span><button className="min-h-11 px-2 text-xs underline" onClick={() => setSelected(null)}>收起</button></div>
      <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p><p className="text-xs text-text-muted">原作答：{answerText(item.originalAnswer, item.options)}；正解：{answerText(item.correctAnswer, item.options)}</p>
      {!!item.recentAttempts?.length && <p className="text-xs text-text-muted">附期間內最近 {item.recentAttempts.length} 次有效作答，依各次當時答案解讀。</p>}
      <Link to={practiceRefPath(item.ref)} className="inline-flex min-h-11 items-center text-primary underline">查看／修改原題</Link>
    </div>}
  </div>;
}
