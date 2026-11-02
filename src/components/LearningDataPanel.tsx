import { useEffect, useRef, useState } from 'react';
import { learningService } from '../services/learningService';
import { useStore } from '../store/useStore';
import { PracticeHistory } from './PracticeHistory';
import { learningDataIssues } from '../services/learningDataIssues';
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
        <input type={content.questionType === 'single_choice' ? 'radio' : 'checkbox'} name={label} checked={answer?.kind === 'choice' && answer.optionIds.includes(option.id)} onChange={e => {
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

/** Personal data editor used inside the recognition dialog. */
export function LearningDataPanel({ questionRef, onSaved, initialQuestion, onBusyChange, onLoaded, onErrorChange, onRecognize }: {
  questionRef: PersonalQuestionRef; onSaved?: (question: LearningQuestion) => void;
  initialQuestion?: LearningQuestion | null; onBusyChange?: (busy: boolean) => void;
  onRecognize?: () => Promise<LearningQuestion>;
  onLoaded?: (question: LearningQuestion) => void; onErrorChange?: (error: string) => void;
}) {
  const account = useStore(s => s.currentUser?.id || '');
  const [current, setCurrent] = useState<LearningQuestion | null>(null);
  const [draft, setDraft] = useState<LearningData | null>(null);
  const [draftBase, setDraftBase] = useState<LearningQuestion | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [correctionId, setCorrectionId] = useState<string | undefined>();
  const draftRef = useRef<LearningData | null>(null);
  draftRef.current = draft;
  const prepare = (result: LearningQuestion, data: LearningData = { content: result.content, personal: result.personal }) => {
    setDraftBase(result); setSuggestions([...new Set([...data.personal.errorReasons,
      ...(result.correction?.adopted ? result.correction.data?.personal.errorReasons || [] : [])].filter(r => r.origin === 'ai').map(r => r.text))]);
    setDraft(structuredClone({ ...data, personal: { ...data.personal, errorReasons: data.personal.errorReasons.filter(r => r.origin === 'user' || r.accepted) } }));
  };
  const adoptLoaded = (result: LearningQuestion) => {
    setCurrent(result); onLoaded?.(result);
    const candidate = result.correction;
    if (candidate?.status === 'complete' && !candidate.adopted && !candidate.stale && candidate.data && !draftRef.current) {
      prepare(result, candidate.data); setCorrectionId(candidate.id); setPreview(true);
    }
  };
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(new AbortController()), running = useRef(false);
  const kind = questionRef.kind, id = kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setCurrent(null); setDraft(null); setDraftBase(null); setError(''); setPreview(false); setCorrectionId(undefined); setSuggestions([]); setBusy(false); running.current = false;
    void (initialQuestion ? Promise.resolve(initialQuestion) : learningService.read(questionRef, abort.signal)).then(result => { if (!abort.signal.aborted) adoptLoaded(result); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [account, kind, id]);
  useEffect(() => { const update = () => { const signal = controller.current.signal; if (!draftRef.current) void learningService.read(questionRef, signal).then(value => { if (!signal.aborted) adoptLoaded(value); }).catch(() => {}); }; window.addEventListener('redolve:corrections', update); return () => window.removeEventListener('redolve:corrections', update); }, [account, kind, id]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { onErrorChange?.(error); }, [error, onErrorChange]);
  useEffect(() => {
    if (current?.correction?.status !== 'pending' || draft) return;
    const signal = controller.current.signal;
    const timer = setTimeout(() => { void learningService.read(questionRef, signal).then(value => { if (!signal.aborted) adoptLoaded(value); }).catch(() => {}); }, 8000);
    return () => clearTimeout(timer);
  }, [current, draft]);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (running.current || !account || useStore.getState().currentUser?.id !== account) return;
    const signal = controller.current.signal; running.current = true; setBusy(true); setError('');
    try { await action(signal); } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : '操作失敗'); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const save = () => void run(async signal => {
    if (!current || !draft) return;
    const result = await learningService.save(draftBase || current, validateLearningData(draft), signal, correctionId);
    if (!signal.aborted) { setCurrent(result); setDraft(null); setDraftBase(null); setPreview(false); setCorrectionId(undefined); onSaved?.(result); }
  });
  const content = draft?.content;
  return <section aria-label="辨識資料" className="mb-4 rounded-2xl border border-border-subtle bg-page-bg p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-text-main">辨識資料</h3>
      {current && <span className="text-xs text-text-muted">{preview ? 'AI 辨識' : current.confirmationStatus === 'confirmed' ? '使用者已確認' : 'AI 辨識'}</span>}
    </div>
    {current && !draft && <>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-text-muted">原作答</dt><dd className="whitespace-pre-wrap break-words">{displayAnswer(current.personal.originalAnswer, current.content)}</dd>
        <dt className="text-text-muted">正解</dt><dd className="whitespace-pre-wrap break-words">{displayAnswer(current.content.correctAnswer, current.content)}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => { setCorrectionId(undefined); prepare(current); }}>修改／確認資料</button>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(async signal => {
          if (!onRecognize) throw Error('請回到原題，依目前訂正筆跡重新整理');
          const result = await onRecognize();
          if (!signal.aborted) adoptLoaded(result);
        })}>{busy ? '處理中…' : '依目前筆跡重新整理'}</button>
      </div>
    </>}
    {current?.correction?.status === 'pending' && <p role="status" className="mt-3 text-xs text-text-muted">AI 正在整理訂正，可先繼續下一題。</p>}
    {current?.correction?.error && <p role="alert" className="mt-3 text-xs text-text-muted">{current.correction.error}</p>}
    {current?.correction?.stale && !current.correction.adopted && <p className="mt-3 text-xs text-text-muted">題目資料已有修改，這份 AI 整理不會覆蓋目前內容。可依目前筆跡重新整理。</p>}
    {current?.personal.correctionSummary && !draft && <p className="mt-3 whitespace-pre-wrap text-sm">{current.personal.correctionSummary}</p>}
    {current && !draft && <ul aria-label="已採用錯因" className="mt-3 space-y-2 text-sm">{current.personal.errorReasons.filter(r => r.origin === 'user' || r.accepted).map((reason, index) => <li key={index} className="rounded-xl bg-surface p-3">{reason.text}</li>)}</ul>}
    {current && !draft && learningDataIssues(current).length > 0 && <ul className="mt-3 space-y-1 text-xs text-text-muted" aria-label="資料缺漏">
      {learningDataIssues(current).map(issue => <li key={issue}>{issue}</li>)}
    </ul>}
    {current?.sourceUpdated && <p className="mt-3 text-xs text-text-muted">已存入的來源版本更新了，目前辨識資料仍保留先前內容。可重新辨識、預覽後採用；歷次作答與已產生報告保留原依據。</p>}
    {draft && content && <fieldset disabled={busy} className="mt-3 space-y-4">
      {preview && <p role="status" className="text-sm text-text-muted">這是依訂正內容整理的新建議，尚未確認。原已確認資料會保留到你採用為止。</p>}
      <details><summary className="cursor-pointer text-sm">編輯題型、題文與選項</summary><div className="mt-3 space-y-4">
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
      </div></details>
      <AnswerInput label="原作答" content={content} answer={draft.personal.originalAnswer} onChange={originalAnswer => setDraft({ ...draft, personal: { ...draft.personal, originalAnswer } })} />
      <AnswerInput label="正解" content={content} answer={content.correctAnswer} onChange={correctAnswer => setDraft({ ...draft, content: { ...content, correctAnswer } })} />
      <fieldset className="space-y-2"><legend className="text-sm">你認同哪些可能錯因？</legend><p className="text-xs text-text-muted">AI 建議預設不勾選，可全不選；看不出原因時保持空白即可。</p>
        {suggestions.map(text => <label key={text} className="flex min-h-11 items-start gap-3 rounded-xl border border-border-subtle p-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.personal.errorReasons.some(r => r.text === text && r.accepted)} onChange={e => setDraft({ ...draft, personal: { ...draft.personal, errorReasons: e.target.checked ? [...draft.personal.errorReasons.filter(r => r.text !== text), { text, origin: 'ai', accepted: true }] : draft.personal.errorReasons.filter(r => r.text !== text) } })} /><span>{text}</span></label>)}
        <label className="block text-xs text-text-muted">自行補充錯因（每行一項，選填）<textarea className={fieldClass} rows={2} maxLength={10000} value={draft.personal.errorReasons.filter(r => r.origin === 'user').map(r => r.text).join('\n')} onChange={e => setDraft({ ...draft, personal: { ...draft.personal, errorReasons: [...draft.personal.errorReasons.filter(r => r.origin === 'ai'), ...e.target.value.split('\n').map(text => ({ text, origin: 'user' as const, accepted: true }))] } })} /></label>
      </fieldset>
      <label className="block text-xs text-text-muted">訂正重點（可修改或留空）<textarea className={fieldClass} rows={3} maxLength={6000} value={draft.personal.correctionSummary || ''} onChange={e => setDraft({ ...draft, personal: { ...draft.personal, correctionSummary: e.target.value } })} /></label>
      <p className="text-xs text-text-muted">儲存表示確認目前這份資料，原作答、正解與錯因都可以保持空白；確認後不會因缺漏再提醒。</p>
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
