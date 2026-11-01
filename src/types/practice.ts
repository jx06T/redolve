import { validateLearningData } from './learning';
import type { LearningAnswer, LearningContent, LearningQuestion, PersonalQuestionRef } from './learning';

export interface PracticeScope { subjectId: string; topicId?: string; includeArchived?: boolean }
export interface PracticeQuestion extends LearningQuestion { id: string; revisionId: string; topicId: string; imageUrl: string; sessionItemId: string }
export interface PracticeSession { id: string; policy: string; questions: PracticeQuestion[]; candidateCount: number }
export interface AttemptInput {
  id: string; questionId: string; revisionId: string; sessionId: string; sessionItemId: string;
  answer: LearningAnswer; selfResult?: 'correct' | 'incorrect'; clientAnsweredAt: string;
  clientTimezone: string; usedOriginalImage: boolean; supersedesAttemptId?: string;
}
export interface PracticeAttempt {
  id: string; questionId: string; revisionId: string; sessionId: string; sessionItemId: string;
  answer: LearningAnswer; result: 'correct' | 'incorrect'; gradingMethod: 'automatic' | 'self';
  basis: { content: LearningContent; confirmationStatus: 'ai' | 'confirmed'; rule: string };
  answeredAt: string; receivedAt: string; timeQuality: 'client' | 'adjusted'; usedOriginalImage: boolean;
  supersedesAttemptId: string | null; voidedAt: string | null;
}
export type AttemptReply = { id: string; attempt?: PracticeAttempt; error?: { status: number; message: string } };
export const practiceRefPath = (ref: PersonalQuestionRef) => ref.kind === 'owned' ? `/problem/${encodeURIComponent(ref.itemId)}` : `/saved/${encodeURIComponent(ref.savedRefId)}`;
export function gradePractice(content: LearningContent, input: LearningAnswer, selfResult?: string): { answer: LearningAnswer; result: 'correct' | 'incorrect'; gradingMethod: 'automatic' | 'self' } {
  const answer = validateLearningData({ content, personal: { originalAnswer: input, errorReasons: [] } }).personal.originalAnswer;
  const key = content.correctAnswer;
  const automatic = ['single_choice', 'multiple_choice'].includes(content.questionType) && key?.kind === 'choice';
  if (automatic) {
    if (answer?.kind !== 'choice' || !answer.optionIds.length || content.questionType === 'single_choice' && answer.optionIds.length !== 1)
      throw Error('請選擇有效的作答選項');
    const correct = [...new Set(key.optionIds)].sort().join('\0') === [...new Set(answer.optionIds)].sort().join('\0');
    return { answer, result: correct ? 'correct' as const : 'incorrect' as const, gradingMethod: 'automatic' as const };
  }
  if (selfResult !== 'correct' && selfResult !== 'incorrect') throw Error('請自評這次答對或答錯');
  return { answer, result: selfResult, gradingMethod: 'self' as const };
}
