import type { QuestionRef } from './question';

export type PersonalQuestionRef = Extract<QuestionRef, { kind: 'owned' | 'saved' }>;
export const ANALYSIS_PERIOD_DAYS = [7, 15, 30, 60, 90] as const;
export const DEFAULT_ANALYSIS_PERIOD_DAYS = 30;
export const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'fill_blank', 'calculation', 'essay', 'other', 'unknown'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export type LearningAnswer = { kind: 'choice'; optionIds: string[] } | { kind: 'text'; text: string } | null;
export interface LearningContent {
  ocrText: string | null;
  questionType: QuestionType;
  options: { id: string; label: string; text: string }[];
  correctAnswer: LearningAnswer;
}
export interface LearningPersonal {
  originalAnswer: LearningAnswer;
  errorReasons: { text: string; origin: 'ai' | 'user'; accepted?: boolean }[];
  correctionSummary?: string;
}
export interface LearningData {
  content: LearningContent;
  personal: LearningPersonal;
}
export interface LearningQuestion extends LearningData {
  ref: PersonalQuestionRef;
  id: string | null;
  revisionId: string | null;
  rowVersion: number;
  sourceVersion: string;
  confirmationStatus: 'ai' | 'confirmed';
  /** Retained saved source changed; personal data stays on its existing revision. */
  sourceUpdated?: boolean;
  correction?: CorrectionRecognition;
}
export interface CorrectionRecognition {
  id: string; status: 'pending' | 'complete' | 'failed'; data: LearningData | null;
  baseRowVersion: number; sourceVersion: string; adopted: boolean; stale: boolean; error: string | null; createdAt: string;
}

export const emptyLearningData = (): LearningData => ({
  content: { ocrText: null, questionType: 'unknown', options: [], correctAnswer: null },
  personal: { originalAnswer: null, errorReasons: [] },
});

/** Search/copy retains options; personal answers and reasons never enter shared text. */
export const learningFullText = (content: LearningContent): string =>
  [content.ocrText || '', ...content.options.map(o => `${o.label} ${o.text}`)].filter(Boolean).join('\n');


const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Strict for user edits; malformed AI fields are discarded by normalizeRecognition. */
export function validateLearningData(value: unknown): LearningData {
  const data = object(value), c = object(data.content), p = object(data.personal);
  const text = (value: unknown, max: number): string => {
    if (typeof value !== 'string' || value.length > max) throw Error('文字欄位格式或長度不正確');
    return value.trim();
  };
  if (!QUESTION_TYPES.includes(c.questionType as QuestionType)) throw Error('題型不正確');
  if (!Array.isArray(c.options) || c.options.length > 30) throw Error('選項最多 30 個');
  const options = c.options.map(value => {
    const option = object(value);
    const id = text(option.id, 64), label = text(option.label, 64);
    if (!id || !label) throw Error('選項編號不可空白');
    return { id, label, text: text(option.text, 8000) };
  });
  const ids = new Set(options.map(o => o.id));
  if (ids.size !== options.length) throw Error('選項編號不可重複');
  const answer = (value: unknown, correct: boolean): LearningAnswer => {
    if (value === null) return null;
    const a = object(value);
    if (a.kind === 'text') {
      const result = text(a.text, 16000);
      if (correct && ['single_choice', 'multiple_choice'].includes(String(c.questionType))) throw Error('選擇題正解請使用選項');
      return result ? { kind: 'text', text: result } : null;
    }
    if (a.kind !== 'choice' || !Array.isArray(a.optionIds) || a.optionIds.length > 30 ||
      a.optionIds.some(id => typeof id !== 'string' || !ids.has(id))) throw Error('答案包含不存在的選項');
    const selected = [...new Set(a.optionIds as string[])].sort();
    if (!selected.length) return null;
    if (correct && c.questionType === 'single_choice' && selected.length !== 1) throw Error('單選題正解只能有一個選項');
    return { kind: 'choice', optionIds: selected };
  };
  if (!Array.isArray(p.errorReasons) || p.errorReasons.length > 12) throw Error('錯因最多 12 項');
  const result: LearningData = {
    content: { ocrText: c.ocrText === null ? null : text(c.ocrText, 64000) || null,
      questionType: c.questionType as QuestionType, options, correctAnswer: answer(c.correctAnswer, true) },
    personal: { originalAnswer: answer(p.originalAnswer, false), errorReasons: p.errorReasons.map(value => {
      const r = object(value);
      if (r.origin !== 'ai' && r.origin !== 'user') throw Error('錯因來源不正確');
      if (r.accepted !== undefined && typeof r.accepted !== 'boolean') throw Error('錯因確認格式不正確');
      return { text: text(r.text, 1000), origin: r.origin as 'ai' | 'user', ...(r.accepted !== undefined ? { accepted: r.accepted as boolean } : {}) };
    }).filter(r => r.text) },
  };
  if (p.correctionSummary !== undefined) result.personal.correctionSummary = text(p.correctionSummary, 6000);
  if (new TextEncoder().encode(JSON.stringify(result)).length > 128000) throw Error('題目資料過大');
  return result;
}

/** Each uncertain field stays empty; a damaged answer must not destroy usable OCR. */
export function normalizeRecognition(raw: unknown, saved = false): LearningData {
  const r = object(raw), data = emptyLearningData();
  data.content.ocrText = typeof r.ocr_text === 'string' ? r.ocr_text.slice(0, 64000).trim() || null : null;
  if (QUESTION_TYPES.includes(r.question_type as QuestionType)) data.content.questionType = r.question_type as QuestionType;
  if (Array.isArray(r.options) && r.options.length <= 30) {
    try { data.content.options = validateLearningData({ ...data, content: { ...data.content, options: r.options } }).content.options; } catch { /* uncertain options stay empty */ }
  }
  for (const [field, target] of [['correct_answer', 'correctAnswer'], ['original_answer', 'originalAnswer']] as const) {
    if (saved && target === 'originalAnswer') continue;
    try {
      const next = structuredClone(data);
      if (target === 'correctAnswer') next.content.correctAnswer = r[field] as LearningAnswer ?? null;
      else next.personal.originalAnswer = r[field] as LearningAnswer ?? null;
      const valid = validateLearningData(next);
      data.content = valid.content; data.personal = valid.personal;
    } catch { /* do not guess */ }
  }
  if (!saved && Array.isArray(r.error_reasons)) data.personal.errorReasons = r.error_reasons
    .filter((v): v is string => typeof v === 'string').slice(0, 12)
    .map(text => ({ text: text.slice(0, 1000), origin: 'ai' as const }));
  try { return validateLearningData(data); } catch {
    const fallback = emptyLearningData(); fallback.content.ocrText = data.content.ocrText; return fallback;
  }
}
