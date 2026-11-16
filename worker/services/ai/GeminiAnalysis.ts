import { buildAnalysisSelectionPrompt, buildAnalysisReportPrompt, buildAnalysisFollowupPrompt } from './analysisPrompts';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type { AIService, AnalysisSelection } from './AIService';
import { buildCorrectionPrompt, buildCorrectionSchema, CORRECTION_PROMPT_VERSION } from './correctionPrompts';
import { normalizeCorrectionResult } from './correctionResult';
import { reportProviderError } from './providerError';
import { normalizeWeaknessCandidates, weaknessCandidateSchema } from './weaknessCandidates';
import { buildWeaknessSuggestionPrompt, WEAKNESS_SUGGESTION_PROMPT_VERSION } from './weaknessSuggestionPrompt';
import { DEFAULT_GEMINI_STUDY_MODEL } from './models';

const strings = { type: Type.ARRAY, items: { type: Type.STRING } };
const candidateFindings: Schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
  topic: { type: Type.STRING }, rationale: { type: Type.STRING }, supportingQuestionIds: strings,
}, required: ['topic', 'rationale', 'supportingQuestionIds'] } };
const finding: Schema = { type: Type.OBJECT, properties: {
  kind: { type: Type.STRING, enum: ['unit_performance', 'error_pattern', 'other'] },
  title: { type: Type.STRING }, explanation: { type: Type.STRING }, evidenceIds: strings, metricIds: strings, practiceQuestionIds: strings },
  required: ['kind', 'title', 'explanation', 'evidenceIds', 'metricIds', 'practiceQuestionIds'] };
const promptVersions = {
  correction: CORRECTION_PROMPT_VERSION,
  'weakness-suggestions': WEAKNESS_SUGGESTION_PROMPT_VERSION,
  'analysis-selection': 'analysis-selection-v4',
  'analysis-report': 'analysis-report-v4',
  'analysis-followup': 'analysis-followup-v4',
};


/** Separate client and model: recognition retains its existing timeout and model policy. */
export class GeminiAnalysis {
  constructor(private apiKey: string, private model = DEFAULT_GEMINI_STUDY_MODEL,
    private roles: { selection?: string; followup?: string } = {}) {}
  private async json(operation: keyof typeof promptVersions, prompt: string, responseSchema: Schema, imageBytes?: ArrayBuffer, model = this.model) {
    if (!this.apiKey) throw Error('AI unavailable');
    const started = Date.now();
    try{
      const client = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { timeout: 90000, retryOptions: { attempts: 1 } } });
      let encoded = '';
      if (imageBytes) { const bytes = new Uint8Array(imageBytes); for (let i = 0; i < bytes.length; i += 8192) encoded += String.fromCharCode(...bytes.subarray(i, i + 8192)); }
      const response = await client.models.generateContent({ model, contents: imageBytes ? [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: btoa(encoded) } }] }] : prompt,
        config: { responseMimeType: 'application/json', responseSchema, temperature: 0.2, maxOutputTokens: 12000,
          ...(model === DEFAULT_GEMINI_STUDY_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}) } });
      const text = (response.text || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const data = JSON.parse(text);
      console.info('[AIModelRun]', { provider: 'gemini', operation, model, promptVersion: promptVersions[operation], durationMs: Date.now() - started,
        inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount,
        thinkingTokens: response.usageMetadata?.thoughtsTokenCount });
      return data;
    }catch(error){throw reportProviderError(error,{operation,model});}
  }
  async correction(image: ArrayBuffer, input: Parameters<AIService['recognizeCorrection']>[1]) {
    const raw = await this.json('correction',buildCorrectionPrompt(input), buildCorrectionSchema(), image);
    return { data: normalizeCorrectionResult(raw, input), model: this.model };
  }
  async select(input: Parameters<AIService['selectAnalysisQuestions']>[0]): Promise<AnalysisSelection> {
    const properties: Record<string, Schema> = { questionIds: strings };
    if (!input.question) properties.candidateFindings = candidateFindings;
    return this.json('analysis-selection', buildAnalysisSelectionPrompt(input),
      { type: Type.OBJECT, properties, required: Object.keys(properties) }, undefined, this.roles.selection);
  }
  async suggestWeaknesses(input: Parameters<AIService['suggestWeaknesses']>[0]): ReturnType<AIService['suggestWeaknesses']> {
    const prompt = buildWeaknessSuggestionPrompt(input);
    const raw = await this.json('weakness-suggestions', prompt, { type: Type.OBJECT, properties: { candidates: weaknessCandidateSchema }, required: ['candidates'] });
    const reasons = normalizeWeaknessCandidates(raw?.candidates, input.catalog ?? []);
    if (input.organizeNotes) return reasons.every(reason => reason.basis === 'user_explicit') ? reasons : [];
    return reasons.map(reason => input.reviewOfAttempt &&
      (reason.basis !== 'user_explicit' || !input.notes.trim()) ? { ...reason, basis: 'inferred_from_context', clue: '本次只有答案與既有訂正，請自行確認原因。' } : reason);
  }
  async report(input: Parameters<AIService['analyzeLearning']>[0]) {
    const interpretation = await this.json('analysis-report',buildAnalysisReportPrompt(input), { type: Type.OBJECT, properties: { overview: { type: Type.STRING }, findings: { type: Type.ARRAY, items: finding } }, required: ['overview', 'findings'] });
    return { interpretation, model: this.model };
  }
  async followup(input: Parameters<AIService['followupLearning']>[0]) {
    const model = this.roles.followup ?? this.model;
    const answer = await this.json('analysis-followup',buildAnalysisFollowupPrompt(input), { type: Type.OBJECT, properties: { text: { type: Type.STRING }, evidenceIds: strings }, required: ['text', 'evidenceIds'] }, undefined, model);
    return { answer, model };
  }
}
