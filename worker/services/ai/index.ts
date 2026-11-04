import { AIService } from './AIService';
import { GeminiService } from './GeminiService';
import { Bindings } from '../../types';

const defaultAnalysisModel = (env: Bindings) => env.GEMINI_ANALYSIS_MODEL?.trim() || 'gemini-3.1-pro-preview';
export const analysisReportModel = (env: Bindings) => env.GEMINI_ANALYSIS_REPORT_MODEL?.trim() || defaultAnalysisModel(env);

export function createAIService(env: Bindings): AIService {
  const provider = env.AI_PROVIDER ?? 'gemini';
  const analysisModel = analysisReportModel(env);
  const correctionModel = env.GEMINI_CORRECTION_MODEL?.trim() || undefined;
  const roles = { selection: env.GEMINI_ANALYSIS_SELECTION_MODEL?.trim() || defaultAnalysisModel(env),
    followup: env.GEMINI_ANALYSIS_FOLLOWUP_MODEL?.trim() || defaultAnalysisModel(env) };

  switch (provider) {
    case 'gemini':
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel, roles);
    default:
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel, roles);
  }
}
