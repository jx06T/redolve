import type { LearningData, LearningQuestion, PersonalQuestionRef } from '../types/learning';
import { sharingApi } from './sharingApi';

const endpoint = (ref: PersonalQuestionRef) => `/learning/${ref.kind}/${encodeURIComponent(ref.kind === 'owned' ? ref.itemId : ref.savedRefId)}`;
export const learningService = {
  read: (ref: PersonalQuestionRef, signal?: AbortSignal) => sharingApi<LearningQuestion>(endpoint(ref), 'GET', undefined, signal),
  save: (current: LearningQuestion, data: LearningData, signal?: AbortSignal, correctionId?: string) => sharingApi<LearningQuestion>(endpoint(current.ref), 'PATCH', {
    expectedRowVersion: current.rowVersion, expectedSourceVersion: current.sourceVersion, data, ...(correctionId ? { correctionId } : {}),
  }, signal),
  preview: (ref: PersonalQuestionRef, signal?: AbortSignal) => sharingApi<LearningQuestion>(endpoint(ref) + '/preview', 'POST', {}, signal),
  confirm: (current: LearningQuestion, signal?: AbortSignal) => sharingApi<LearningQuestion>(endpoint(current.ref) + '/confirm', 'POST', {
    expectedRowVersion: current.rowVersion, expectedSourceVersion: current.sourceVersion,
  }, signal),
};
