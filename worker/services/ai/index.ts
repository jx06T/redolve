import { AIService } from './AIService';
import { GeminiService } from './GeminiService';
import { Bindings } from '../../types';

export function createAIService(env: Bindings): AIService {
  const provider = env.AI_PROVIDER ?? 'gemini';

  switch (provider) {
    case 'gemini':
      return new GeminiService(env.GEMINI_API_KEY ?? '');
    default:
      return new GeminiService(env.GEMINI_API_KEY ?? '');
  }
}
