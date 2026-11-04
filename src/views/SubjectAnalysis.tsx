import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { analysisService } from '../services/analysisService';
import type { ReportSummary } from '../services/analysisService';
import type { AnalysisEligibility, AnalysisReport, AnalysisStats } from '../types/analysis';
import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
import { AnalysisStatsContent, AnalysisStatsSummary, PersonalAnalysisReport } from '../components/PersonalAnalysisReport';
import { AnalysisConversation } from '../components/AnalysisConversation';
import { AnalysisPeriod } from '../components/AnalysisPeriod';
import { WeaknessTrends } from '../components/WeaknessTrends';

const control = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-40';
const button = control + ' border-border-subtle bg-surface';
const historyArrow = 'inline-flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-surface disabled:opacity-40';
const primaryButton = control + ' border-primary/30 bg-primary/10 text-primary-600 dark:text-primary-300';
function eligibilityText(value: AnalysisEligibility) {
  switch (value.reason) {
    case 'first': return '第一份報告會整理目前全科資料，建立之後比較的基準。';
    case 'ready': return '已有實質新資料，可以總結自上份報告後的變化。';
    case 'cooldown': return `已有新資料；下次可總結：${new Date(value.availableAt!).toLocaleString()}。`;
    case 'no_changes': return value.latestReportId ? '尚無實質新資料，可以繼續閱讀上一份報告或追問。' : '尚無實質新資料，可先繼續複習，累積新紀錄後再總結。';
    case 'no_questions': return '請先整理至少一道有題文的題目，再建立學習基準。';
    case 'in_progress': return '一份報告正在處理中，可開啟查看進度。';
    case 'retry': return '上份處理未完成，可沿用原快照重試；失敗不會重新計算三天間隔。';
  }
}

