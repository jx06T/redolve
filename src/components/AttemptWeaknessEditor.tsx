import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { practiceService, syncPractice } from '../services/practiceService';
import type { AttemptReasonCandidate, WeaknessReview } from '../types/weakness';
import { RichText } from './RichText';

const button = 'min-h-11 rounded-xl border border-border-subtle px-3 py-2 text-sm disabled:opacity-40';

export function AttemptWeaknessEditor({ attemptId, autoLoad = false }: { attemptId: string; autoLoad?: boolean }) {
  const uid = useStore(s => s.currentUser?.id);
  const [review, setReview] = useState<WeaknessReview>(), [selected, setSelected] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<AttemptReasonCandidate[]>([]);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!uid) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await syncPractice(uid);
      if (signal?.aborted) return;
      const stored = await practiceService.weaknessReview(attemptId, signal);
      if (signal?.aborted) return;
      setCandidates(stored.candidates); setReview(stored); setSelected(stored.ids);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : '無法載入原題錯因'); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [attemptId, uid]);
  useEffect(() => {
    if (!autoLoad) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [autoLoad, load]);
  const save = async () => {
    if (!uid || !review || busy) return;
    if (!navigator.onLine) { setError('連線後即可儲存標記。也可稍後從重作紀錄補記。'); return; }
    setBusy(true); setStatus(''); setError('');
    try {
      const saved = await practiceService.saveWeaknessReview(uid, attemptId, { ids: selected, version: review.version });
      setReview(saved); setSelected(saved.ids); setStatus('已儲存本次錯因標記。');
    } catch (e) { setError(e instanceof Error ? e.message : '無法儲存錯因'); }
    finally { setBusy(false); }
  };
  const changed = selected.length !== review?.ids.length || selected.some(id => !review?.ids.includes(id));
  return <div className="space-y-2 border-t border-border-subtle pt-3">
    {!review && (!autoLoad || error) && <button type="button" className={button} disabled={busy} onClick={() => void load()}>載入原題錯因</button>}
    {review && (candidates.length ? <>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-medium">這次也遇到哪些錯因？</legend>
        <p className="text-xs text-text-muted">沿用原題的 AI 建議，請勾選本次確實遇到的錯因。</p>
        {candidates.map(item => <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 12}
            onChange={e => setSelected(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} />
          <span className="min-w-0 wrap-break-word"><RichText inline text={item.text} /></span>
        </label>)}
      </fieldset>
      <button type="button" className={button} disabled={busy || !changed} onClick={() => void save()}>儲存本次標記</button>
    </> : <p className="text-sm text-text-muted">原題沒有 AI 錯因建議，可直接略過。</p>)}
    {busy && <p role="status" className="text-sm text-text-muted">處理中…</p>}
    {status && <p role="status" className="text-sm text-text-muted">{status}</p>}
    {error && <div role="alert" className="text-sm"><p>{error}</p>{review && <button type="button" className={button} disabled={busy} onClick={() => void load()}>重新載入標記</button>}</div>}
  </div>;
}
