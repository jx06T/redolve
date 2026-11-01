import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { PracticeQuestionCard } from '../components/PracticeQuestionCard';
import { practiceService, syncPractice } from '../services/practiceService';
import type { PendingAttempt } from '../services/practiceService';
import { analysisService } from '../services/analysisService';
import type { ReportSummary } from '../services/analysisService';
import { AnalysisStatsContent, PersonalAnalysisReport } from '../components/PersonalAnalysisReport';
import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
import type { PracticeScope, PracticeSession } from '../types/practice';
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
  const [history, setHistory] = useState<ReportSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const pollCount = useRef(0);
  const [pending, setPending] = useState<PendingAttempt[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const abort = useRef(new AbortController()), running = useRef(false);
  const scope: PracticeScope = { subjectId: subject, ...(topic ? { topicId: topic } : {}), includeArchived: archived };
  useEffect(() => { const onHash = () => setMode(window.location.hash === '#analysis' ? 'analysis' : 'practice'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => {
    abort.current.abort(); const controller = new AbortController(); abort.current = controller;
    setSession(null); setStats(null); setReport(null); setHistory([]); setCursor(null); setError(''); setBusy(false); running.current = false;
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
  const loadAnalysis = useCallback(async (signal: AbortSignal) => {
    setStatsLoading(true);
    const selectedScope = { subjectId: subject, ...(topic ? { topicId: topic } : {}) };
    const [numeric, reports] = await Promise.allSettled([
      analysisService.stats(selectedScope, days, signal), analysisService.list(selectedScope, days, undefined, signal),
    ]);
    if (signal.aborted) return;
    setStatsLoading(false);
    if (numeric.status === 'fulfilled') setStats(numeric.value); else setError(numeric.reason.message);
    if (reports.status === 'fulfilled') {
      setHistory(reports.value.reports); setCursor(reports.value.nextCursor);
      const latest = reports.value.reports[0];
      if (latest) { try { const saved = await analysisService.report(latest.id, signal); if (!signal.aborted) setReport(previous => previous || saved); }
        catch (e) { if (!signal.aborted) setError((e as Error).message); } }
    } else setError(reports.reason.message);
  }, [subject, topic, days]);
  useEffect(() => {
    if (mode !== 'analysis' || !subject || !uid || import.meta.env.VITE_ANALYSIS_ENABLED !== 'true') return;
    const signal = abort.current.signal;
    void loadAnalysis(signal);
  }, [uid, subject, topic, days, mode, refresh, loadAnalysis]);
  useEffect(() => { pollCount.current = 0; }, [report?.id]);
  useEffect(() => {
    if (report?.status !== 'pending') return;
    const signal = abort.current.signal;
    const timer = window.setTimeout(() => {
      void analysisService.status(report.id, signal).then(async status => {
        if (signal.aborted) return;
        if (status.status === 'pending') { pollCount.current++; setReport(previous => previous?.id === status.id ? { ...previous } : previous); }
        else { const complete = await analysisService.report(report.id, signal); if (!signal.aborted) setReport(previous => previous?.id === complete.id ? complete : previous); }
      }).catch(e => { if (!signal.aborted) setError(e.message); });
    }, Math.min(1500 * 2 ** Math.min(pollCount.current, 3), 8000));
    return () => window.clearTimeout(timer);
  }, [report]);
  const start = (questionIds?: string[], selectedScope = scope) => void run(async signal => {
    const next = await practiceService.start(selectedScope, count, questionIds, signal);
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
      {session && <button className={button} onClick={() => { setSession(null); setRefresh(v => v + 1); }}>離開練習</button>}
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
      <button className={button} onClick={() => { setSession(null); setRefresh(v => v + 1); }}>回到範圍設定</button>
    </section>)}
    {!session && mode === 'analysis' && subject && <>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || statsLoading} className={button} onClick={() => setRefresh(v => v + 1)}>重整統計</button>
        <button disabled={busy || statsLoading || report?.status === 'pending'} className={button} onClick={() => void run(async signal => {
          const generated = await analysisService.generate(scope, days, signal);
          if (signal.aborted) return; setReport(generated); setStats(generated.stats);
          const page = await analysisService.list(scope, days, undefined, signal);
          if (!signal.aborted) { setHistory(page.reports); setCursor(page.nextCursor); }
        })}>{busy ? '處理中…' : '產生／更新分析'}</button>
        {statsLoading && <p role="status" className="text-sm text-text-muted">載入統計與既有報告…</p>}
      </div>
      {report && <PersonalAnalysisReport report={report} busy={busy}
        onPractice={ids => start(ids, { ...report.stats.scope, includeArchived: false })}
        onReload={() => void run(async signal => { const saved = await analysisService.report(report.id, signal); if (!signal.aborted) setReport(saved); })} />}
      {!report && !statsLoading && !history.length && <p className="text-sm text-text-muted">此範圍尚無報告，可先查看統計，再手動產生分析。</p>}
      {stats && <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5" aria-label="目前統計"><h2 className="font-medium">目前統計</h2><AnalysisStatsContent stats={stats} /></section>}
      <section className="space-y-2"><h2 className="text-sm font-medium">此範圍的歷史報告</h2>{history.map(summary => <button key={summary.id} disabled={busy} className={button + ' mr-2'} onClick={() => void run(async signal => {
        const saved = await analysisService.report(summary.id, signal); if (!signal.aborted) setReport(saved);
      })}>{new Date(summary.created_at).toLocaleString()} · {summary.days} 天</button>)}
        {cursor && <button disabled={busy} className={button} onClick={() => void run(async signal => {
          const page = await analysisService.list(scope, days, cursor, signal); if (!signal.aborted) { setHistory(old => [...old, ...page.reports]); setCursor(page.nextCursor); }
        })}>更早的報告</button>}
      </section>
    </>}
  </div>;
}
