import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { PracticeQuestionCard } from '../components/PracticeQuestionCard';
import { practiceService, syncPractice } from '../services/practiceService';
import type { PendingAttempt } from '../services/practiceService';
import { sharingApi } from '../services/sharingApi';
import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
import type { PracticeScope, PracticeSession } from '../types/practice';
import { practiceRefPath } from '../types/practice';
import type { AnalysisReport, AnalysisStats } from '../types/analysis';
import type { TaxonomyNode } from '../types';
const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
function flatten(nodes: TaxonomyNode[]): TaxonomyNode[] { return nodes.flatMap(n => [n, ...flatten(n.children || [])]); }

export function PracticeAnalysisView() {
  const uid = useStore(s => s.currentUser?.id), tree = useStore(s => s.taxonomies);
  const [params, setParams] = useSearchParams(), subject = params.get('subject') || '', topic = params.get('topic') || '';
  const [mode, setMode] = useState(() => window.location.hash === '#analysis' ? 'analysis' : 'practice');
  const [count, setCount] = useState(5), [archived, setArchived] = useState(false), [days, setDays] = useState(30);
  const [session, setSession] = useState<PracticeSession | null>(null), [index, setIndex] = useState(0), [results, setResults] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<AnalysisStats | null>(null), [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<{ id: string; created_at: string; days: number }[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttempt[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const abort = useRef(new AbortController()), running = useRef(false);
  const scope: PracticeScope = { subjectId: subject, ...(topic ? { topicId: topic } : {}), includeArchived: archived };
  useEffect(() => { const onHash = () => setMode(window.location.hash === '#analysis' ? 'analysis' : 'practice'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => {
    abort.current.abort(); const controller = new AbortController(); abort.current = controller;
    setSession(null); setStats(null); setReport(null); setHistory([]); setError(''); setBusy(false); running.current = false;
    return () => controller.abort();
  }, [uid, subject, topic, mode, days]);
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
  useEffect(() => {
    if (mode !== 'analysis' || !subject || !uid || import.meta.env.VITE_ANALYSIS_ENABLED !== 'true') return;
    const signal = abort.current.signal;
    void Promise.all([
      sharingApi<AnalysisStats>('/analysis/stats', 'POST', { scope, days }, signal),
      sharingApi<{ reports: typeof history; nextCursor: string | null }>(`/analysis/reports?subjectId=${encodeURIComponent(subject)}`, 'GET', undefined, signal),
    ]).then(([s, h]) => { if (!signal.aborted) { setStats(s); setHistory(h.reports); setCursor(h.nextCursor); } }).catch(e => { if (!signal.aborted) setError(e.message); });
  }, [uid, subject, topic, days, mode]);
  useEffect(() => {
    if (report?.status !== 'pending') return;
    const signal = abort.current.signal;
    const timer = window.setTimeout(() => {
      void sharingApi<AnalysisReport>(`/analysis/reports/${report.id}`, 'GET', undefined, signal)
        .then(r => { if (!signal.aborted) setReport(r); }).catch(e => { if (!signal.aborted) setError(e.message); });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [report]);
  const start = (questionIds?: string[]) => void run(async signal => {
    const next = await practiceService.start(scope, count, questionIds, signal);
    if (!signal.aborted) { setSession(next); setIndex(0); setResults({}); }
  });
  const units = flatten(tree.find(n => n.id === subject)?.children || []);
  if (!uid) return <p className="p-5">請先登入以使用個人練習與分析。</p>;
  if (import.meta.env.VITE_PRACTICE_ENABLED !== 'true') return <p className="p-5">練習功能尚未開放。</p>;
  const current = session?.questions[index];
  return <div className="mx-auto max-w-6xl space-y-5 pb-8 text-text-main">
    <div className="flex flex-wrap items-center gap-3"><h1 className="mr-auto text-xl font-semibold">個人練習與分析</h1>
      {!session && <nav aria-label="練習與分析"><a href="#practice" className={button} aria-current={mode === 'practice' ? 'page' : undefined}>練習</a>
        {import.meta.env.VITE_ANALYSIS_ENABLED === 'true' && <a href="#analysis" className={button} aria-current={mode === 'analysis' ? 'page' : undefined}>分析</a>}</nav>}
      {session && <button className={button} onClick={() => setSession(null)}>離開練習</button>}
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
      {mode === 'practice' ? <><label className="text-sm"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> 包含封存題</label><button className={button} disabled={!subject} onClick={() => start()}>開始練習</button></>
        : <label className="text-sm">作答觀察期間<select value={days} onChange={e => setDays(Number(e.target.value))} className="ml-2 rounded-xl border border-border-subtle bg-surface p-2">{ANALYSIS_PERIOD_DAYS.map(n => <option key={n} value={n}>{n} 天</option>)}</select></label>}
    </fieldset>}
    {session && (current ? <><p className="text-sm text-text-muted">第 {index + 1}／{session.questions.length} 題</p>
      <PracticeQuestionCard key={`${session.id}:${current.sessionItemId}`} question={current} sessionId={session.id} next={() => setIndex(i => i + 1)} onRecorded={result => setResults(previous => ({ ...previous, [current.sessionItemId]: result }))} />
    </> : <section className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h2 className="text-lg font-medium">{session.questions.length ? '本輪完成' : '目前沒有可抽的題目'}</h2>
      {session.questions.length ? <p className="my-4">已作答 {Object.keys(results).length} 題，答對 {Object.values(results).filter(r => r === 'correct').length} 題；略過 {session.questions.length - Object.keys(results).length} 題。</p>
        : <p className="my-4">請先確認科目，並重新辨識或人工整理題文；目前抽題僅從有限候選中選取。</p>}
      <button className={button} onClick={() => setSession(null)}>回到範圍設定</button>
    </section>)}
    {!session && mode === 'analysis' && stats && <>
      <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-medium">目前統計</h2><button disabled={busy} className={button} onClick={() => void run(async signal => {
          const r = await sharingApi<AnalysisReport>('/analysis/reports', 'POST', { scope, days }, signal); if (!signal.aborted) setReport(r);
        })}>{busy ? '處理中…' : '產生／更新分析'}</button></div>
        <p className="text-xs text-text-muted">截止 {new Date(stats.cutoff).toLocaleString()}；題庫包含較早收錄的題目。</p>
        <p>目前 {stats.questions} 題 · 期間內 {stats.attempts} 次作答{stats.attempts ? ` · 答對 ${stats.correct}／${stats.attempts}` : ' · 尚無重作紀錄'}</p>
        {!!stats.repeatedQuestions && <p className="text-sm">期間內同題重作至少兩次：{stats.repeatedQuestions} 題；首次錯、末次對 {stats.changedToCorrect} 題；首次對、末次錯 {stats.changedToIncorrect} 題。</p>}
        <details><summary className="cursor-pointer text-sm">資料組成與各單元</summary><p className="my-3 text-sm">已確認 {stats.confirmed} 題；可用題文 {stats.prepared} 題。自動判分 {stats.automatic} 次、自評 {stats.self} 次、提交前查看原圖 {stats.viewedImage} 次。</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>單元</th><th>題數</th><th>答對／作答</th></tr></thead><tbody>{stats.units.map(u => <tr key={u.id}><td className="py-2">{u.label}</td><td>{u.questions}</td><td>{u.attempts ? `${u.correct}／${u.attempts}` : '尚無作答'}</td></tr>)}</tbody></table></div>
        </details>
      </section>
      {report && <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
        <h2 className="font-medium">分析報告 · {new Date(report.createdAt).toLocaleString()}</h2>
        <p className="text-xs text-text-muted">報告範圍：{report.stats.days} 天；當時 {report.stats.questions} 題、{report.stats.attempts} 次作答、答對 {report.stats.correct} 次。解讀取樣 {report.evidence.length} 題。</p>
        {report.status === 'pending' && <p role="status">正在產生解讀…</p>}
        {report.error && <p role="alert">{report.error}</p>}
        {report.expired ? <p>詳細解讀已到期，保留報告當時的數字摘要。</p> : report.interpretation?.findings.map((f, i) => <article key={i} className="space-y-2 border-t border-border-subtle pt-4">
          <h3 className="font-medium">{f.title}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{f.explanation}</p>
          <div className="flex flex-wrap gap-2">{f.evidenceIds.map(id => { const e = report.evidence.find(e => e.id === id); return e ? <Link key={id} to={practiceRefPath(e.ref)} className="text-xs underline">{e.text.slice(0,40)}…</Link> : null; })}</div>
          <button disabled={busy} className={button} onClick={() => start(f.evidenceIds)}>練習這些題</button>
        </article>)}
        {report.status === 'complete' && !report.expired && !report.interpretation?.findings.length && <p>目前可用題文不足以提供具體解讀，可先整理辨識資料。</p>}
      </section>}
      <section className="space-y-2"><h2 className="text-sm font-medium">歷史報告</h2>{history.map(h => <button key={h.id} className={button + ' mr-2'} onClick={() => void run(async signal => { const r = await sharingApi<AnalysisReport>(`/analysis/reports/${h.id}`, 'GET', undefined, signal); if (!signal.aborted) setReport(r); })}>{new Date(h.created_at).toLocaleString()} · {h.days} 天</button>)}
        {cursor && <button disabled={busy} className={button} onClick={() => void run(async signal => { const h = await sharingApi<{ reports: typeof history; nextCursor: string | null }>(`/analysis/reports?subjectId=${encodeURIComponent(subject)}&before=${encodeURIComponent(cursor)}`, 'GET', undefined, signal); if (!signal.aborted) { setHistory(old => [...old, ...h.reports]); setCursor(h.nextCursor); } })}>更早的報告</button>}
      </section>
    </>}
  </div>;
}
