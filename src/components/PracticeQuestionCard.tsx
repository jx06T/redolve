import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Panzoom from '@panzoom/panzoom';
import type { PanzoomObject } from '@panzoom/panzoom';
import { DrawCanvas } from './DrawCanvas';
import { LearningDataPanel } from './LearningDataPanel';
import { learningService } from '../services/learningService';
import { practiceService, syncPractice } from '../services/practiceService';
import { gradePractice, practiceRefPath } from '../types/practice';
import type { AttemptInput, PracticeQuestion } from '../types/practice';
import type { LearningAnswer } from '../types/learning';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';

function PracticeImage({ url, open, close }: { url: string; open: boolean; close: () => void }) {
  const img = useRef<HTMLImageElement>(null), pan = useRef<PanzoomObject | null>(null);
  const [loaded, setLoaded] = useState(false), [scale, setScale] = useState(1.5);
  useEffect(() => {
    if (!open || !loaded || !img.current || pan.current) return;
    const p = Panzoom(img.current, { startScale: scale, minScale: 1, maxScale: 5, contain: 'outside' }); pan.current = p;
  }, [open, loaded, scale]);
  useEffect(() => () => { pan.current?.destroy(); }, []);
  useEffect(() => { if (!open) return; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [open, close]);
  return <aside hidden={!open} aria-label="原圖" className="fixed inset-3 z-40 rounded-2xl border border-border-subtle bg-surface p-4 shadow-xl lg:static lg:z-auto lg:shadow-none">
    <div className="mb-3 flex flex-wrap items-center gap-2"><span className="mr-auto text-sm">原圖（可能含答案）</span>
      <label className="text-xs">置中倍率 <select value={scale} onChange={e => { const value = Number(e.target.value); setScale(value); pan.current?.reset(); pan.current?.zoom(value, { animate: false }); }} className="rounded-xl border border-border-subtle bg-surface p-2">
        {[1.25, 1.5, 2].map(v => <option key={v} value={v}>{v} 倍</option>)}
      </select></label>
      <button className={button} onClick={() => pan.current?.zoomIn()} aria-label="放大原圖">＋</button>
      <button className={button} onClick={() => pan.current?.zoomOut()} aria-label="縮小原圖">−</button>
      <button className={button} onClick={close}>關閉原圖</button>
    </div>
    <div className="h-[70vh] overflow-hidden rounded-xl bg-page-bg" onWheel={e => pan.current?.zoomWithWheel(e.nativeEvent)}>
      <img ref={img} src={url} onLoad={() => setLoaded(true)} alt="原題圖片，可拖曳縮放" className="exam-paper-image h-full w-full object-contain" />
    </div>
  </aside>;
}
export function PracticeQuestionCard({ question, sessionId, next, onRecorded }: {
  question: PracticeQuestion; sessionId: string; next: () => void; onRecorded: (result: 'correct' | 'incorrect') => void;
}) {
  const uid = useStore(s => s.currentUser?.id || ''), eventId = useRef(crypto.randomUUID());
  const [answer, setAnswer] = useState<LearningAnswer>(null), [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null), [input, setInput] = useState<AttemptInput | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [editKey, setEditKey] = useState(false);
  const [openImage, setOpenImage] = useState(false), [everImage, setEverImage] = useState(false);
  const [displayContent, setDisplayContent] = useState(question.content);
  const [height, setHeight] = useState(400), [eraser, setEraser] = useState(false);
  const active = useRef(true), lock = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
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
  return <div className={`grid gap-4 ${openImage ? 'lg:grid-cols-2' : ''}`}>
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
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => { setOpenImage(true); setEverImage(true); }}>檢視原圖</button>
        {!revealed && <><button disabled={busy} className={button} onClick={() => automatic ? void commit() : setRevealed(true)}>{automatic ? '提交答案' : '完成作答／查看答案'}</button>
          <button disabled={busy} className={button} onClick={next}>略過</button></>}
      </div>
      {revealed && <div className="space-y-3 rounded-2xl bg-page-bg p-4">
        <p className="whitespace-pre-wrap text-sm">正解：{keyLabel}</p>
        {!result ? <div className="flex gap-2"><button disabled={busy} className={button} onClick={() => void commit('correct')}>這次答對</button><button disabled={busy} className={button} onClick={() => void commit('incorrect')}>這次答錯</button><button className={button} onClick={next}>略過</button></div>
          : <><p role="status">{result === 'correct' ? '這次答對' : '這次答錯'} · 已保存於本機</p>
            <div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={next}>下一題</button>
              <button className={button} onClick={() => setEditKey(v => !v)}>{key ? '答案有誤' : '補齊正解'}</button></div></>}
        {editKey && <><LearningDataPanel questionRef={question.ref} onSaved={q => setDisplayContent(q.content)} />
          <p className="text-xs text-text-muted">儲存正解後，可以明確更正這次結果。過去其他作答不會重算。</p>
          <button disabled={busy} className={button} onClick={() => void commit(result || undefined, true)}>依新正解更正這次</button></>}
        <Link to={practiceRefPath(question.ref)} className="inline-block text-sm underline">查看原題與重作紀錄</Link>
      </div>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      <div className="flex items-center justify-between"><span className="text-sm text-text-muted">本輪草稿（離開即清除）</span><button className={button} onPointerDown={() => setEraser(true)} onPointerUp={() => setEraser(false)} onPointerCancel={() => setEraser(false)} onPointerLeave={() => setEraser(false)}>按住擦除</button></div>
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-page-bg" style={{ height }}><DrawCanvas calcSpaceHeight={height} isEraserActive={eraser} /></div>
      <button className={button} onClick={() => setHeight(h => h + 400)}>增加草稿空間</button>
    </section>
    {everImage && <PracticeImage url={`${API_BASE.replace(/\/api\/?$/, '')}${question.imageUrl}`} open={openImage} close={() => setOpenImage(false)} />}
  </div>;
}
