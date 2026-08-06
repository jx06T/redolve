import { TaxonomyNode } from '../../types';

export interface TagResult {
  topic_id: string | null;
  keywords: string[];
  keyword_tokens: string[];
  ocr_text: string
}

export interface AIService {
  tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null>;
}
