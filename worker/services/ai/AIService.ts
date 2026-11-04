import { TaxonomyNode } from '../../types';
import type { AnalysisErrorReason, AnalysisErrorTag } from '../../../src/types/analysis';
import type { WeaknessAttemptEvidence, WeaknessTrend } from '../../../src/types/weakness';

export interface TagResult {
  topic_id: string | null;
  keywords: string[];
  keyword_tokens: string[];
  ocr_text: string;
  question_type?: string;
  options?: unknown[];
  original_answer?: unknown;
  correct_answer?: unknown;
  error_reasons?: string[];
}

export interface AIService {
  suggestWeaknesses(input: import('./correctionPrompts').CorrectionContext & { excluded: string[]; reviewOfAttempt?: boolean; attemptAnswer?: unknown }): Promise<import('../../../src/types/learning').ErrorReason[]>;
  recognizeCorrection(imageBytes: ArrayBuffer, input: import('./correctionPrompts').CorrectionContext): Promise<{ data: import('../../../src/types/learning').LearningData; model: string }>;
  selectAnalysisQuestions(input: { stats: import('../../../src/types/analysis').AnalysisStats; catalog: AnalysisCatalogEntry[]; question?: string; catalogPreviewLimited?: boolean; errorTagCounts?: AnalysisErrorTagCount[]; weaknessTrends?: WeaknessTrend[];
    previousReport?: import('../../../src/types/analysis').PreviousAnalysisContext; changes?: { newQuestionIds: string[]; updatedQuestionIds: string[]; practicedQuestionIds: string[] } }): Promise<AnalysisSelection>;
  analyzeLearning(input: { stats: import('../../../src/types/analysis').AnalysisStats; evidence: import('../../../src/types/analysis').AnalysisEvidence[]; catalogQuestions?: number; catalogPreviewLimited?: boolean; errorTagCounts?: AnalysisErrorTagCount[]; weaknessTrends?: WeaknessTrend[];
    previousReport?: import('../../../src/types/analysis').PreviousAnalysisContext; candidateFindings?: AnalysisCandidateFinding[] }): Promise<{ interpretation: unknown; model: string }>;
  followupLearning(input: { stats: import('../../../src/types/analysis').AnalysisStats; interpretation: unknown; evidence: import('../../../src/types/analysis').AnalysisEvidence[];
    history: { question: string; answer: unknown }[]; question: string; weaknessTrends?: WeaknessTrend[] }): Promise<{ answer: unknown; model: string }>;
  tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null>;
}
export interface AnalysisCatalogEntry { id: string; topicId: string; text: string; attempts: number; correct: number; confirmed: boolean; hasCorrectAnswer: boolean;
  tags?: string[]; correctionDigest?: string; errorReasons?: AnalysisErrorReason[]; errorTags?: AnalysisErrorTag[];
  confirmedWeaknessIds?: string[]; weaknessReviews?: WeaknessAttemptEvidence[] }
export interface AnalysisCandidateFinding { topic: string; rationale: string; supportingQuestionIds: string[] }
export interface AnalysisSelection { questionIds: string[]; candidateFindings?: AnalysisCandidateFinding[] }
export interface AnalysisErrorTagCount { code: string; label: string; adoptedQuestions: number; pendingQuestions: number }
