import { useState } from 'react';
import type { PracticeRoundResult, PracticeSession } from '../types/practice';
import { displayAnswer } from '../types/learning';
import { RichText } from './RichText';
import { AttemptWeaknessEditor } from './AttemptWeaknessEditor';
import { PracticeImage } from './PracticeQuestionCard';

const resultOrder = { incorrect: 0, skipped: 1, correct: 2 };

export function PracticeRoundSummary({ session, results }: { session: PracticeSession; results: Record<string, PracticeRoundResult> }) {
  const [image, setImage] = useState<string>();
  const rows = session.questions.map((question, index) => {
    const result = results[question.sessionItemId];
    return { index, question: result?.question ?? question, result, status: result?.result ?? 'skipped' } as const;
  });
  const count = (status: keyof typeof resultOrder) => rows.filter(row => row.status === status).length;
  return <div className="space-y-4">
    <p className="text-sm">共 {rows.length} 題 · 答對 {count('correct')} · 答錯 {count('incorrect')} · 略過 {count('skipped')}</p>
    <p className="text-sm text-text-muted">可回顧本輪題目，並確認答錯時遇到的問題。弱點標記可略過。</p>
    {[...rows].sort((a, b) => resultOrder[a.status] - resultOrder[b.status]).map(({ question, result, status, index }) => <details key={question.sessionItemId} className="rounded-xl border border-border-subtle p-3">
      <summary className="cursor-pointer text-sm">第 {index + 1} 題 · {status === 'correct' ? '答對' : status === 'incorrect' ? '答錯' : '略過'}{result && ` · ${result.gradingMethod === 'self' ? '自評' : '自動判分'}`}</summary>
      <div className="mt-3 space-y-3 text-sm">
        <RichText text={question.content.ocrText} />
        <button type="button" className="min-h-11 rounded-xl border border-border-subtle px-3 py-2" onClick={() => setImage(question.imageUrl)}>檢視原圖</button>
        {question.content.options.length > 0 && <ul className="space-y-1">{question.content.options.map(option => <li key={option.id}>{option.label}　<RichText inline text={option.text} /></li>)}</ul>}
        <p>本次答案 <RichText inline text={displayAnswer(result?.answer ?? null, question.content)} /></p>
        <p>當時正解 <RichText inline text={displayAnswer(question.content.correctAnswer, question.content)} /></p>
        {question.personal.errorReasons.some(reason => reason.origin === 'user' || reason.accepted) && <div>
          <p className="text-text-muted">過往確認的錯因</p><ul>{question.personal.errorReasons.filter(reason => reason.origin === 'user' || reason.accepted).map((reason, i) => <li key={i}><RichText inline text={reason.text} /></li>)}</ul>
        </div>}
        {status === 'incorrect' && result && <AttemptWeaknessEditor attemptId={result.attemptId} questionRef={question.ref} reasons={question.personal.errorReasons} initial={{ ids: [], version: 0 }} />}
      </div>
    </details>)}
    {image && <PracticeImage url={image} close={() => setImage(undefined)} />}
  </div>;
}
