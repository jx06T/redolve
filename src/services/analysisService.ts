import { sharingApi } from './sharingApi';
import type { AnalysisEligibility, AnalysisFollowup, AnalysisReport, AnalysisStats, AnalysisSubjectSummary } from '../types/analysis';
import type { PracticeScope } from '../types/practice';
export interface ReportSummary { id: string; created_at: string; days: number; topic_id: string | null; status: AnalysisReport['status']; cycle_kind?: 'baseline' | 'cycle' | null; cycle_from?: string | null; cycle_cutoff?: string | null }
export interface ReportPage { reports: ReportSummary[]; nextCursor: string | null }
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
async function connected<T>(path: string, body: unknown, signal?: AbortSignal) {
  const result = await sharingApi<{ ok: boolean; data: T; error?: { message: string } }>(path, 'POST', body, signal);
  if (!result.ok) throw Error(result.error?.message || '處理未完成，請稍後再試');
  return result.data;
}
export const analysisService = {
  overview: (days: number, signal?: AbortSignal) => sharingApi<{ subjects: AnalysisSubjectSummary[]; days: number; from: string; cutoff: string }>('/analysis/overview?days=' + days, 'GET', undefined, signal),
  stats: (scope: PracticeScope, days: number, signal?: AbortSignal) => sharingApi<AnalysisStats>('/analysis/stats', 'POST', { scope, days, timezone: timezone() }, signal),
  eligibility: (subjectId: string, signal?: AbortSignal) => sharingApi<AnalysisEligibility>('/analysis/eligibility?subjectId=' + encodeURIComponent(subjectId), 'GET', undefined, signal),
  generate: (scope: PracticeScope, signal?: AbortSignal) => sharingApi<AnalysisReport>('/analysis/reports', 'POST', { scope, timezone: timezone() }, signal),
  report: (id: string, signal?: AbortSignal) => sharingApi<AnalysisReport>(`/analysis/reports/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  run: (id: string, signal?: AbortSignal) => connected<AnalysisReport>(`/analysis/reports/${encodeURIComponent(id)}/run`, {}, signal),
  followups: (id: string, signal?: AbortSignal) => sharingApi<AnalysisFollowup[]>(`/analysis/reports/${encodeURIComponent(id)}/followups`, 'GET', undefined, signal),
  ask: (id: string, question: string, requestId: string, signal?: AbortSignal) => connected<AnalysisFollowup>(`/analysis/reports/${encodeURIComponent(id)}/followups`, { id: requestId, question }, signal),
  status: (id: string, signal?: AbortSignal) => sharingApi<Pick<AnalysisReport, 'id' | 'status' | 'error'>>(`/analysis/reports/${encodeURIComponent(id)}/status`, 'GET', undefined, signal),
  list: (scope: PracticeScope, days?: number, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ subjectId: scope.subjectId, topicId: scope.topicId || '' });
    if (days !== undefined) query.set('days', String(days));
    if (cursor) query.set('before', cursor);
    return sharingApi<ReportPage>('/analysis/reports?' + query, 'GET', undefined, signal);
  },
};
