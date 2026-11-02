import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { analysisService } from '../services/analysisService';
import type { ReportSummary } from '../services/analysisService';
import type { AnalysisReport, AnalysisStats, AnalysisSubjectSummary } from '../types/analysis';
import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
import { AnalysisStatsContent, PersonalAnalysisReport } from '../components/PersonalAnalysisReport';
import { AnalysisConversation } from '../components/AnalysisConversation';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
function Period({ value, change }: { value: number; change: (days: number) => void }) {
  return <label className="flex items-center gap-2 text-sm text-text-muted">作答觀察期間<select className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-text-main" value={value} onChange={e => change(Number(e.target.value))}>{ANALYSIS_PERIOD_DAYS.map(d => <option key={d} value={d}>近 {d} 天</option>)}</select></label>;
}
export function AnalysisView() {
  const uid = useStore(s => s.currentUser?.id), { subjectId } = useParams();
  if (!uid) return <p className="p-5">請先登入以查看個人分析。</p>;
  if (import.meta.env.VITE_ANALYSIS_ENABLED !== 'true') return <p className="p-5">分析功能尚未開放。</p>;
  return <div className="mx-auto max-w-5xl space-y-6 pb-12 text-text-main">{subjectId ? <SubjectAnalysis key={uid + ':' + subjectId} uid={uid} subjectId={subjectId} /> : <AnalysisOverview key={uid} />}</div>;
}
function AnalysisOverview() {
  const [params, setParams] = useSearchParams(), days = ANALYSIS_PERIOD_DAYS.find(d => String(d) === params.get('days')) || 30;
  const [subjects, setSubjects] = useState<AnalysisSubjectSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void analysisService.overview(days, controller.signal).then(data => { if (!controller.signal.aborted) setSubjects(data.subjects); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days]);
  return <>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm text-text-muted">個人學習</p><h1 className="text-2xl font-semibold">各科分析</h1><p className="mt-3 text-sm text-text-muted">從整科看複習狀況，再一起找出下一步。</p></div><Period value={days} change={d => setParams({ days: String(d) })} /></header>
    <p className="text-xs text-text-muted">題數包含目前持有的上傳與存入題；期間僅限制作答紀錄。點進科目後，可手動產生報告。</p>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">載入各科統計…</p> : <div className="grid gap-4 sm:grid-cols-2">{subjects.map(subject => <Link key={subject.id} to={`/analysis/${encodeURIComponent(subject.id)}?days=${days}`} className="group rounded-3xl border border-border-subtle bg-surface p-5 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800/50">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">{subject.label}</h2><ArrowRight size={18} className="text-text-muted" /></div>
      <dl className="my-5 grid grid-cols-3 gap-2"><div><dt className="text-xs text-text-muted">個人題目</dt><dd className="mt-2 text-2xl font-medium">{subject.questions}</dd></div><div><dt className="text-xs text-text-muted">近 {days} 天作答</dt><dd className="mt-2 text-2xl font-medium">{subject.attempts}</dd></div><div><dt className="text-xs text-text-muted">重作答對</dt><dd className="mt-2 text-lg font-medium">{subject.attempts ? `${subject.correct}／${subject.attempts}` : '—'}</dd></div></dl>
      <p className="text-xs text-text-muted">可用題文 {subject.prepared} 題 · 已確認 {subject.confirmed} 題</p>
      <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-muted">{subject.latestReport ? `最近報告 ${new Date(subject.latestReport.createdAt).toLocaleString()}` : '尚無報告，進入科目開始分析'}</p>
    </Link>)}</div>}
    {!loading && !subjects.length && <p>尚無科目，請先建立分類並收錄題目。</p>}
  </>;
}
function SubjectAnalysis({ uid, subjectId }: { uid: string; subjectId: string }) {
  const navigate = useNavigate();
  const label = useStore(s => s.taxonomies.find(n => n.id === subjectId)?.label) || '科目';
  const [params, setParams] = useSearchParams(), days = ANALYSIS_PERIOD_DAYS.find(d => String(d) === params.get('days')) || 30;
  const [history, setHistory] = useState<ReportSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null), [stats, setStats] = useState<AnalysisStats | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(new AbortController()), running = useRef(false);
  const selected = params.get('report') || history[0]?.id || '', active = useRef(selected); active.current = selected;
  useEffect(() => { const next = new AbortController(); controller.current = next; return () => next.abort(); }, []);
  useEffect(() => {
    const next = new AbortController(); setStats(null);
    void analysisService.stats({ subjectId }, days, next.signal).then(value => { if (!next.signal.aborted) setStats(value); }).catch(e => { if (!next.signal.aborted) setError(e.message); });
    return () => next.abort();
  }, [subjectId, days]);
  useEffect(() => {
    const signal = controller.current.signal;
    void analysisService.list({ subjectId }, undefined, undefined, signal).then(page => { if (!signal.aborted) { setHistory(page.reports); setCursor(page.nextCursor); setLoading(false); } }).catch(e => { if (!signal.aborted) { setError(e.message); setLoading(false); } });
  }, [subjectId]);
  useEffect(() => {
    if (!selected) { setReport(null); return; }
    const next = new AbortController(); setReport(null); setLoading(true);
    void analysisService.report(selected, next.signal).then(value => { if (!next.signal.aborted) {
      if (value.stats.scope.subjectId !== subjectId || value.stats.scope.topicId) throw Error('這份報告不屬於此科的整科分析');
      setReport(previous => previous?.id === value.id && previous.status === 'complete' && value.status === 'pending' ? previous : value);
    } }).catch(e => { if (!next.signal.aborted) setError(e.message); }).finally(() => { if (!next.signal.aborted) setLoading(false); });
    return () => next.abort();
  }, [selected, subjectId]);
  useEffect(() => {
    if (report?.status !== 'pending' || busy) return;
    const next = new AbortController();
    const timer = window.setTimeout(() => { void analysisService.report(report.id, next.signal).then(value => { if (!next.signal.aborted && active.current === value.id) setReport(value); }).catch(e => { if (!next.signal.aborted) setError(e.message); }); }, 8000);
    return () => { clearTimeout(timer); next.abort(); };
  }, [report, busy]);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (running.current || useStore.getState().currentUser?.id !== uid) return;
    const signal = controller.current.signal; running.current = true; setBusy(true); setError('');
    try { await action(signal); } catch (e) { if (!signal.aborted) setError((e as Error).message); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const choose = (id: string) => { setError(''); setParams(previous => { previous.set('report', id); return previous; }); };
  const position = history.findIndex(h => h.id === selected);
  const completeRun = async (id: string, signal: AbortSignal) => {
    const finished = await analysisService.run(id, signal);
    if (!signal.aborted && active.current === id) setReport(finished);
    const page = await analysisService.list({ subjectId }, undefined, undefined, signal);
    if (!signal.aborted) { setHistory(page.reports); setCursor(page.nextCursor); }
  };
  return <>
    <header className="space-y-5"><Link to="/analysis" className="inline-flex min-h-11 items-center gap-2 text-sm text-text-muted"><ArrowLeft size={16} />各科分析</Link>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">{label} · 整科分析</h1><p className="mt-3 text-sm text-text-muted">綜合題庫內容、重作紀錄與前期變化，保留每一次觀察。</p></div>
        <div className="flex flex-wrap gap-3"><Period value={days} change={d => setParams(previous => { previous.set('days', String(d)); return previous; })} /><button className={button + ' bg-primary/10'} disabled={busy || !stats || report?.status === 'pending'} onClick={() => void run(async signal => {
          const created = await analysisService.generate({ subjectId }, days, signal); if (signal.aborted) return;
          active.current = created.id; choose(created.id); setReport(created);
          if (created.status === 'pending') await completeRun(created.id, signal);
          else { const page = await analysisService.list({ subjectId }, undefined, undefined, signal); if (!signal.aborted) { setHistory(page.reports); setCursor(page.nextCursor); } }
        })}><Sparkles size={16} />{busy ? '處理中…' : '產生整科報告'}</button></div>
      </div>
      <p className="text-xs text-text-muted">期間只限制作答；題庫包含更早收錄的題目。更換期間不會改寫下方的歷史報告。</p>
    </header>
    {error && <p role="alert" className="rounded-2xl border border-border-subtle bg-surface p-4">{error}</p>}
    {!!history.length && <nav aria-label="歷次分析" className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-subtle bg-surface p-3">
      <span className="mr-2 text-sm text-text-muted">歷次報告</span><button aria-label="較新的報告" className={button} disabled={busy || position <= 0} onClick={() => choose(history[position - 1].id)}><ChevronLeft size={16} /></button>
      <label className="min-w-0 flex-1"><span className="sr-only">選擇報告時間</span><select value={selected} disabled={busy} className="min-h-11 w-full rounded-xl bg-surface px-2 text-sm" onChange={e => choose(e.target.value)}>{!history.some(h => h.id === selected) && selected && <option value={selected}>目前選取的報告</option>}{history.map((h, i) => <option key={h.id} value={h.id}>{new Date(h.created_at).toLocaleString()} · {h.days} 天{!i ? ' · 最新' : ''}</option>)}</select></label>
      <button aria-label="較早的報告" className={button} disabled={busy || position < 0 || position >= history.length - 1} onClick={() => choose(history[position + 1].id)}><ChevronRight size={16} /></button>
      {cursor && <button className={button} disabled={busy} onClick={() => void run(async signal => { const page = await analysisService.list({ subjectId }, undefined, cursor, signal); if (!signal.aborted) { setHistory(old => [...old, ...page.reports]); setCursor(page.nextCursor); } })}>載入更早報告</button>}
    </nav>}
    {loading && <p role="status">載入報告…</p>}
    {report && <><PersonalAnalysisReport report={report} busy={busy} onPractice={ids => { navigate(`/practice?subject=${encodeURIComponent(subjectId)}&questions=${encodeURIComponent(ids.join(','))}`); }} onReload={() => void run(async signal => {
      if (report.status === 'pending') await completeRun(report.id, signal);
      else { const value = await analysisService.report(report.id, signal); if (!signal.aborted && active.current === value.id) setReport(value); }
    })} />{report.status === 'complete' && !report.expired && <AnalysisConversation key={uid + ':' + report.id} report={report} />}</>}
    {!report && !loading && <section className="rounded-3xl border border-border-subtle bg-surface p-6"><h2 className="font-medium">從第一份整科報告開始</h2><p className="mt-3 text-sm text-text-muted">上方選擇作答觀察期間，再按「產生整科報告」。AI 會綜合全科統計，引用相關原題說明依據。</p></section>}
    {stats && <details className="rounded-2xl border border-border-subtle bg-surface p-5"><summary className="cursor-pointer font-medium">目前統計 · 近 {days} 天作答</summary><div className="mt-5"><AnalysisStatsContent stats={stats} /></div></details>}
  </>;
}
