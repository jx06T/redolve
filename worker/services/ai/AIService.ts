import { TaxonomyNode } from '../../types';

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
  selectAnalysisQuestions(input: { stats: import('../../../src/types/analysis').AnalysisStats; catalog: AnalysisCatalogEntry[]; question?: string }): Promise<string[]>;
  analyzeLearning(input: { stats: import('../../../src/types/analysis').AnalysisStats; evidence: import('../../../src/types/analysis').AnalysisEvidence[]; catalogQuestions?: number }): Promise<{ interpretation: unknown; model: string }>;
  followupLearning(input: { stats: import('../../../src/types/analysis').AnalysisStats; interpretation: unknown; evidence: import('../../../src/types/analysis').AnalysisEvidence[];
    history: { question: string; answer: unknown }[]; question: string }): Promise<{ answer: unknown; model: string }>;
  tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null>;
}
export interface AnalysisCatalogEntry { id: string; topicId: string; text: string; attempts: number; correct: number; confirmed: boolean; hasCorrectAnswer: boolean }
