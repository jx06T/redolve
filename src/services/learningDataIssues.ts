import type { LearningQuestion } from '../types/learning';
export function learningDataIssues(question: LearningQuestion): string[] {
  const issues: string[] = [];
  if (!question.revisionId) issues.push('尚未完成結構化辨識，請重新辨識或人工整理');
  if (!question.content.ocrText?.trim()) issues.push('缺少題幹');
  if (question.content.questionType === 'unknown') issues.push('尚未辨識題型');
  if (['single_choice','multiple_choice'].includes(question.content.questionType) && question.content.options.length < 2) issues.push('選項資料不足');
  if (!question.content.correctAnswer) issues.push('缺少正解，可補齊；練習時仍可自評');
  if (question.ref.kind === 'owned' && !question.personal.originalAnswer) issues.push('缺少本人原作答');
  return issues;
}
