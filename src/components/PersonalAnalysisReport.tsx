import { ArrowRight, ChevronDown } from 'lucide-react';
import { AnalysisCitations } from './AnalysisCitations';
import { ExpandableAnalysisText } from './ExpandableAnalysisText';
import type { AnalysisReport, AnalysisStats } from '../types/analysis';

const button = 'min-h-11 rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
const tableClass = 'w-full text-left text-sm [&_th]:pb-3 [&_th]:font-medium [&_th]:text-text-muted [&_td]:py-3 [&_td]:pr-3';

export function AnalysisStatsSummary({ stats }: { stats: AnalysisStats }) {
  return <div className="space-y-3">
    <dl className="grid grid-cols-3 divide-x divide-border-subtle rounded-2xl bg-page-bg/70 py-4">
      {[['個人題目', stats.questions], ['期間作答', stats.attempts], ['重作答對', stats.attempts ? `${stats.correct}／${stats.attempts}` : '—']].map(([label, value]) =>
        <div key={label} className="min-w-0 px-3 sm:px-5"><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd></div>)}
    </dl>
    {!stats.attempts && <p className="text-sm text-text-muted">尚無重作紀錄，本次只解讀題目內容與分布，不推論進步或退步。</p>}
  </div>;
}

/** Detailed statistics are rendered once, below the report's interpretation. */
export function AnalysisStatsContent({ stats }: { stats: AnalysisStats }) {
  const comparison = stats.comparison;
  return <div className="space-y-6">
    <p className="text-xs leading-6 text-text-muted">作答期間 {new Date(stats.from).toLocaleDateString()} 至 {new Date(stats.cutoff).toLocaleString()}；題庫包含較早收錄的題目。</p>
    <section aria-label="作答變化" className="space-y-3">
      <h3 className="font-medium">作答變化</h3>
      {comparison ? <>
        <p className="text-xs leading-6 text-text-muted">前期 {new Date(comparison.from).toLocaleDateString()} 至 {new Date(comparison.cutoff).toLocaleDateString()}；前後各 {stats.days} 天，題目組合可能不同。</p>
        <div className="overflow-x-auto"><table className={tableClass}>
          <caption className="sr-only">前後兩期作答比較</caption>
          <thead><tr><th>紀錄</th><th>前期</th><th>本期</th></tr></thead>
          <tbody className="divide-y divide-border-subtle">
            <tr><td>答對／作答</td><td>{comparison.correct}／{comparison.attempts}</td><td>{stats.correct}／{stats.attempts}</td></tr>
            <tr><td>自動判分／自評</td><td>{comparison.automatic}／{comparison.self}</td><td>{stats.automatic}／{stats.self}</td></tr>
            <tr><td>查看原圖</td><td>{comparison.viewedImage} 次</td><td>{stats.viewedImage} 次</td></tr>
            <tr><td>兩期同題答對／作答<br /><span className="text-xs text-text-muted">共 {comparison.matchedQuestions} 題</span></td><td>{comparison.previousMatchedCorrect}／{comparison.previousMatchedAttempts}</td><td>{comparison.currentMatchedCorrect}／{comparison.currentMatchedAttempts}</td></tr>
          </tbody>
        </table></div>
      </> : <p className="text-sm text-text-muted">這份報告沒有前期比較資料。</p>}
      {!!stats.repeatedQuestions && <p className="text-sm leading-7">期間內同題重作至少兩次：{stats.repeatedQuestions} 題；首次錯、末次對 {stats.changedToCorrect} 題，首次對、末次錯 {stats.changedToIncorrect} 題。</p>}
      <p className="text-xs leading-6 text-text-muted">以上反映產品中的重作結果；不同題目組合、自評或查看原圖都可能影響表現，不能當作整科能力分數。</p>
    </section>
    <div className="grid gap-6 border-t border-border-subtle pt-6 md:grid-cols-2 md:gap-8">
      <section aria-label="各單元" className="min-w-0 space-y-4">
        <h3 className="font-medium">各單元</h3>
        {stats.units.length ? <div className="overflow-x-auto"><table className={tableClass}>
          <caption className="sr-only">各單元題數與重作結果</caption>
          <thead><tr><th>單元</th><th className="whitespace-nowrap">題數</th><th className="whitespace-nowrap">答對／作答</th></tr></thead>
          <tbody className="divide-y divide-border-subtle">{stats.units.map(unit => <tr key={unit.id}><td>{unit.label}</td><td>{unit.questions}</td><td className="whitespace-nowrap">{unit.attempts ? `${unit.correct}／${unit.attempts}` : '尚無作答'}</td></tr>)}</tbody>
        </table></div> : <p className="text-sm text-text-muted">尚無單元資料。</p>}
      </section>
      <section aria-label="資料組成" className="min-w-0 space-y-4">
        <h3 className="font-medium">資料組成</h3>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 text-sm [&_dt]:text-text-muted [&_dd]:text-right [&_dd]:tabular-nums">
          <dt>使用者已確認</dt><dd>{stats.confirmed} 題</dd>
          {stats.aiRecognized !== undefined && <><dt>AI 辨識、尚未確認</dt><dd>{stats.aiRecognized} 題</dd></>}
          {stats.withoutRevision !== undefined && <><dt>尚未整理辨識資料</dt><dd>{stats.withoutRevision} 題</dd></>}
          <dt>可用題文</dt><dd>{stats.prepared} 題</dd>
          {stats.missingCorrectAnswer !== undefined && <><dt>缺少正解</dt><dd>{stats.missingCorrectAnswer} 題</dd></>}
          {stats.missingOriginalAnswer !== undefined && <><dt>缺少本人原作答</dt><dd>{stats.missingOriginalAnswer} 題</dd></>}
          {stats.sources && <><dt>上傳／存入</dt><dd>{stats.sources.owned}／{stats.sources.saved} 題</dd></>}
          <dt>自動判分／自評</dt><dd>{stats.automatic}／{stats.self} 次</dd>
          <dt>提交前查看原圖</dt><dd>{stats.viewedImage} 次</dd>
        </dl>
        {!!stats.missingOriginalAnswer && <p className="text-xs leading-6 text-text-muted">存入題的本人原作答可保持空白。</p>}
      </section>
    </div>
    <section aria-label="每日紀錄" className="space-y-3 border-t border-border-subtle pt-6">
      <h3 className="font-medium">每日紀錄</h3>
      {stats.daily?.length ? <div className="overflow-x-auto"><table className={tableClass}>
        <caption className="pb-3 text-left text-xs text-text-muted">依 {stats.timezone || 'UTC'} 分日；不同日期的題目組合可能不同。</caption>
        <thead><tr><th>日期</th><th>答對／作答</th><th>自動／自評</th></tr></thead>
        <tbody className="divide-y divide-border-subtle">{stats.daily.map(point => <tr key={point.date}><td className="whitespace-nowrap">{point.date}</td><td>{point.correct}／{point.attempts}</td><td>{point.automatic}／{point.self}</td></tr>)}</tbody>
      </table></div> : <p className="text-sm text-text-muted">這份統計沒有每日明細。</p>}
    </section>
  </div>;
}

