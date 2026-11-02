import { useEffect, useRef, useState } from 'react';
import Panzoom from '@panzoom/panzoom';
import type { PanzoomObject } from '@panzoom/panzoom';
import { Minus, Plus, Undo2, Redo2 } from 'lucide-react';
import { DrawCanvas } from './DrawCanvas';
import { FloatingPenToolbar } from './FloatingPenToolbar';
import { AppDialog } from './AppDialog';
import { CALC_SPACE_STEP } from '../config/constants';
import { runDrawingCommand } from '../services/drawingCommands';
import { LearningDataDialog } from './LearningDataButton';
import { learningService } from '../services/learningService';
import { practiceService, syncPractice } from '../services/practiceService';
import { gradePractice } from '../types/practice';
import type { AttemptInput, PracticeQuestion } from '../types/practice';
import type { LearningAnswer } from '../types/learning';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
const actionButton = 'min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm disabled:opacity-40';

function PracticeImage({ url, close }: { url: string; close: () => void }) {
  const img = useRef<HTMLImageElement>(null), pan = useRef<PanzoomObject | null>(null);
  const [loaded, setLoaded] = useState(false), [scale, setScale] = useState(1.5);
  useEffect(() => {
    if (!loaded || !img.current) return;
    const p = Panzoom(img.current, { startScale: 1.5, minScale: 1, maxScale: 5, contain: 'outside' }); pan.current = p;
    return () => { p.destroy(); pan.current = null; };
  }, [loaded]);
  return <AppDialog title="原圖（可能含答案）" onClose={close} size="wide">
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      <label className="text-xs">置中倍率 <select value={scale} onChange={e => { const value = Number(e.target.value); setScale(value); pan.current?.reset(); pan.current?.zoom(value, { animate: false }); }} className="rounded-xl border border-border-subtle bg-surface p-2">
        {[1.25, 1.5, 2].map(v => <option key={v} value={v}>{v} 倍</option>)}
      </select></label>
      <button className={button} onClick={() => pan.current?.zoomIn()} aria-label="放大原圖">＋</button>
      <button className={button} onClick={() => pan.current?.zoomOut()} aria-label="縮小原圖">−</button>
      <button className={button} onClick={close}>關閉原圖</button>
    </div>
    <div className="h-[min(60dvh,42rem)] overflow-hidden rounded-xl bg-page-bg" onWheel={e => pan.current?.zoomWithWheel(e.nativeEvent)}>
      <img ref={img} src={url} onLoad={() => setLoaded(true)} alt="原題圖片，可拖曳縮放" className="exam-paper-image h-full w-full object-contain" />
    </div>
  </AppDialog>;
}
export function PracticeQuestionCard({ question, sessionId, next, onRecorded }: {
  question: PracticeQuestion; sessionId: string; next: () => void; onRecorded: (result: 'correct' | 'incorrect') => void;
}) {
  const uid = useStore(s => s.currentUser?.id || ''), eventId = useRef(crypto.randomUUID());
  const tool = useStore(s => s.tool), penColor = useStore(s => s.penColor), penWidth = useStore(s => s.penWidth);
  const [answer, setAnswer] = useState<LearningAnswer>(null), [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null), [input, setInput] = useState<AttemptInput | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [editKey, setEditKey] = useState(false);
  const [openImage, setOpenImage] = useState(false), [everImage, setEverImage] = useState(false);
  const [displayContent, setDisplayContent] = useState(question.content);
  const [keyChanged, setKeyChanged] = useState(false);
  const [height, setHeight] = useState(400);
  const answerPanel = useRef<HTMLDivElement>(null);
  const active = useRef(true), lock = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (revealed) answerPanel.current?.scrollIntoView({ block: 'nearest' }); }, [revealed]);
  const choice = ['single_choice', 'multiple_choice'].includes(question.content.questionType);
  const automatic = choice && question.content.correctAnswer?.kind === 'choice';
  const commit = async (selfResult?: 'correct' | 'incorrect', correction = false) => {
    if (lock.current || useStore.getState().currentUser?.id !== uid) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let target = question;
      if (correction) {
        const current = await learningService.read(question.ref);
        if (!current.id || !current.revisionId) throw Error('題目目前無法使用');
        target = { ...question, ...current, id: current.id, revisionId: current.revisionId };
      }
      const graded = gradePractice(target.content, answer, selfResult);
      const payload: AttemptInput = { id: correction ? crypto.randomUUID() : eventId.current, questionId: target.id, revisionId: target.revisionId,
        sessionId, sessionItemId: question.sessionItemId, answer: graded.answer, ...(selfResult ? { selfResult } : {}),
        clientAnsweredAt: input?.clientAnsweredAt || new Date().toISOString(), clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        usedOriginalImage: everImage, ...(correction && input ? { supersedesAttemptId: input.id } : {}) };
      await practiceService.enqueue(uid, payload, target);
      if (!active.current || useStore.getState().currentUser?.id !== uid) return;
      setInput(payload); setResult(graded.result); setRevealed(true); setEditKey(false); onRecorded(graded.result);
      void syncPractice(uid).catch(() => { /* The page shows the pending event count. */ });
    } catch (e) { if (active.current) setError((e as Error).message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  const key = displayContent.correctAnswer;
  const keyLabel = !key ? '尚無正解，可先自評' : key.kind === 'text' ? key.text : key.optionIds.map(id => question.content.options.find(o => o.id === id)?.label).join('、');
  return <div className="space-y-3 pb-28">
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
      <p className="whitespace-pre-wrap text-base leading-relaxed">{question.content.ocrText}</p>
      {choice ? <fieldset disabled={revealed || busy} className="space-y-2"><legend className="sr-only">本次作答</legend>
        {question.content.options.map(o => <label key={o.id} className="flex items-start gap-3 rounded-xl border border-border-subtle p-3">
          <input type={question.content.questionType === 'single_choice' ? 'radio' : 'checkbox'} name={question.sessionItemId} className="mt-1"
            checked={answer?.kind === 'choice' && answer.optionIds.includes(o.id)} onChange={e => {
              const previous = answer?.kind === 'choice' ? answer.optionIds : [];
              setAnswer({ kind: 'choice', optionIds: question.content.questionType === 'single_choice' ? [o.id] : e.target.checked ? [...previous, o.id] : previous.filter(id => id !== o.id) });
            }} /><span className="whitespace-pre-wrap">{o.label}　{o.text}</span>
        </label>)}
      </fieldset> : <label className="block text-sm">本次答案（也可在草稿作答）<textarea disabled={revealed || busy} maxLength={16000} rows={3}
        value={answer?.kind === 'text' ? answer.text : ''} onChange={e => setAnswer(e.target.value ? { kind: 'text', text: e.target.value } : null)}
        className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3" /></label>}
      {revealed && <div ref={answerPanel} className="space-y-3 rounded-2xl bg-page-bg p-4">
        <p className="whitespace-pre-wrap text-sm">正解：{keyLabel}</p>
        {result && <p role="status">{result === 'correct' ? '這次答對' : '這次答錯'} · 已保存於本機</p>}
        {keyChanged && <p className="text-xs text-text-muted">儲存正解後，可以明確更正這次結果。過去其他作答不會重算。</p>}
      </div>}
      {error && <p role="alert" className="text-sm">{error}</p>}
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
          {!revealed ? <button type="button" disabled={busy} className={actionButton} onClick={() => automatic ? void commit() : setRevealed(true)}>{automatic ? '提交答案' : '查看答案'}</button>
            : !result ? <>
              <button type="button" disabled={busy} className={actionButton} onClick={() => void commit('correct')}>這次答對</button>
              <button type="button" disabled={busy} className={actionButton} onClick={() => void commit('incorrect')}>這次答錯</button>
            </> : <>
              <button type="button" disabled={busy} className={actionButton} onClick={() => setEditKey(true)}>{key ? '答案有誤' : '補齊正解'}</button>
              {keyChanged && <button type="button" disabled={busy} className={actionButton} onClick={() => void commit(result, true)}>依新正解更正這次</button>}
            </>}
          <button type="button" disabled={busy} className={actionButton} onClick={next}>{result ? '下一題' : '略過'}</button>
        </div>
      </div>
    </div>
    {editKey && <LearningDataDialog questionRef={question.ref} onClose={() => setEditKey(false)} onSaved={q => {
      setDisplayContent(q.content); setKeyChanged(true); setEditKey(false);
    }} />}
    {openImage && <PracticeImage url={`${API_BASE.replace(/\/api\/?$/, '')}${question.imageUrl}`} close={() => setOpenImage(false)} />}
  </div>;
}
