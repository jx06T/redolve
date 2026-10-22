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
  tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null>;
}
