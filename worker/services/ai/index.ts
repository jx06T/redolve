import { AIService } from './AIService';
import { GeminiService } from './GeminiService';
import { Bindings } from '../../types';

export function createAIService(env: Bindings): AIService {
  const provider = env.AI_PROVIDER ?? 'gemini';
  const analysisModel = env.GEMINI_ANALYSIS_MODEL?.trim() || undefined;
  const correctionModel = env.GEMINI_CORRECTION_MODEL?.trim() || undefined;

  switch (provider) {
    case 'gemini':
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel);
    default:
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel);
  }
}
