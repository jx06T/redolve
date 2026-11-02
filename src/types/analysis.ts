import type { PracticeScope } from './practice';
import type { PersonalQuestionRef } from './learning';
export interface AnalysisMetric { id: string; label: string; questions: number; attempts: number; correct: number; automatic: number; self: number; viewedImage: number }
export interface AnalysisStats {
  scope: PracticeScope; days: number; from: string; cutoff: string; questions: number; prepared: number; confirmed: number;
  attempts: number; correct: number; automatic: number; self: number; viewedImage: number;
  changedToCorrect: number; changedToIncorrect: number; repeatedQuestions: number; units: AnalysisMetric[];
  timezone?: string; aiRecognized?: number; missingCorrectAnswer?: number; missingOriginalAnswer?: number; withoutRevision?: number;
  sources?: { owned: number; saved: number };
  daily?: { date: string; attempts: number; correct: number; automatic: number; self: number }[];
  comparison?: { from: string; cutoff: string; attempts: number; correct: number; automatic: number; self: number; viewedImage: number;
    matchedQuestions: number; previousMatchedAttempts: number; previousMatchedCorrect: number; currentMatchedAttempts: number; currentMatchedCorrect: number };
}
export interface AnalysisEvidence { id: string; ref: PersonalQuestionRef; revisionId: string; topicId: string; text: string; originalAnswer: unknown; correctAnswer: unknown; errorReasons: unknown; attempts: number; correct: number;
  confirmationStatus?: 'ai' | 'confirmed';
  options?: { id: string; label: string; text: string }[];
  correctionSummary?: string;
  recentAttempts?: { id: string; revisionId: string; answer: unknown; correctAnswer: unknown; answerDisplay?: string; correctAnswerDisplay?: string;
    result: string; gradingMethod: string; answeredAt: string; usedOriginalImage: boolean }[];
}
export interface AnalysisFinding { title: string; explanation: string; evidenceIds: string[]; metricIds: string[] }
export interface AnalysisInterpretation { overview?: string; findings: AnalysisFinding[] }
export interface AnalysisReport { id: string; status: 'pending' | 'complete' | 'failed'; stats: AnalysisStats;
  interpretation: AnalysisInterpretation | null; evidence: AnalysisEvidence[]; createdAt: string; detailExpiresAt: string; expired: boolean; error: string | null;
  model?: string | null; catalogQuestions?: number }
export interface AnalysisSubjectSummary { id: string; label: string; questions: number; prepared: number; confirmed: number; attempts: number; correct: number;
  latestReport: { id: string; createdAt: string; status: string } | null }
export interface AnalysisReply { text: string; evidenceIds: string[] }
export interface AnalysisFollowup { id: string; question: string; status: 'pending' | 'complete' | 'failed'; answer: AnalysisReply | null;
  evidence: AnalysisEvidence[]; createdAt: string; error: string | null }
