import { useEffect, useState } from 'react';
import { practiceService } from '../services/practiceService';
import { RichText } from './RichText';
import type { PracticeAttempt } from '../types/practice';
import { AttemptWeaknessEditor } from './AttemptWeaknessEditor';
export function PracticeHistory({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<PracticeAttempt[]>([]), [cursor, setCursor] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return; const controller = new AbortController();
    void practiceService.history(questionId, undefined, controller.signal).then(data => { if (!controller.signal.aborted) { setRows(data.attempts); setCursor(data.nextCursor); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [open, questionId]);
  return <details className="mt-4 border-t border-border-subtle pt-3" onToggle={e => setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm">重作紀錄</summary>
    {error && <p role="alert">{error}</p>}{!rows.length && <p className="mt-2 text-sm text-text-muted">尚無已同步的重作紀錄。</p>}
    {rows.map(row => <details key={row.id} className="mt-3 rounded-xl bg-surface p-3 text-sm"><summary className="cursor-pointer">
      {new Date(row.answeredAt).toLocaleString()} · {row.result === 'correct' ? '答對' : '答錯'} · {row.gradingMethod === 'self' ? '自評' : '自動判分'}{row.voidedAt ? '（已被更正）' : ''}
    </summary><div className="mt-2">當時題文：<RichText text={row.basis.content.ocrText} /></div>
      <p>本次答案：<RichText inline text={!row.answer ? '未填' : row.answer.kind === 'text' ? row.answer.text : row.answer.optionIds.map(id => row.basis.content.options.find(o => o.id === id)?.label || id).join('、')} /></p>
      <p>當時正解：<RichText inline text={!row.basis.content.correctAnswer ? '未填' : row.basis.content.correctAnswer.kind === 'text' ? row.basis.content.correctAnswer.text : row.basis.content.correctAnswer.optionIds.map(id => row.basis.content.options.find(o => o.id === id)?.label || id).join('、')} /></p>
      {row.result === 'incorrect' && !row.voidedAt && <AttemptWeaknessEditor attemptId={row.id} />}
    </details>)}
    {cursor && <button className="mt-3 rounded-xl border border-border-subtle px-3 py-2 text-sm" onClick={() => void practiceService.history(questionId, cursor)
      .then(data => { setRows(old => [...old, ...data.attempts]); setCursor(data.nextCursor); }).catch(e => setError(e.message))}>更早的紀錄</button>}
  </details>;
}
