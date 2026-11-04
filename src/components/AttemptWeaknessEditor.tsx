import { useState } from 'react';
import { useStore } from '../store/useStore';
import { practiceService, syncPractice } from '../services/practiceService';
import type { ErrorReason, PersonalQuestionRef } from '../types/learning';
import type { Weakness, WeaknessReview } from '../types/weakness';
import { WeaknessPicker } from './WeaknessPicker';

const button = 'min-h-11 rounded-xl border border-border-subtle px-3 py-2 text-sm disabled:opacity-40';

export function AttemptWeaknessEditor({ attemptId, questionRef, reasons = [], initial }: {
  attemptId: string; questionRef: PersonalQuestionRef; reasons?: ErrorReason[]; initial?: WeaknessReview;
}) {
  const uid = useStore(s => s.currentUser?.id);
  const [review, setReview] = useState(initial), [selected, setSelected] = useState(initial?.ids ?? []);
  const [extra, setExtra] = useState<Weakness[]>([]), [catalog, setCatalog] = useState<Weakness[]>([]);
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const candidates = new Map(reasons.flatMap(reason => reason.weaknessId ? [[reason.weaknessId, { id: reason.weaknessId, title: reason.text }] as const] : []));
  for (const item of [...catalog.filter(item => selected.includes(item.id) || review?.ids.includes(item.id)), ...extra]) candidates.set(item.id, item);
  const load = async () => {
    if (busy || !uid) return;
    setBusy(true); setError('');
    try {
      await syncPractice(uid);
      const [stored, available] = await Promise.all([practiceService.weaknessReview(attemptId), practiceService.weaknesses(questionRef)]);
      setCatalog(available.items); setReview(stored); setSelected(stored.ids);
    } catch (e) { setError(e instanceof Error ? e.message : '無法載入弱點'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!uid || !review || busy) return;
    if (!navigator.onLine) { setError('連線後即可儲存標記。也可稍後從重作紀錄補記。'); return; }
    setBusy(true); setStatus(''); setError('');
    try {
      await syncPractice(uid);
      const saved = await practiceService.saveWeaknessReview(uid, attemptId, { ids: selected, version: review.version });
      setReview(saved); setSelected(saved.ids); setStatus(saved.ids.length ? '已保存這次確認的弱點。' : '已取消這次的弱點標記。');
    } catch (e) { setError(e instanceof Error ? e.message : '無法保存弱點'); }
    finally { setBusy(false); }
  };
  const changed = selected.length !== review?.ids.length || selected.some(id => !review?.ids.includes(id));
  return <div className="space-y-2 border-t border-border-subtle pt-3">
    {!review ? <button type="button" className={button} disabled={busy} onClick={() => void load()}>確認本次弱點</button> : <>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-medium">這次有遇到哪些問題？</legend>
        {[...candidates.values()].map(item => <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 12}
            onChange={e => setSelected(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} />{item.title}
        </label>)}
        <button type="button" className={button} aria-expanded={open} onClick={() => setOpen(value => !value)}>選擇其他弱點</button>
        {open && <WeaknessPicker questionRef={questionRef} selected={selected} attemptId={attemptId} onPick={item => {
          if (selected.length >= 12) return;
          setExtra(old => [...old.filter(entry => entry.id !== item.id), item]);
          setSelected(old => old.includes(item.id) ? old : [...old, item.id]);
        }} />}
      </fieldset>
      <button type="button" className={button} disabled={busy || !changed} onClick={() => void save()}>儲存本次標記</button>
    </>}
    {busy && <p role="status" className="text-sm text-text-muted">處理中…</p>}
    {status && <p role="status" className="text-sm text-text-muted">{status}</p>}
    {error && <div role="alert" className="text-sm"><p>{error}</p>{review && <button type="button" className={button} disabled={busy} onClick={() => void load()}>重新載入標記</button>}</div>}
  </div>;
}
