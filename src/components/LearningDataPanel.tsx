import { useEffect, useRef, useState } from 'react';
import { learningService } from '../services/learningService';
import { useStore } from '../store/useStore';
import { PracticeHistory } from './PracticeHistory';
import { validateLearningData, QUESTION_TYPES } from '../types/learning';
import type { LearningAnswer, LearningContent, LearningData, LearningQuestion, PersonalQuestionRef } from '../types/learning';

const typeLabels = ['單選', '複選', '填充', '計算', '申論', '其他', '未知'];
const fieldClass = 'mt-1 w-full rounded-xl border border-border-subtle bg-surface p-2 text-sm text-text-main';
const buttonClass = 'rounded-xl border border-border-subtle px-3 py-2 text-xs disabled:opacity-40';
const displayAnswer = (answer: LearningAnswer, content: LearningContent) => !answer ? '尚無資料' : answer.kind === 'text'
  ? answer.text : answer.optionIds.map(id => content.options.find(o => o.id === id)?.label || id).join('、');

function AnswerInput({ label, answer, content, onChange }: {
  label: string; answer: LearningAnswer; content: LearningContent; onChange: (answer: LearningAnswer) => void;
}) {
  const choice = ['single_choice', 'multiple_choice'].includes(content.questionType);
  return <fieldset className="space-y-1"><legend className="text-xs text-text-muted">{label}</legend>
    {choice ? <>
      {!content.options.length && <p className="text-xs text-text-muted">請先補上選項，或保持空白。</p>}
      {content.options.map(option => <label key={option.id} className="mr-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={answer?.kind === 'choice' && answer.optionIds.includes(option.id)} onChange={e => {
          const selected = answer?.kind === 'choice' ? answer.optionIds : [];
          const next = e.target.checked ? content.questionType === 'single_choice' ? [option.id] : [...selected, option.id] : selected.filter(id => id !== option.id);
          onChange(next.length ? { kind: 'choice', optionIds: next } : null);
        }} />{option.label}
      </label>)}
    </> : <textarea aria-label={label} className={fieldClass} rows={2} maxLength={16000}
      value={answer?.kind === 'text' ? answer.text : ''} onChange={e => onChange(e.target.value ? { kind: 'text', text: e.target.value } : null)} />}
    {answer && <button type="button" onClick={() => onChange(null)} className="ml-2 text-xs text-text-muted underline">清空{label}</button>}
  </fieldset>;
}