export function SubjectAnalysis({ uid, subjectId }: { uid: string; subjectId: string }) {
  const navigate = useNavigate(), location = useLocation();
  const label = useStore(s => s.taxonomies.find(n => n.id === subjectId)?.label) || '科目';
  const [params] = useSearchParams();
  const tab = location.hash === '#reports' ? 'reports' : location.hash === '#latest' ? 'latest' : params.has('report') ? 'reports' : 'latest';
  useEffect(() => {
    if (!['#latest', '#reports'].includes(location.hash)) navigate({ pathname: location.pathname, search: location.search, hash: '#' + tab }, { replace: true });
  }, [location.hash, location.pathname, location.search, tab, navigate]);
  const days = ANALYSIS_PERIOD_DAYS.find(d => String(d) === params.get('days')) || 30;
  const [history, setHistory] = useState<ReportSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null), [stats, setStats] = useState<AnalysisStats | null>(null);
  const [eligibility, setEligibility] = useState<AnalysisEligibility | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(new AbortController()), running = useRef(false);
  const selected = params.get('report') || history[0]?.id || '', active = useRef(selected); active.current = selected;
  useEffect(() => { const next = new AbortController(); controller.current = next; return () => next.abort(); }, []);
  useEffect(() => {
    if (tab !== 'latest') return;
    const next = new AbortController(); setStats(null); setLoading(true); setError('');
    void analysisService.stats({ subjectId }, days, next.signal).then(value => { if (!next.signal.aborted) setStats(value); })
      .catch(e => { if (!next.signal.aborted) setError(e.message); }).finally(() => { if (!next.signal.aborted) setLoading(false); });
    return () => next.abort();
  }, [subjectId, days, tab]);
  useEffect(() => {
    if (tab !== 'reports') return;
    const next = new AbortController(); setLoading(true); setError('');
    void Promise.allSettled([analysisService.list({ subjectId }, undefined, undefined, next.signal), analysisService.eligibility(subjectId, next.signal)])
      .then(([page, status]) => { if (!next.signal.aborted) {
        if (page.status === 'fulfilled') { setHistory(page.value.reports); setCursor(page.value.nextCursor); } else setError(page.reason.message);
        if (status.status === 'fulfilled') setEligibility(status.value); else { setEligibility(null); setError('無法檢查生成條件：' + status.reason.message); }
      } })
      .catch(e => { if (!next.signal.aborted) setError(e.message); }).finally(() => { if (!next.signal.aborted) setLoading(false); });
    return () => next.abort();
  }, [subjectId, tab]);
  useEffect(() => {
    if (tab !== 'reports' || !selected) { setReport(null); return; }
    const next = new AbortController(); setReport(null); setLoading(true);
    void analysisService.report(selected, next.signal).then(value => { if (!next.signal.aborted) {
      if (value.stats.scope.subjectId !== subjectId || value.stats.scope.topicId) throw Error('這份報告不屬於此科的整科分析');
      setReport(previous => previous?.id === value.id && previous.status === 'complete' && value.status === 'pending' ? previous : value);
    } }).catch(e => { if (!next.signal.aborted) setError(e.message); }).finally(() => { if (!next.signal.aborted) setLoading(false); });
    return () => next.abort();
  }, [selected, subjectId, tab]);
  useEffect(() => {
    if (tab !== 'reports' || report?.status !== 'pending' || busy) return;
    const next = new AbortController();
    const timer = window.setTimeout(() => { void analysisService.report(report.id, next.signal).then(async value => {
      if (!next.signal.aborted && active.current === value.id) {
        setReport(value);
        if (value.status === 'complete') setEligibility(await analysisService.eligibility(subjectId, next.signal));
      }
    }).catch(e => { if (!next.signal.aborted) setError(e.message); }); }, 8000);
    return () => { clearTimeout(timer); next.abort(); };
  }, [report, busy, tab, subjectId]);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (running.current || useStore.getState().currentUser?.id !== uid) return;
    const signal = controller.current.signal; running.current = true; setBusy(true); setError('');
    try { await action(signal); } catch (e) { if (!signal.aborted) setError((e as Error).message); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  };
  const choose = (id: string) => { setError(''); const next = new URLSearchParams(params); next.set('report', id); navigate({ search: '?' + next, hash: '#reports' }, { replace: true }); };
  const refresh = async (signal: AbortSignal) => {
    const [page, status] = await Promise.allSettled([analysisService.list({ subjectId }, undefined, undefined, signal), analysisService.eligibility(subjectId, signal)]);
    if (!signal.aborted) {
      if (page.status === 'fulfilled') { setHistory(page.value.reports); setCursor(page.value.nextCursor); }
      if (status.status === 'fulfilled') setEligibility(status.value); else setEligibility(null);
      if (page.status === 'rejected') throw page.reason;
      if (status.status === 'rejected') throw status.reason;
    }
  };
  const completeRun = async (id: string, signal: AbortSignal) => {
    const finished = await analysisService.run(id, signal);
    if (!signal.aborted && active.current === id) setReport(finished);
    await refresh(signal);
  };
  const position = history.findIndex(h => h.id === selected);
  return <>
    <header className="space-y-5"><Link to="/analysis" className="inline-flex min-h-11 items-center gap-2 text-sm text-text-muted"><ArrowLeft size={16} />各科分析</Link>
      <div><h1 className="text-2xl font-semibold">{label} · 整科分析</h1><p className="mt-3 text-sm text-text-muted">查看最新複習狀況，或回顧每個階段的學習總結。</p></div>
      <nav aria-label="分析內容" className="flex gap-2 border-b border-border-subtle">{([['latest', '最新'], ['reports', '分析報告']] as const).map(([value, title]) => <Link key={value} aria-current={tab === value ? 'page' : undefined} replace to={{ search: location.search, hash: '#' + value }} className={`min-h-11 border-b-2 px-5 py-3 text-sm ${tab === value ? 'border-primary text-primary-600 dark:text-primary-300' : 'border-transparent text-text-muted'}`}>{title}</Link>)}</nav>
    </header>
    {error && <p role="alert" className="rounded-2xl border border-border-subtle bg-surface p-4">{error}</p>}
    {tab === 'latest' ? <section aria-label="最新統計" className="space-y-6 rounded-3xl border border-border-subtle bg-surface p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold">最新統計</h2><AnalysisPeriod value={days} change={d => { const next = new URLSearchParams(params); next.set('days', String(d)); navigate({ search: '?' + next, hash: '#latest' }, { replace: true }); }} /></div>
      <p className="text-sm leading-7 text-text-muted">題庫總數是目前持有的所有題目；上方篩選僅限制作答紀錄。這裡不會呼叫 AI。</p>
      {loading ? <p role="status">載入統計…</p> : stats && <><AnalysisStatsSummary stats={stats} /><AnalysisStatsContent stats={stats} showComparison={false} /></>}
      <WeaknessTrends subjectId={subjectId} days={days} />
    </section> : <>
      <section aria-label="產生階段總結" className="space-y-3 rounded-2xl bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">階段總結</h2><button className={primaryButton} disabled={busy || !eligibility?.canGenerate} onClick={() => void run(async signal => {
          try {
            const created = await analysisService.generate({ subjectId }, signal); if (signal.aborted) return;
            active.current = created.id; choose(created.id); setReport(created);
            if (created.status !== 'complete' && !created.expired) await completeRun(created.id, signal); else await refresh(signal);
          } catch (e) { await refresh(signal); throw e; }
        })}><Sparkles size={16} />{busy ? '處理中…' : eligibility?.reason === 'retry' ? '重試階段總結' : eligibility?.reason === 'first' ? '建立首次基準' : '產生階段總結'}</button></div>
        <p className="text-sm leading-7 text-text-muted">{eligibility ? eligibilityText(eligibility) : loading ? '正在檢查生成條件…' : '生成條件尚未取得，可以按「重新檢查」；既有報告仍可閱讀。'}</p>
        {eligibility?.baselineCutoff && <p className="text-xs leading-6 text-text-muted">自 {new Date(eligibility.baselineCutoff).toLocaleString()}：新增 {eligibility.changes.newQuestions} 題、更新 {eligibility.changes.updatedQuestions} 題、新作答 {eligibility.changes.newAttempts} 次、結果更正 {eligibility.changes.correctedAttempts} 次{eligibility.changes.reviewedAttempts ? `、弱點標記變更 ${eligibility.changes.reviewedAttempts} 筆` : ''}。</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted"><span>成功完成後至少間隔 3 天，並累積實質新資料；報告不受「最新」的天數篩選影響。</span><button className="min-h-11 underline decoration-border-subtle underline-offset-4" disabled={busy} onClick={() => void run(refresh)}>重新檢查</button>{eligibility?.activeReportId && eligibility.activeReportId !== selected && <button className="min-h-11 underline underline-offset-4" onClick={() => choose(eligibility.activeReportId!)}>開啟處理中的報告</button>}</div>
      </section>
      {!!history.length && <nav aria-label="歷次分析" className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-2xl border border-border-subtle bg-surface p-3 sm:grid-cols-[auto_2.75rem_minmax(0,1fr)_2.75rem]">
        <span className="col-span-full text-sm text-text-muted sm:col-span-1">歷次報告</span><button aria-label="較新的報告" className={historyArrow} disabled={busy || position <= 0} onClick={() => choose(history[position - 1].id)}><ChevronLeft size={16} /></button>
        <label className="min-w-0"><span className="sr-only">選擇報告時間</span><select value={selected} disabled={busy} className="min-h-11 w-full min-w-0 max-w-full truncate rounded-xl bg-surface px-2 text-sm" onChange={e => choose(e.target.value)}>{!history.some(h => h.id === selected) && selected && <option value={selected}>目前選取的報告</option>}{history.map((h, i) => <option key={h.id} value={h.id}>{new Date(h.created_at).toLocaleString()} · {h.cycle_kind === 'baseline' ? '首次基準' : h.cycle_kind === 'cycle' ? '階段總結' : `舊版 ${h.days} 天`}{!i ? ' · 最近一份' : ''}</option>)}</select></label>
        <button aria-label="較早的報告" className={historyArrow} disabled={busy || position < 0 || position >= history.length - 1} onClick={() => choose(history[position + 1].id)}><ChevronRight size={16} /></button>
        {cursor && <button className={`${button} col-span-full justify-self-start`} disabled={busy} onClick={() => void run(async signal => { const page = await analysisService.list({ subjectId }, undefined, cursor, signal); if (!signal.aborted) { setHistory(old => [...old, ...page.reports]); setCursor(page.nextCursor); } })}>載入更早報告</button>}
      </nav>}
      {loading && <p role="status">載入報告…</p>}
      {report && <><PersonalAnalysisReport key={report.id} report={report} busy={busy} onPractice={ids => navigate(`/practice?subject=${encodeURIComponent(subjectId)}&questions=${encodeURIComponent(ids.join(','))}`)} onReload={() => void run(async signal => {
        if (report.status === 'pending' || report.status === 'failed') await completeRun(report.id, signal);
        else { const value = await analysisService.report(report.id, signal); if (!signal.aborted && active.current === value.id) setReport(value); }
      })} />{report.status === 'complete' && !report.expired && <AnalysisConversation key={uid + ':' + report.id} report={report} />}</>}
      {!report && !loading && !selected && <section className="rounded-3xl border border-border-subtle bg-surface p-6"><h2 className="font-medium">從第一份整科報告開始</h2><p className="mt-3 text-sm leading-7 text-text-muted">按「建立首次基準」，AI 會綜合目前全科資料並引用原題。之後的報告會接續這份總結，觀察新增題目、訂正與重作帶來的變化。</p></section>}
    </>}
  </>;
}
