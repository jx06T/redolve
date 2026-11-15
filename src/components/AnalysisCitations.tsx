import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisEvidence, AnalysisErrorReason } from '../types/analysis';
import { practiceRefPath } from '../types/practice';
import { AppDialog } from './AppDialog';
import { RichText } from './RichText';

const answerText = (answer: unknown, options: { id: string; label: string }[] = []) => {
  const value = answer as { kind?: string; text?: string; optionIds?: string[] } | null;
  return !value ? '尚無資料' : value.kind === 'text' ? value.text : value.optionIds?.map(id => options.find(o => o.id === id)?.label || id).join('、') || '尚無資料';
};
function isErrorReason(value: unknown): value is AnalysisErrorReason {
  return !!value && typeof value === 'object' && 'text' in value && typeof value.text === 'string' &&
    'origin' in value && (value.origin === 'ai' || value.origin === 'user');
}
export function AnalysisCitations({ ids, evidence }: { ids: string[]; evidence: AnalysisEvidence[] }) {
  const [selected, setSelected] = useState<string | null>(null), item = evidence.find(e => e.id === selected && ids.includes(e.id));
  const reasons = Array.isArray(item?.errorReasons) ? item.errorReasons.filter(isErrorReason) : [];
  const references = [...new Set(ids)].flatMap(id => { const index = evidence.findIndex(e => e.id === id); return index < 0 ? [] : [{ id, index }]; });
  if (!references.length) return null;
  return <>
    <div className="inline-flex max-w-full flex-wrap items-center gap-x-1 text-xs">
      <span className="text-text-muted">原題依據：</span>{references.map(({ id, index }) => <button type="button" key={id} aria-haspopup="dialog" aria-expanded={selected === id} onClick={() => setSelected(id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-1 text-text-soft underline decoration-neutral-300 underline-offset-4 hover:decoration-text-soft focus-visible:outline-2 focus-visible:outline-primary" title={evidence[index].text.slice(0, 80)}>題 {index + 1}</button>)}
    </div>
    {item && <AppDialog title={`原題依據 · 題 ${evidence.findIndex(e => e.id === item.id) + 1}`} onClose={() => setSelected(null)}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-text-muted">報告當時的題目版本 · {item.confirmationStatus === 'confirmed' ? '使用者已確認' : item.confirmationStatus === 'ai' ? 'AI 辨識' : '確認狀態未記錄'}</p>
        <RichText text={item.text} className="leading-7" />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-2xl bg-page-bg p-4">
          <dt className="text-text-muted">原作答</dt><dd className="min-w-0"><RichText text={answerText(item.originalAnswer, item.options)} /></dd>
          <dt className="text-text-muted">正解</dt><dd className="min-w-0"><RichText text={answerText(item.correctAnswer, item.options)} /></dd>
        </dl>
        {item.correctionSummary && <section className="space-y-2"><h3 className="font-medium">訂正摘要</h3><RichText text={item.correctionSummary} /></section>}
        {!!reasons.length && <section className="space-y-2"><h3 className="font-medium">當時記錄的錯因</h3>
          <ul className="space-y-3">{reasons.map((reason, index) => <li key={index}>
            <span className="text-xs text-text-muted">{reason.origin === 'user' ? '本人填寫' : reason.accepted ? '本人採用 AI 建議' : 'AI 候選，尚未採用'}</span>
            <RichText text={reason.text} />
          </li>)}</ul>
        </section>}
        {!!item.recentAttempts?.length && <section className="space-y-2">
          <h3 className="font-medium">當時的作答紀錄</h3>
          <p className="text-xs text-text-muted">顯示報告採用的最近 {item.recentAttempts.length} 次紀錄，含結果更正。</p>
          <ul className="divide-y divide-border-subtle">{item.recentAttempts.map(attempt => <li key={attempt.id} className="space-y-2 py-3">
            <p>{new Date(attempt.answeredAt).toLocaleString()} · {attempt.result === 'correct' ? '答對' : '答錯'} · {attempt.gradingMethod === 'self' ? '自評' : '自動判分'}{attempt.usedOriginalImage ? ' · 看過原圖' : ''}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
              <dt className="text-text-muted">作答</dt><dd className="min-w-0"><RichText text={attempt.answerDisplay || answerText(attempt.answer)} /></dd>
              <dt className="text-text-muted">當時正解</dt><dd className="min-w-0"><RichText text={attempt.correctAnswerDisplay || answerText(attempt.correctAnswer)} /></dd>
            </dl>
          </li>)}</ul>
        </section>}
        <Link to={practiceRefPath(item.ref)} className="inline-flex min-h-11 items-center rounded-xl text-primary underline underline-offset-4">查看／修改原題</Link>
      </div>
    </AppDialog>}
  </>;
}