export function PersonalAnalysisReport({ report, busy, onPractice, onReload }: {
  report: AnalysisReport; busy: boolean; onPractice: (ids: string[]) => void; onReload: () => void;
}) {
  const findings = report.expired ? [] : report.interpretation?.findings || [];
  return <section className="space-y-7 rounded-3xl border border-border-subtle bg-surface p-5 md:p-7" aria-label="分析報告">
    <section aria-label="報告總覽" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">報告總覽</h2><p className="mt-1 text-xs text-text-muted">近 {report.stats.days} 天作答觀察</p></div>
        <time dateTime={report.createdAt} className="text-xs text-text-muted">{new Date(report.createdAt).toLocaleString()}</time>
      </header>
      <AnalysisStatsSummary stats={report.stats} />
      {report.status === 'pending' && <p role="status" className="text-sm text-text-muted">正在產生解讀，完成後顯示在這裡…</p>}
      {report.error && <p role="alert" className="text-sm">{report.error}</p>}
      {report.status === 'failed' && <p className="text-sm text-text-muted">這份統計仍保留。可用上方「產生整科報告」手動重試。</p>}
      {(report.status === 'pending' || report.status === 'failed') && <button className={button} disabled={busy} onClick={onReload}>{report.status === 'pending' ? '繼續／重新載入報告' : '重新載入這份報告'}</button>}
      {report.interpretation?.overview && !report.expired && <div className="rounded-2xl bg-primary/5 px-4 py-3"><ExpandableAnalysisText text={report.interpretation.overview} /></div>}
      {report.expired && <p className="text-sm text-text-muted">詳細解讀已到期，保留當時的數字摘要。</p>}
    </section>
    {!report.expired && report.status === 'complete' && <section aria-label="分析重點" className="border-t border-border-subtle pt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">分析重點</h2><span className="text-xs text-text-muted">{findings.length} 項觀察</span></div>
      {findings.length ? <div className="divide-y divide-border-subtle">{findings.map((finding, index) => <article key={`${index}:${finding.title}`} className="min-w-0 space-y-2 py-4">
        <h3 className="break-words font-medium leading-7">{finding.title}</h3>
        <ExpandableAnalysisText text={finding.explanation} lines={2} footer={finding.evidenceIds.length ? <>
          <AnalysisCitations ids={finding.evidenceIds} evidence={report.evidence} />
          <button type="button" disabled={busy} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl text-sm text-primary-600 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 dark:text-primary-300" onClick={() => onPractice(finding.evidenceIds)}>練習本組<ArrowRight size={15} aria-hidden="true" /></button>
        </> : undefined} />
      </article>)}</div> : <p className="py-4 text-sm text-text-muted">目前沒有足夠依據提供具體解讀，可先整理題文、答案或累積重作紀錄。</p>}
    </section>}
    <details className="group border-t border-border-subtle pt-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"><h2 className="font-semibold"><span>數據詳情</span><span className="mt-1 block text-xs font-normal text-text-muted">報告當時的變化、各單元與資料組成</span></h2><ChevronDown size={17} className="shrink-0 text-text-muted group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="mt-5">
        {!report.expired && report.status === 'complete' && <p className="mb-4 text-xs leading-6 text-text-muted">全科統計涵蓋當時所有持有題目；AI 深讀 {report.evidence.length} 題，使用文字與作答資料，未重新掃描原圖。</p>}
        <AnalysisStatsContent stats={report.stats} />
      </div>
    </details>
  </section>;
}
