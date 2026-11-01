import type { PracticeScope } from './practice';
import type { PersonalQuestionRef } from './learning';
export interface AnalysisMetric { id: string; label: string; questions: number; attempts: number; correct: number; automatic: number; self: number; viewedImage: number }
export interface AnalysisStats {
  scope: PracticeScope; days: number; from: string; cutoff: string; questions: number; prepared: number; confirmed: number;
  attempts: number; correct: number; automatic: number; self: number; viewedImage: number;
  changedToCorrect: number; changedToIncorrect: number; repeatedQuestions: number; units: AnalysisMetric[];
}
export interface AnalysisEvidence { id: string; ref: PersonalQuestionRef; revisionId: string; topicId: string; text: string; originalAnswer: unknown; correctAnswer: unknown; errorReasons: unknown; attempts: number; correct: number }
export interface AnalysisFinding { title: string; explanation: string; evidenceIds: string[]; metricIds: string[] }
export interface AnalysisInterpretation { findings: AnalysisFinding[] }
export interface AnalysisReport { id: string; status: 'pending' | 'complete' | 'failed'; stats: AnalysisStats;
  interpretation: AnalysisInterpretation | null; evidence: AnalysisEvidence[]; createdAt: string; detailExpiresAt: string; expired: boolean; error: string | null }
