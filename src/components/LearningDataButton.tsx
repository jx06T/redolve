import { useEffect, useState } from 'react';
import { ScanText } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { LearningDataPanel } from './LearningDataPanel';
import { useStore } from '../store/useStore';
import { learningService } from '../services/learningService';
import { learningDataIssues } from '../services/learningDataIssues';
import type { LearningQuestion, PersonalQuestionRef } from '../types/learning';
import { pendingCorrection, cancelCorrection, retryCorrection } from '../services/correctionService';
import type { CorrectionTask } from '../services/correctionService';

export function LearningDataDialog({ questionRef, initialQuestion, onSaved, onClose, onLoaded, onErrorChange, onRecognize }: {
  questionRef: PersonalQuestionRef; initialQuestion?: LearningQuestion | null;
  onSaved?: (question: LearningQuestion) => void; onClose: () => void;
  onLoaded?: (question: LearningQuestion) => void; onErrorChange?: (error: string) => void;
  onRecognize?: () => Promise<LearningQuestion>;
}) {
  const [busy, setBusy] = useState(false);
  return <AppDialog title="辨識資料與重作紀錄" busy={busy} onClose={onClose}>
    <LearningDataPanel questionRef={questionRef} initialQuestion={initialQuestion} onSaved={onSaved} onBusyChange={setBusy} onLoaded={onLoaded} onErrorChange={onErrorChange} onRecognize={onRecognize} />
  </AppDialog>;
}
export function LearningDataButton({ questionRef, active, refreshKey, corrected, onRecognize }: {
  questionRef: PersonalQuestionRef; active: boolean; refreshKey: string;
  corrected: boolean; onRecognize: () => Promise<LearningQuestion>;
}) {
  const account = useStore(s => s.currentUser?.id), [open, setOpen] = useState(false);
  const [question, setQuestion] = useState<LearningQuestion | null>(null), [error, setError] = useState('');
  const [task, setTask] = useState<CorrectionTask | undefined>();
  const kind = questionRef.kind, id = kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => { setOpen(false); setQuestion(null); setError(''); }, [account, kind, id]);
  useEffect(() => {
    if (!active || !corrected || !account) return;
    const abort = new AbortController();
    const update = () => {
      void pendingCorrection(account, questionRef).then(value => { if (!abort.signal.aborted) setTask(value); }).catch(() => {});
      if (!open) void learningService.read(questionRef, abort.signal).then(value => { if (!abort.signal.aborted) { setQuestion(value); setError(''); } })
        .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    };
    update(); window.addEventListener('redolve:corrections', update);
    return () => { abort.abort(); window.removeEventListener('redolve:corrections', update); };
  }, [account, kind, id, active, open, refreshKey, corrected]);
  useEffect(() => { if (!corrected) setOpen(false); }, [corrected]);
  const issues = question ? learningDataIssues(question) : [];
  const candidate = question?.correction, pendingResult = candidate && !candidate.adopted && !candidate.stale;
  const label = !corrected ? '完成訂正後，AI 將協助整理答案與錯因' : task?.state === 'sending' || candidate?.status === 'pending' ? 'AI 正在整理訂正' : error ? `辨識資料：${error}` : task?.error || pendingResult || issues.length ? '訂正整理：待確認或可重試' : '辨識資料';
  return <>
    <button type="button" disabled={!corrected} onClick={() => setOpen(true)} aria-label={label} title={label}
      className="relative rounded-xl p-2 text-text-muted transition-colors hover:bg-neutral-100 hover:text-text-main disabled:opacity-40">
      <ScanText size={16} aria-hidden="true" />
      {corrected && (error || task || pendingResult || issues.length > 0) && <span data-learning-issue className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#B87474]" aria-hidden="true" />}
    </button>
    {open && <LearningDataDialog questionRef={questionRef} initialQuestion={question} onSaved={value => { setQuestion(value); setError(''); if (account) void cancelCorrection(account, questionRef).catch(() => {}); }}
      onRecognize={async () => {
        if (task?.state === 'sending') throw Error('AI 正在整理，可稍後再開啟');
        if (task?.state === 'queued' && account) { await retryCorrection(account, questionRef); return learningService.read(questionRef); }
        if (candidate?.status === 'pending') throw Error('AI 正在整理，可稍後再開啟');
        return onRecognize();
      }}
      onLoaded={setQuestion} onErrorChange={setError} onClose={() => setOpen(false)} />}
  </>;
}
