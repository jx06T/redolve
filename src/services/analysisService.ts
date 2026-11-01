import { sharingApi } from './sharingApi';
import type { AnalysisReport, AnalysisStats } from '../types/analysis';
import type { PracticeScope } from '../types/practice';
export interface ReportSummary { id: string; created_at: string; days: number; topic_id: string | null; status: AnalysisReport['status'] }
export interface ReportPage { reports: ReportSummary[]; nextCursor: string | null }
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const analysisService = {
  stats: (scope: PracticeScope, days: number, signal?: AbortSignal) => sharingApi<AnalysisStats>('/analysis/stats', 'POST', { scope, days, timezone: timezone() }, signal),
  generate: (scope: PracticeScope, days: number, signal?: AbortSignal) => sharingApi<AnalysisReport>('/analysis/reports', 'POST', { scope, days, timezone: timezone() }, signal),
  report: (id: string, signal?: AbortSignal) => sharingApi<AnalysisReport>(`/analysis/reports/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  status: (id: string, signal?: AbortSignal) => sharingApi<Pick<AnalysisReport, 'id' | 'status' | 'error'>>(`/analysis/reports/${encodeURIComponent(id)}/status`, 'GET', undefined, signal),
  list: (scope: PracticeScope, days: number, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ subjectId: scope.subjectId, topicId: scope.topicId || '', days: String(days) });
    if (cursor) query.set('before', cursor);
    return sharingApi<ReportPage>('/analysis/reports?' + query, 'GET', undefined, signal);
  },
};
