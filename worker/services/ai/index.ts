import { AIService } from './AIService';
import { GeminiService } from './GeminiService';
import { Bindings } from '../../types';
import { DEFAULT_GEMINI_STUDY_MODEL } from './models';

const defaultAnalysisModel = (env: Bindings) => env.GEMINI_ANALYSIS_MODEL?.trim() || DEFAULT_GEMINI_STUDY_MODEL;
export const analysisReportModel = (env: Bindings) => env.GEMINI_ANALYSIS_REPORT_MODEL?.trim() || defaultAnalysisModel(env);
export const correctionRecognitionModel = (env: Bindings) => env.GEMINI_CORRECTION_MODEL?.trim() || DEFAULT_GEMINI_STUDY_MODEL;

export function createAIService(env: Bindings): AIService {
  const provider = env.AI_PROVIDER ?? 'gemini';
  const analysisModel = analysisReportModel(env);
  const correctionModel = correctionRecognitionModel(env);
  const roles = { selection: env.GEMINI_ANALYSIS_SELECTION_MODEL?.trim() || defaultAnalysisModel(env),
    followup: env.GEMINI_ANALYSIS_FOLLOWUP_MODEL?.trim() || defaultAnalysisModel(env) };

  switch (provider) {
    case 'gemini':
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel, roles);
    default:
      return new GeminiService(env.GEMINI_API_KEY ?? '', undefined, analysisModel, correctionModel, roles);
  }
}
