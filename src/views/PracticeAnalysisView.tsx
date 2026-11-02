import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { PracticeQuestionCard } from '../components/PracticeQuestionCard';
import { practiceService, syncPractice } from '../services/practiceService';
import type { PendingAttempt } from '../services/practiceService';
import type { PracticeScope, PracticeSession } from '../types/practice';
import type { TaxonomyNode } from '../types';
const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
function flatten(nodes: TaxonomyNode[]): TaxonomyNode[] { return nodes.flatMap(n => [n, ...flatten(n.children || [])]); }

export function PracticeAnalysisView() {
  const uid = useStore(s => s.currentUser?.id), tree = useStore(s => s.taxonomies);
  const [params, setParams] = useSearchParams(), subject = params.get('subject') || '', topic = params.get('topic') || '';
  const [count, setCount] = useState(5), [archived, setArchived] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null), [index, setIndex] = useState(0), [results, setResults] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingAttempt[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const abort = useRef(new AbortController()), running = useRef(false);
  const scope: PracticeScope = { subjectId: subject, ...(topic ? { topicId: topic } : {}), includeArchived: archived };
  useEffect(() => {
    abort.current.abort(); const controller = new AbortController(); abort.current = controller;
    setSession(null); setError(''); setBusy(false); running.current = false;
    return () => controller.abort();
  }, [uid, subject, topic]);
  useEffect(() => {
    if (!uid) return;
    let mounted = true; const load = () => { void practiceService.pending(uid).then(rows => { if (mounted) setPending(rows); }).catch(() => {}); };
    window.addEventListener('practice-outbox-changed', load); load();
    return () => { mounted = false; window.removeEventListener('practice-outbox-changed', load); };
  }, [uid]);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (running.current || !uid || useStore.getState().currentUser?.id !== uid) return;
    const signal = abort.current.signal; running.current = true; setBusy(true); setError('');
    try { await action(signal); } catch (e) { if (!signal.aborted) setError((e as Error).message); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const start = (questionIds?: string[], selectedScope = scope) => void run(async signal => {
    const next = await practiceService.start(selectedScope, count, questionIds, signal);
    if (!signal.aborted) { setSession(next); setIndex(0); setResults({}); }
  });
  const recommended = (params.get('questions') || '').split(',').filter(Boolean).slice(0, 30);
  const units = flatten(tree.find(n => n.id === subject)?.children || []);
  if (window.location.hash === '#analysis') return <Navigate replace to={subject ? '/analysis/' + encodeURIComponent(subject) : '/analysis'} />;
  if (!uid) return <p className="p-5">請先登入以使用原題練習。</p>;
  if (import.meta.env.VITE_PRACTICE_ENABLED !== 'true') return <p className="p-5">練習功能尚未開放。</p>;
  const current = session?.questions[index];
  return <div className="mx-auto max-w-6xl space-y-5 pb-8 text-text-main">
    <div className="flex flex-wrap items-center gap-3"><h1 className="mr-auto text-xl font-semibold">原題練習</h1>
      {session && <button className={button} onClick={() => { setSession(null); }}>離開練習</button>}
    </div>
    {!!pending.length && <div role="status" className="rounded-2xl border border-border-subtle bg-surface p-4 text-sm">
      本機有 {pending.length} 筆作答尚未同步；分析只包含伺服器已接收紀錄。
      <button className={button + ' ml-2'} disabled={busy} onClick={() => void run(async () => { await syncPractice(uid); })}>重試同步</button>
      {pending.filter(p => p.blocked).map(p => <p key={p.id} className="mt-2">{p.error}（作答仍保留於本機）</p>)}
    </div>}
    {error && <p role="alert" className="rounded-2xl border border-border-subtle p-4">{error}</p>}
    {!session && <fieldset disabled={busy} className="flex flex-wrap items-end gap-4 rounded-2xl border border-border-subtle bg-surface p-5">
      <label className="text-sm">科目<select value={subject} onChange={e => setParams(e.target.value ? { subject: e.target.value } : {})} className="mt-1 block rounded-xl border border-border-subtle bg-surface p-2"><option value="">請選擇科目</option>{tree.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
      {subject && <label className="text-sm">單元<select value={topic} onChange={e => setParams({ subject, ...(e.target.value ? { topic: e.target.value } : {}) })} className="mt-1 block max-w-64 rounded-xl border border-border-subtle bg-surface p-2"><option value="">全部單元</option>{units.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>}
      <label className="text-sm">每輪題數<select value={count} onChange={e => setCount(Number(e.target.value))} className="ml-2 rounded-xl border border-border-subtle bg-surface p-2">{[3,5,10].map(n => <option key={n} value={n}>{n} 題</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> 包含封存題</label><button className={button} disabled={!subject} onClick={() => start(recommended.length ? recommended : undefined)}>開始練習</button>
      {!!recommended.length && <p className="w-full text-sm text-text-muted">已帶入報告推薦的 {recommended.length} 題，將從目前仍可用的題目中抽取。<button className="ml-2 underline" onClick={() => setParams({ subject })}>改用全科抽題</button></p>}
    </fieldset>}
    {session && (current ? <><p className="text-sm text-text-muted">第 {index + 1}／{session.questions.length} 題</p>
      <PracticeQuestionCard key={`${session.id}:${current.sessionItemId}`} question={current} sessionId={session.id} next={() => setIndex(i => i + 1)} onRecorded={result => setResults(previous => ({ ...previous, [current.sessionItemId]: result }))} />
    </> : <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h2 className="text-lg font-medium">{session.questions.length ? '本輪完成' : '目前沒有可抽的題目'}</h2>
      {session.questions.length ? <p className="my-4">已作答 {Object.keys(results).length} 題，答對 {Object.values(results).filter(r => r === 'correct').length} 題；略過 {session.questions.length - Object.keys(results).length} 題。</p>
        : <p className="my-4">請先確認科目，並重新辨識或人工整理題文；目前抽題僅從有限候選中選取。</p>}
      <button className={button} onClick={() => { setSession(null); }}>回到範圍設定</button>
    </section>)}
  </div>;
}
