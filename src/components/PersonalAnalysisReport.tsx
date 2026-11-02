import { AnalysisCitations } from './AnalysisCitations';
import type { AnalysisReport, AnalysisStats } from '../types/analysis';

const button = 'rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm disabled:opacity-40';
export function AnalysisStatsContent({ stats }: { stats: AnalysisStats }) {
  return <div className="space-y-4">
    <p className="text-xs text-text-muted">作答期間 {new Date(stats.from).toLocaleDateString()} 至 {new Date(stats.cutoff).toLocaleString()}；題庫包含較早收錄的題目。</p>
    <dl className="grid grid-cols-3 gap-3">
      {[['個人題目', stats.questions], ['期間作答', stats.attempts], ['重作答對', stats.attempts ? `${stats.correct}／${stats.attempts}` : '尚無紀錄']].map(([label, value]) =>
        <div key={label} className="rounded-2xl bg-page-bg p-3"><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-2 text-lg font-medium">{value}</dd></div>)}
    </dl>
    {!stats.attempts && <p className="text-sm text-text-muted">尚無重作紀錄，本次可看內容分布；有原作答與正解的題目可供比對可能混淆，不推論進步或退步。</p>}
    {stats.comparison && <div className="space-y-2 rounded-2xl bg-page-bg p-4 text-sm"><p className="font-medium">與前一段 {stats.days} 天比較</p><p className="text-xs text-text-muted">前期 {new Date(stats.comparison.from).toLocaleDateString()} 至 {new Date(stats.comparison.cutoff).toLocaleDateString()}；兩期的題目組合可能不同。</p><p>前期答對 {stats.comparison.correct}／{stats.comparison.attempts} 次；本期 {stats.correct}／{stats.attempts} 次。</p><p className="text-xs text-text-muted">前期自動／自評 {stats.comparison.automatic}／{stats.comparison.self}，看過原圖 {stats.comparison.viewedImage} 次；本期 {stats.automatic}／{stats.self}，看過原圖 {stats.viewedImage} 次。</p><p>兩期皆作答的同題 {stats.comparison.matchedQuestions} 題：前期 {stats.comparison.previousMatchedCorrect}／{stats.comparison.previousMatchedAttempts} 次，本期 {stats.comparison.currentMatchedCorrect}／{stats.comparison.currentMatchedAttempts} 次。</p><p className="text-xs text-text-muted">這是產品中的重作紀錄變化，不能當成整科能力分數。</p></div>}
    {!!stats.repeatedQuestions && <p className="text-sm">期間內同題重作至少兩次：{stats.repeatedQuestions} 題；首次錯、末次對 {stats.changedToCorrect} 題；首次對、末次錯 {stats.changedToIncorrect} 題。這是同題結果變化，不能當成整科能力變化。</p>}
    <details><summary className="cursor-pointer text-sm">資料組成與各單元</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt>使用者已確認</dt><dd>{stats.confirmed} 題</dd>
        {stats.aiRecognized !== undefined && <><dt>AI 辨識、尚未確認</dt><dd>{stats.aiRecognized} 題</dd></>}
        {stats.withoutRevision !== undefined && <><dt>尚未整理辨識資料</dt><dd>{stats.withoutRevision} 題</dd></>}
        <dt>可用題文</dt><dd>{stats.prepared} 題</dd>
        {stats.missingCorrectAnswer !== undefined && <><dt>缺少正解</dt><dd>{stats.missingCorrectAnswer} 題</dd></>}
        {stats.missingOriginalAnswer !== undefined && <><dt>缺少本人原作答</dt><dd>{stats.missingOriginalAnswer} 題（存入題可保持空白）</dd></>}
        {stats.sources && <><dt>題目來源</dt><dd>上傳 {stats.sources.owned}／存入 {stats.sources.saved}</dd></>}
        <dt>自動判分／自評</dt><dd>{stats.automatic}／{stats.self} 次</dd>
        <dt>提交前查看原圖</dt><dd>{stats.viewedImage} 次</dd>
      </dl>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">各單元題數與重作結果</caption><thead><tr><th>單元</th><th>題數</th><th>答對／作答</th></tr></thead><tbody>{stats.units.map(u => <tr key={u.id}><td className="py-2">{u.label}</td><td>{u.questions}</td><td>{u.attempts ? `${u.correct}／${u.attempts}` : '尚無作答'}</td></tr>)}</tbody></table></div>
    </details>
    {!!stats.daily?.length && <details><summary className="cursor-pointer text-sm">每日重作紀錄</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-2 text-left text-xs text-text-muted">依 {stats.timezone || 'UTC'} 分日；不同日期的題目組合可能不同。</caption><thead><tr><th>日期</th><th>答對／作答</th><th>自動／自評</th></tr></thead><tbody>{stats.daily.map(point => <tr key={point.date}><td className="py-2">{point.date}</td><td>{point.correct}／{point.attempts}</td><td>{point.automatic}／{point.self}</td></tr>)}</tbody></table></div></details>}
  </div>;
}
export function PersonalAnalysisReport({ report, busy, onPractice, onReload }: {
  report: AnalysisReport; busy: boolean; onPractice: (ids: string[]) => void; onReload: () => void;
}) {
  return <section className="space-y-4 rounded-3xl border border-border-subtle bg-surface p-5 md:p-7" aria-label="分析報告">
    <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-medium">整科報告</h2><span className="text-xs text-text-muted">{new Date(report.createdAt).toLocaleString()}</span></div>
    <p className="text-xs text-text-muted">當時 {report.stats.questions} 題、{report.stats.attempts} 次作答；作答觀察期間 {report.stats.days} 天。{!report.expired && report.status === 'complete' && `全科統計涵蓋所有持有題目；AI 深讀 ${report.evidence.length} 題，使用文字與作答資料，未重新掃描原圖。`}</p>
    {report.status === 'pending' && <p role="status">正在產生解讀，完成後顯示在這裡…</p>}
    {report.error && <p role="alert">{report.error}</p>}
    {report.status === 'failed' && <p className="text-sm text-text-muted">這份統計仍保留。可用上方「產生整科報告」手動重試。</p>}
    {(report.status === 'pending' || report.status === 'failed') && <button className={button} disabled={busy} onClick={onReload}>{report.status === 'pending' ? '繼續／重新載入報告' : '重新載入這份報告'}</button>}
    {report.interpretation?.overview && !report.expired && <div className="whitespace-pre-wrap rounded-2xl bg-primary/5 p-5 text-sm leading-7">{report.interpretation.overview}</div>}
    {report.stats.comparison && <details><summary className="cursor-pointer text-sm text-text-muted">查看兩期變化與資料組成</summary><div className="mt-4"><AnalysisStatsContent stats={report.stats} /></div></details>}
    {report.expired ? <p className="text-sm">詳細解讀已到期，保留當時的數字摘要。</p> : report.interpretation?.findings.map((finding, i) => <article key={`${i}:${finding.title}`} className="space-y-3 border-t border-border-subtle pt-4">
      <h3 className="font-medium">{finding.title}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{finding.explanation}</p>
      <AnalysisCitations ids={finding.evidenceIds} evidence={report.evidence} />
      {!!finding.evidenceIds.length && <button disabled={busy} className={button + ' min-h-11'} onClick={() => onPractice(finding.evidenceIds)}>練習這些題</button>}
    </article>)}
    {report.status === 'complete' && !report.expired && !report.interpretation?.findings.length && <p className="text-sm">目前沒有足夠依據提供具體解讀，可先整理題文、答案或累積重作紀錄。</p>}
    <details><summary className="cursor-pointer text-sm">報告當時的完整統計</summary><div className="mt-4"><AnalysisStatsContent stats={report.stats} /></div></details>
  </section>;
}
