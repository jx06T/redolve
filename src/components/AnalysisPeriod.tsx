import { ANALYSIS_PERIOD_DAYS } from '../types/learning';
export function AnalysisPeriod({ value, change }: { value: number; change: (days: number) => void }) {
  return <label className="flex items-center gap-2 text-sm text-text-muted">作答時間<select aria-label="作答時間" className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-text-main" value={value} onChange={e => change(Number(e.target.value))}>{ANALYSIS_PERIOD_DAYS.map(d => <option key={d} value={d}>近 {d} 天</option>)}</select></label>;
}
