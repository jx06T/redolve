import { normalizeRecognition, validateLearningData } from '../../../src/types/learning';
import type { CorrectionContext } from './correctionPrompts';
import { normalizeWeaknessCandidates } from './weaknessCandidates';

/** Both synchronous and batch recognition use the same normalization contract. */
export function normalizeCorrectionResult(raw: Record<string, unknown>, input: CorrectionContext) {
  const data = normalizeRecognition(raw);
  if (Array.isArray(raw.weakness_candidates)) data.personal.errorReasons = normalizeWeaknessCandidates(raw.weakness_candidates, input.catalog ?? []);
  data.content = { ...data.content, ocrText: input.current.content.ocrText || data.content.ocrText,
    questionType: input.current.content.questionType === 'unknown' ? data.content.questionType : input.current.content.questionType,
    options: input.current.content.options.length ? input.current.content.options : data.content.options,
    correctAnswer: data.content.correctAnswer || input.current.content.correctAnswer };
  if (input.saved || !data.personal.originalAnswer) data.personal.originalAnswer = input.current.personal.originalAnswer;
  data.personal.correctionSummary = typeof raw.correction_summary === 'string' ? raw.correction_summary.slice(0, 6000) : '';
  return validateLearningData(data);
}