/** Mounted only for the active personal question; never for a shared reader or guest. */
export function LearningDataPanel({ questionRef, onSaved }: { questionRef: PersonalQuestionRef; onSaved?: (question: LearningQuestion) => void }) {
  const account = useStore(s => s.currentUser?.id || '');
  const [current, setCurrent] = useState<LearningQuestion | null>(null);
  const [draft, setDraft] = useState<LearningData | null>(null);
  const [draftBase, setDraftBase] = useState<LearningQuestion | null>(null);
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(new AbortController()), running = useRef(false);
  const kind = questionRef.kind, id = kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setCurrent(null); setDraft(null); setDraftBase(null); setError(''); setPreview(false); setBusy(false); running.current = false;
    void learningService.read(questionRef, abort.signal).then(result => { if (!abort.signal.aborted) setCurrent(result); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [account, kind, id]);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (running.current || !account || useStore.getState().currentUser?.id !== account) return;
    const signal = controller.current.signal; running.current = true; setBusy(true); setError('');
    try { await action(signal); } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : '操作失敗'); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const save = () => void run(async signal => {
    if (!current || !draft) return;
    const result = await learningService.save(draftBase || current, validateLearningData(draft), signal);
    if (!signal.aborted) { setCurrent(result); setDraft(null); setDraftBase(null); setPreview(false); onSaved?.(result); }
  });
  const content = draft?.content;
  return <section aria-label="辨識資料" className="mb-4 rounded-2xl border border-border-subtle bg-page-bg p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-text-main">辨識資料</h3>
      {current && <span className="text-xs text-text-muted">{current.confirmationStatus === 'confirmed' ? '使用者已確認' : 'AI 辨識'}</span>}
    </div>
    {current && !draft && <>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-text-muted">原作答</dt><dd className="whitespace-pre-wrap break-words">{displayAnswer(current.personal.originalAnswer, current.content)}</dd>
        <dt className="text-text-muted">正解</dt><dd className="whitespace-pre-wrap break-words">{displayAnswer(current.content.correctAnswer, current.content)}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => setDraft(structuredClone({ content: current.content, personal: current.personal }))}>修改辨識資料</button>
        {current.revisionId && current.confirmationStatus === 'ai' && <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(async signal => {
          const result = await learningService.confirm(current, signal); if (!signal.aborted) setCurrent(result);
        })}>確認正確</button>}
        <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(async signal => {
          const result = await learningService.preview(questionRef, signal);
          if (!signal.aborted) { setDraftBase(result); setDraft({ content: result.content, personal: result.personal }); setPreview(true); }
        })}>{busy ? '處理中…' : '重新辨識'}</button>
      </div>
    </>}
    {draft && content && <fieldset disabled={busy} className="mt-3 space-y-4">
      {preview && <p role="status" className="text-sm text-text-muted">新結果尚未儲存。可先修改，再採用並確認。</p>}
      <label className="block text-xs text-text-muted">題型<select className={fieldClass} value={content.questionType} onChange={e => {
        const questionType = e.target.value as LearningContent['questionType'];
        const choice = ['single_choice', 'multiple_choice'].includes(questionType);
        const adapt = (answer: LearningAnswer): LearningAnswer => {
          if (!answer || (answer.kind === 'choice') !== choice) return null;
          if (questionType === 'single_choice' && answer.kind === 'choice' && answer.optionIds.length !== 1) return null;
          return answer;
        };
        setDraft({ content: { ...content, questionType, correctAnswer: adapt(content.correctAnswer) },
          personal: { ...draft.personal, originalAnswer: adapt(draft.personal.originalAnswer) } });
      }}>{QUESTION_TYPES.map((type, i) => <option key={type} value={type}>{typeLabels[i]}</option>)}</select></label>
      <label className="block text-xs text-text-muted">題幹（不含作答、答案與批改）<textarea className={fieldClass} rows={5} maxLength={64000}
        value={content.ocrText || ''} onChange={e => setDraft({ ...draft, content: { ...content, ocrText: e.target.value || null } })} /></label>
      <fieldset className="space-y-2"><legend className="text-xs text-text-muted">選項</legend>
        {content.options.map((option, index) => <div key={option.id} className="flex items-start gap-2">
          <input aria-label={`選項 ${index + 1} 編號`} className={fieldClass + ' max-w-20'} value={option.label} maxLength={64}
            onChange={e => setDraft({ ...draft, content: { ...content, options: content.options.map(o => o.id === option.id ? { ...o, label: e.target.value } : o) } })} />
          <textarea aria-label={`選項 ${index + 1} 內容`} className={fieldClass} rows={2} value={option.text} maxLength={8000}
            onChange={e => setDraft({ ...draft, content: { ...content, options: content.options.map(o => o.id === option.id ? { ...o, text: e.target.value } : o) } })} />
          <button type="button" className={buttonClass + ' mt-1'} aria-label={`刪除選項 ${index + 1}`} onClick={() => {
            const remove = (a: LearningAnswer): LearningAnswer => a?.kind === 'choice' && a.optionIds.includes(option.id) ? null : a;
            setDraft({ content: { ...content, options: content.options.filter(o => o.id !== option.id), correctAnswer: remove(content.correctAnswer) },
              personal: { ...draft.personal, originalAnswer: remove(draft.personal.originalAnswer) } });
          }}>刪除</button>
        </div>)}
        <button type="button" disabled={content.options.length >= 30} className={buttonClass} onClick={() => setDraft({ ...draft, content: {
          ...content, options: [...content.options, { id: crypto.randomUUID(), label: String(content.options.length + 1), text: '' }],
        } })}>新增選項</button>
      </fieldset>
      <AnswerInput label="原作答" content={content} answer={draft.personal.originalAnswer} onChange={originalAnswer => setDraft({ ...draft, personal: { ...draft.personal, originalAnswer } })} />
      <AnswerInput label="正解" content={content} answer={content.correctAnswer} onChange={correctAnswer => setDraft({ ...draft, content: { ...content, correctAnswer } })} />
      <label className="block text-xs text-text-muted">可能錯因（每行一項，可留空）<textarea className={fieldClass} rows={2} maxLength={12000}
        value={draft.personal.errorReasons.map(r => r.text).join('\n')} onChange={e => setDraft({ ...draft, personal: { ...draft.personal,
          errorReasons: e.target.value.split('\n').map(text => draft.personal.errorReasons.find(r => r.text === text) || { text, origin: 'user' }),
        } })} /></label>
      <p className="text-xs text-text-muted">儲存表示確認目前這份資料，未填欄位可以保持空白。</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClass} onClick={() => { setDraft(null); setDraftBase(null); setPreview(false); setError(''); }}>取消</button>
        <button type="button" className={buttonClass + ' bg-primary/10 text-primary'} onClick={save}>{preview ? '採用並確認' : '儲存並確認'}</button>
      </div>
    </fieldset>}
    {!current && !error && <p role="status" className="mt-2 text-xs text-text-muted">讀取辨識資料…</p>}
    {error && <div className="mt-3 text-sm"><p role="alert">{error}</p><button type="button" disabled={busy} className={buttonClass + ' mt-2'} onClick={() => void run(async signal => {
      const result = await learningService.read(questionRef, signal); if (!signal.aborted) { setCurrent(result); setDraft(null); setDraftBase(null); setPreview(false); }
    })}>重新載入資料</button></div>}
    {current?.id && import.meta.env.VITE_PRACTICE_ENABLED === 'true' && <PracticeHistory questionId={current.id} />}
  </section>;
}
