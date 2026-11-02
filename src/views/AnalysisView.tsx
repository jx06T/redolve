import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { analysisService } from '../services/analysisService';
import type { AnalysisSubjectSummary } from '../types/analysis';
import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
import { SubjectAnalysis } from './SubjectAnalysis';
import { AnalysisPeriod } from '../components/AnalysisPeriod';

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
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm text-text-muted">個人學習</p><h1 className="text-2xl font-semibold">各科分析</h1><p className="mt-3 text-sm text-text-muted">從整科看複習狀況，再一起找出下一步。</p></div><AnalysisPeriod value={days} change={d => setParams({ days: String(d) })} /></header>
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
