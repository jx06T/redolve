import { useEffect, useState } from 'react';
import { ScanText } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { LearningDataPanel } from './LearningDataPanel';
import { useStore } from '../store/useStore';
import { learningService } from '../services/learningService';
import { learningDataIssues } from '../services/learningDataIssues';
import type { LearningQuestion, PersonalQuestionRef } from '../types/learning';

export function LearningDataDialog({ questionRef, initialQuestion, onSaved, onClose, onLoaded, onErrorChange }: {
  questionRef: PersonalQuestionRef; initialQuestion?: LearningQuestion | null;
  onSaved?: (question: LearningQuestion) => void; onClose: () => void;
  onLoaded?: (question: LearningQuestion) => void; onErrorChange?: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return <AppDialog title="辨識資料與重作紀錄" busy={busy} onClose={onClose}>
    <LearningDataPanel questionRef={questionRef} initialQuestion={initialQuestion} onSaved={onSaved} onBusyChange={setBusy} onLoaded={onLoaded} onErrorChange={onErrorChange} />
  </AppDialog>;
}
export function LearningDataButton({ questionRef, active, refreshKey }: {
  questionRef: PersonalQuestionRef; active: boolean; refreshKey: string;
}) {
  const account = useStore(s => s.currentUser?.id), [open, setOpen] = useState(false);
  const [question, setQuestion] = useState<LearningQuestion | null>(null), [error, setError] = useState('');
  const kind = questionRef.kind, id = kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => { setOpen(false); setQuestion(null); setError(''); }, [account, kind, id]);
  useEffect(() => {
    if (!active || open || !account) return;
    const abort = new AbortController();
    void learningService.read(questionRef, abort.signal).then(value => { if (!abort.signal.aborted) { setQuestion(value); setError(''); } })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [account, kind, id, active, open, refreshKey]);
  const issues = question ? learningDataIssues(question) : [];
  const label = error ? `辨識資料：${error}` : issues.length ? '辨識資料：有資料缺漏' : '辨識資料';
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={label} title={label}
      className="relative rounded-xl p-2 text-text-muted transition-colors hover:bg-neutral-100 hover:text-text-main">
      <ScanText size={16} aria-hidden="true" />
      {(error || issues.length > 0) && <span data-learning-issue className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#B87474]" aria-hidden="true" />}
    </button>
    {open && <LearningDataDialog questionRef={questionRef} initialQuestion={question} onSaved={value => { setQuestion(value); setError(''); }}
      onLoaded={setQuestion} onErrorChange={setError} onClose={() => setOpen(false)} />}
  </>;
}
