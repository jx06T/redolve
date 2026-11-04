import { useEffect, useState } from 'react';
import type { ErrorReason, PersonalQuestionRef } from '../types/learning';
import type { Weakness } from '../types/weakness';
import { practiceService } from '../services/practiceService';

const button = 'min-h-11 rounded-xl border border-border-subtle px-3 py-2 text-sm disabled:opacity-40';
const field = 'min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm';

export function WeaknessPicker({ questionRef, selected, onPick, attemptId, initialCandidate }: {
  questionRef: PersonalQuestionRef; selected: string[]; onPick: (item: Weakness, reason?: ErrorReason) => void; attemptId?: string; initialCandidate?: ErrorReason;
}) {
  const [catalog, setCatalog] = useState<{ subjectId: string; items: Weakness[] }>();
  const [query, setQuery] = useState(''), [notes, setNotes] = useState(''), [title, setTitle] = useState(initialCandidate?.text ?? ''), [target, setTarget] = useState(initialCandidate?.target ?? '');
  const [suggestions, setSuggestions] = useState<ErrorReason[]>([]), [proposed, setProposed] = useState(initialCandidate);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const key = questionRef.kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => {
    const controller = new AbortController();
    void practiceService.weaknesses(questionRef, controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [questionRef.kind, key]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '無法完成操作'); } finally { setBusy(false); }
  };
  const search = query.trim().normalize('NFKC').toLowerCase();
  const matches = catalog?.items.filter(item => !selected.includes(item.id) && (!search || `${item.title} ${item.target}`.normalize('NFKC').toLowerCase().includes(search))) ?? [];
  return <div className="space-y-3 rounded-xl border border-border-subtle p-3">
    <label className="block text-sm">搜尋既有弱點<input className={field} value={query} onChange={e => setQuery(e.target.value)} /></label>
    {!catalog && !error && <p role="status" className="text-sm text-text-muted">載入弱點清單…</p>}
    {catalog && <div className="max-h-60 space-y-1 overflow-y-auto">{matches.length ? matches.map(item => <button type="button" key={item.id} disabled={busy}
      className="block min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary/5" onClick={() => onPick(item)}>
      {item.title}<span className="block text-xs text-text-muted">{item.target}</span></button>) : <p className="text-sm text-text-muted">沒有符合的弱點。</p>}</div>}
    {catalog && <details open={initialCandidate ? true : undefined}><summary className="cursor-pointer py-2 text-sm">讓 AI 再建議或自行新增</summary><div className="space-y-3">
      <label className="block text-sm">補充卡住的步驟（選填）<input className={field} value={notes} maxLength={600} onChange={e => setNotes(e.target.value)} /></label>
      <button type="button" className={button} disabled={busy} onClick={() => void run(async () => {
        const { items } = await practiceService.suggestWeaknesses(questionRef, notes, selected, attemptId);
        setSuggestions(items.filter(item => !item.weaknessId || !selected.includes(item.weaknessId)));
        if (!items.length) setStatus('現有資料不足，暫無其他建議。');
      })}>讓 AI 再建議</button>
      {suggestions.map(reason => <div key={reason.weaknessId || reason.text} className="space-y-1 rounded-xl bg-page-bg p-2 text-sm">
        <button type="button" className={button} disabled={busy || !!reason.weaknessId && selected.includes(reason.weaknessId)} onClick={() => {
          const item = catalog.items.find(item => item.id === reason.weaknessId);
          if (item) onPick(item, reason);
          else { setTitle(reason.text); setTarget(reason.target || ''); setProposed(reason); }
        }}>{reason.text}</button>
        <p className="text-xs text-text-muted">{reason.basis === 'inferred_from_context' ? '情境推測 · 待確認' : 'AI 整理 · 待確認'}{reason.clue && ` · ${reason.clue}`}</p>
      </div>)}
      <label className="block text-sm">弱點名稱<input className={field} value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block text-sm">要驗證的動作<input className={field} value={target} maxLength={240} onChange={e => setTarget(e.target.value)} /></label>
      <button type="button" className={button} disabled={busy || !title.trim() || !target.trim()} onClick={() => void run(async () => {
        const item = await practiceService.createWeakness(catalog.subjectId, title, target);
        setCatalog({ ...catalog, items: [item, ...catalog.items.filter(entry => entry.id !== item.id)] });
        onPick(item, proposed); setProposed(undefined); setTitle(''); setTarget('');
      })}>新增並選擇</button>
    </div></details>}
    {busy && <p role="status" className="text-sm text-text-muted">處理中…</p>}
    {status && <p role="status" className="text-sm text-text-muted">{status}</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </div>;
}
