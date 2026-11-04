import { useEffect, useRef, useState } from 'react';
import Panzoom from '@panzoom/panzoom';
import type { PanzoomObject } from '@panzoom/panzoom';
import { Check, X, Minus, Plus, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react';
import { DrawCanvas } from './DrawCanvas';
import { FloatingPenToolbar } from './FloatingPenToolbar';
import { AppDialog } from './AppDialog';
import { CALC_SPACE_STEP } from '../config/constants';
import { runDrawingCommand } from '../services/drawingCommands';
import { LearningDataDialog } from './LearningDataButton';
import { RichText } from './RichText';
import { practiceService, syncPractice } from '../services/practiceService';
import { gradePractice } from '../types/practice';
import type { AttemptInput, PracticeQuestion } from '../types/practice';
import type { LearningAnswer } from '../types/learning';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
const actionControl = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40';
const actionButton = actionControl + ' border-border-subtle bg-surface';
const primaryAction = actionControl + ' border-primary/30 bg-primary/10 text-primary-600 hover:bg-primary/15 dark:text-primary-300';
const resultTone = {
  correct: 'border-status-resolved/40 bg-status-resolved/15 text-[#276D56] dark:text-[#9CDCC4]',
  incorrect: 'border-status-eraser/40 bg-status-eraser/15 text-[#A0414A] dark:text-[#F0A8AE]',
};
const previewControl = 'flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary';
const previewScales = [1, 1.25, 1.5, 2, 3, 4, 5];

export function PracticeImage({ url, close }: { url: string; close: () => void }) {
  const img = useRef<HTMLImageElement>(null), pan = useRef<PanzoomObject | null>(null);
  const [loaded, setLoaded] = useState(false), [scale, setScale] = useState(1.5);
  useEffect(() => {
    if (!loaded || !img.current) return;
    const element = img.current;
    const p = Panzoom(element, { startScale: 1.5, minScale: 1, maxScale: 5, contain: 'outside' }); pan.current = p;
    const updateScale = (event: Event) => { setScale((event as CustomEvent<{ scale: number }>).detail.scale); };
    element.addEventListener('panzoomchange', updateScale);
    return () => { element.removeEventListener('panzoomchange', updateScale); p.destroy(); pan.current = null; };
  }, [loaded]);
  return <AppDialog title="原圖（可能含答案）" onClose={close} size="wide">
    <div className="relative h-[min(68dvh,46rem)] overflow-hidden rounded-xl bg-page-bg" onWheel={e => pan.current?.zoomWithWheel(e.nativeEvent)}>
      <img ref={img} src={url} onLoad={() => setLoaded(true)} alt="原題圖片，可拖曳縮放" className="exam-paper-image h-full w-full object-contain" />
      <div role="group" aria-label="原圖縮放" onWheel={e => e.stopPropagation()} className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface/95 p-1 text-text-main shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <label><span className="sr-only">原圖縮放倍率</span><select value={scale} title="選擇倍率並置中" onChange={e => { const value = Number(e.target.value); setScale(value); pan.current?.reset({ animate: false }); pan.current?.zoom(value, { animate: false }); }} className="min-h-11 rounded-xl bg-transparent px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary">
          {!previewScales.includes(scale) && <option value={scale}>{Math.round(scale * 100)}%</option>}
          {previewScales.map(v => <option key={v} value={v}>{v * 100}%</option>)}
        </select></label>
        <button type="button" className={previewControl} onClick={() => pan.current?.zoomIn()} aria-label="放大原圖" title="放大原圖"><ZoomIn size={18} aria-hidden="true" /></button>
        <button type="button" className={previewControl} onClick={() => pan.current?.zoomOut()} aria-label="縮小原圖" title="縮小原圖"><ZoomOut size={18} aria-hidden="true" /></button>
      </div>
    </div>
  </AppDialog>;
}
export function PracticeQuestionCard({ question, sessionId, next, onRecorded }: {
  question: PracticeQuestion; sessionId: string; next: () => void; onRecorded: (result: import('../types/practice').PracticeRoundResult) => void;
}) {
  const uid = useStore(s => s.currentUser?.id || ''), eventId = useRef(crypto.randomUUID());
  const tool = useStore(s => s.tool), penColor = useStore(s => s.penColor), penWidth = useStore(s => s.penWidth);
  const [answer, setAnswer] = useState<LearningAnswer>(null), [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [editKey, setEditKey] = useState(false);
  const [openImage, setOpenImage] = useState(false), [everImage, setEverImage] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(question);
  const displayContent = currentQuestion.content;
  const [height, setHeight] = useState(400);
  const card = useRef<HTMLDivElement>(null), answerPanel = useRef<HTMLDivElement>(null), errorPanel = useRef<HTMLParagraphElement>(null);
  const answeredAt = useRef<string | null>(null);
  const active = useRef(true), lock = useRef(false);
  useEffect(() => { active.current = true; card.current?.scrollIntoView({ block: 'start' }); return () => { active.current = false; }; }, []);
  useEffect(() => { if (revealed) answerPanel.current?.scrollIntoView({ block: 'nearest' }); }, [revealed]);
  useEffect(() => { if (error) errorPanel.current?.scrollIntoView({ block: 'nearest' }); }, [error]);
  const choice = ['single_choice', 'multiple_choice'].includes(displayContent.questionType);
  const automatic = choice && displayContent.correctAnswer?.kind === 'choice';
  let automaticResult: 'correct' | 'incorrect' | null = null;
  if (revealed && automatic) {
    try { automaticResult = gradePractice(displayContent, answer).result; }
    catch { /* Invalid answers return to the answering stage when revealing or editing. */ }
  }
  const reveal = () => {
    setError('');
    try {
      if (automatic) gradePractice(displayContent, answer);
      setRevealed(true);
    } catch (e) { setError((e as Error).message); }
  };
  const commit = async (selfResult?: 'correct' | 'incorrect') => {
    if (lock.current || useStore.getState().currentUser?.id !== uid) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const target = currentQuestion;
      const graded = gradePractice(target.content, answer, selfResult);
      const payload: AttemptInput = { id: eventId.current, questionId: target.id, revisionId: target.revisionId,
        sessionId, sessionItemId: question.sessionItemId, answer: graded.answer, ...(selfResult ? { selfResult } : {}),
        clientAnsweredAt: answeredAt.current ||= new Date().toISOString(), clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        usedOriginalImage: everImage };
      await practiceService.enqueue(uid, payload, target);
      if (!active.current || useStore.getState().currentUser?.id !== uid) return;
      onRecorded({ attemptId: payload.id, question: target, ...graded });
      void syncPractice(uid).catch(() => { /* The page shows the pending event count. */ });
      next();
    } catch (e) { if (active.current) setError((e as Error).message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  const key = displayContent.correctAnswer;
  const keyLabel = !key ? '尚無正解，可先自評' : key.kind === 'text' ? key.text : key.optionIds.map(id => displayContent.options.find(o => o.id === id)?.label).join('、');
  return <div ref={card} className="space-y-3 pb-28">
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
      <RichText text={displayContent.ocrText} className="text-base leading-relaxed" />
      {choice ? <fieldset disabled={revealed || busy} className="space-y-2"><legend className="sr-only">本次作答</legend>
        {displayContent.options.map(o => <label key={o.id} className="flex items-start gap-3 rounded-xl border border-border-subtle p-3 leading-6">
          <input type={displayContent.questionType === 'single_choice' ? 'radio' : 'checkbox'} name={question.sessionItemId} className="m-0"
            checked={answer?.kind === 'choice' && answer.optionIds.includes(o.id)} onChange={e => {
              const previous = answer?.kind === 'choice' ? answer.optionIds : [];
              setAnswer({ kind: 'choice', optionIds: displayContent.questionType === 'single_choice' ? [o.id] : e.target.checked ? [...previous, o.id] : previous.filter(id => id !== o.id) });
            }} /><span className="min-w-0 break-words">{o.label}　<RichText inline text={o.text} /></span>
        </label>)}
      </fieldset> : <label className="block text-sm">本次答案（也可在草稿作答）<textarea disabled={revealed || busy} maxLength={16000} rows={3}
        value={answer?.kind === 'text' ? answer.text : ''} onChange={e => setAnswer(e.target.value ? { kind: 'text', text: e.target.value } : null)}
        className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3" /></label>}
      {revealed && <div ref={answerPanel} className="space-y-3 rounded-2xl bg-page-bg p-4">
        <p className="text-sm">正解：<RichText inline text={keyLabel} /></p>
        {automaticResult && <p role="status" className={'rounded-xl border px-3 py-2 text-sm ' + resultTone[automaticResult]}>自動判分：{automaticResult === 'correct' ? '這次答對' : '這次答錯'}（尚未記錄）</p>}
      </div>}
      {error && <p ref={errorPanel} role="alert" className="text-sm">{error}</p>}
      <section aria-label="本輪草稿" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-muted">本輪草稿（離開即清除）</span>
          <div role="group" aria-label="草稿操作" className="flex items-center gap-1">
            <button type="button" className={button + ' flex min-h-11 items-center gap-1.5 px-3'} onClick={() => runDrawingCommand('undo', null)} title="復原上一筆"><Undo2 size={15} />復原</button>
            <button type="button" className={button + ' flex min-h-11 items-center gap-1.5 px-3'} onClick={() => runDrawingCommand('redo', null)} title="重做上一筆"><Redo2 size={15} />重做</button>
          </div>
        </div>
        <div data-practice-scratchpad className="relative overflow-hidden rounded-2xl border border-border-subtle bg-page-bg" style={{ height }}>
          <DrawCanvas calcSpaceHeight={height} activeTool={tool} activeColor={penColor} activeWidth={penWidth} />
        </div>
        <div role="group" aria-label="草稿長度" className="flex justify-end gap-1">
          <button type="button" className={button + ' flex min-h-11 items-center gap-1.5 px-3'} disabled={height <= 100} onClick={() => setHeight(h => Math.max(100, h - CALC_SPACE_STEP))} title={`縮短 ${CALC_SPACE_STEP}px，保留筆跡`}><Minus size={15} />縮短</button>
          <button type="button" className={button + ' flex min-h-11 items-center gap-1.5 px-3'} onClick={() => setHeight(h => h + CALC_SPACE_STEP)} title={`延伸 ${CALC_SPACE_STEP}px`}><Plus size={15} />延伸</button>
        </div>
      </section>
      <FloatingPenToolbar />
    </section>
    <div role="group" aria-label="練習操作" className="fixed inset-x-2 bottom-16 z-20 mx-auto max-w-6xl rounded-2xl border border-border-subtle bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_4px_20px_rgba(0,0,0,0.03)] sm:inset-x-4 md:bottom-3">
      <div className="overflow-x-scroll">
        <div className="flex min-w-max items-center gap-1.5">
          <button type="button" className={actionButton} onClick={() => { setOpenImage(true); setEverImage(true); }}>檢視原圖</button>
          {!revealed ? <button type="button" disabled={busy} className={primaryAction} onClick={reveal}>查看答案</button> : <>
            <button type="button" disabled={busy} className={actionControl + ' border-status-warning/40 bg-status-warning/10 text-text-main hover:bg-status-warning/20'} onClick={() => setEditKey(true)}>{key ? '答案有誤' : '補齊正解'}</button>
            {automatic ? <button type="button" disabled={busy || !automaticResult} className={actionControl + ' ' + (automaticResult ? resultTone[automaticResult] : 'border-primary/30 bg-primary/10 text-primary')} onClick={() => void commit()}>
              {automaticResult === 'correct' ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}確認結果並下一題</button> : <>
              <button type="button" disabled={busy} className={actionControl + ' ' + resultTone.correct + ' hover:bg-status-resolved/25'} onClick={() => void commit('correct')}><Check size={16} aria-hidden="true" />這次答對</button>
              <button type="button" disabled={busy} className={actionControl + ' ' + resultTone.incorrect + ' hover:bg-status-eraser/25'} onClick={() => void commit('incorrect')}><X size={16} aria-hidden="true" />這次答錯</button>
            </>}
          </>}
          <button type="button" disabled={busy} className={actionButton} onClick={next}>略過</button>
        </div>
      </div>
    </div>
    {editKey && <LearningDataDialog questionRef={question.ref} initialQuestion={currentQuestion} onClose={() => setEditKey(false)} onSaved={q => {
      if (!q.id || !q.revisionId) { setError('題目目前無法使用'); return; }
      const changedShape = q.content.questionType !== displayContent.questionType || JSON.stringify(q.content.options.map(o => o.id)) !== JSON.stringify(displayContent.options.map(o => o.id));
      let needsAnswer = changedShape;
      if (['single_choice', 'multiple_choice'].includes(q.content.questionType) && q.content.correctAnswer?.kind === 'choice') {
        try { gradePractice(q.content, changedShape ? null : answer); } catch { needsAnswer = true; }
      }
      setCurrentQuestion({ ...currentQuestion, ...q, id: q.id, revisionId: q.revisionId }); setEditKey(false);
      setError(needsAnswer ? '題目資料已更新，請確認本次作答後再查看答案。' : '');
      if (changedShape) setAnswer(null);
      if (needsAnswer) setRevealed(false);
    }} />}
    {openImage && <PracticeImage url={`${API_BASE.replace(/\/api\/?$/, '')}${question.imageUrl}`} close={() => setOpenImage(false)} />}
  </div>;
}
