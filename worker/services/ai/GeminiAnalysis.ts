import { buildAnalysisSelectionPrompt, buildAnalysisReportPrompt, buildAnalysisFollowupPrompt } from './analysisPrompts';
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type { AIService } from './AIService';
import { buildCorrectionPrompt, buildCorrectionSchema } from './correctionPrompts';
import { normalizeRecognition, validateLearningData } from '../../../src/types/learning';
import { reportProviderError } from './providerError';

const strings = { type: Type.ARRAY, items: { type: Type.STRING } };
const finding = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, explanation: { type: Type.STRING }, evidenceIds: strings, metricIds: strings },
  required: ['title', 'explanation', 'evidenceIds', 'metricIds'] };


/** Separate client and model: recognition retains its existing timeout and model policy. */
export class GeminiAnalysis {
  constructor(private apiKey: string, private model = 'gemini-3.1-pro-preview') {}
  private async json(operation:string,prompt: string, responseSchema: Schema, imageBytes?: ArrayBuffer) {
    if (!this.apiKey) throw Error('AI unavailable');
    try{
      const client = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { timeout: 90000, retryOptions: { attempts: 1 } } });
      let encoded = '';
      if (imageBytes) { const bytes = new Uint8Array(imageBytes); for (let i = 0; i < bytes.length; i += 8192) encoded += String.fromCharCode(...bytes.subarray(i, i + 8192)); }
      const response = await client.models.generateContent({ model: this.model, contents: imageBytes ? [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: btoa(encoded) } }] }] : prompt,
        config: { responseMimeType: 'application/json', responseSchema, temperature: 0.2, maxOutputTokens: 12000 } });
      const text = (response.text || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      return JSON.parse(text);
    }catch(error){throw reportProviderError(error,{operation,model:this.model});}
  }
  async correction(image: ArrayBuffer, input: Parameters<AIService['recognizeCorrection']>[1]) {
    const raw = await this.json('correction',buildCorrectionPrompt(input), buildCorrectionSchema(), image);
    const data = normalizeRecognition(raw);
    data.content = { ...data.content, ocrText: input.current.content.ocrText || data.content.ocrText,
      questionType: input.current.content.questionType === 'unknown' ? data.content.questionType : input.current.content.questionType,
      options: input.current.content.options.length ? input.current.content.options : data.content.options,
      correctAnswer: data.content.correctAnswer || input.current.content.correctAnswer };
    if (input.saved || !data.personal.originalAnswer) data.personal.originalAnswer = input.current.personal.originalAnswer;
    data.personal.correctionSummary = typeof raw.correction_summary === 'string' ? raw.correction_summary.slice(0, 6000) : '';
    return { data: validateLearningData(data), model: this.model };
  }
  async select(input: Parameters<AIService['selectAnalysisQuestions']>[0]): Promise<string[]> {
    const result = await this.json('analysis-selection',buildAnalysisSelectionPrompt(input), { type: Type.OBJECT, properties: { questionIds: strings }, required: ['questionIds'] });
    if (!Array.isArray(result?.questionIds) || result.questionIds.length > 30 || result.questionIds.some((id: unknown) => typeof id !== 'string' || !input.catalog.some(q => q.id === id)))
      throw Error('Invalid retrieval IDs');
    return [...new Set<string>(result.questionIds)];
  }
  async report(input: Parameters<AIService['analyzeLearning']>[0]) {
    const interpretation = await this.json('analysis-report',buildAnalysisReportPrompt(input), { type: Type.OBJECT, properties: { overview: { type: Type.STRING }, findings: { type: Type.ARRAY, items: finding } }, required: ['overview', 'findings'] });
    return { interpretation, model: this.model };
  }
  async followup(input: Parameters<AIService['followupLearning']>[0]) {
    const answer = await this.json('analysis-followup',buildAnalysisFollowupPrompt(input), { type: Type.OBJECT, properties: { text: { type: Type.STRING }, evidenceIds: strings }, required: ['text', 'evidenceIds'] });
    return { answer, model: this.model };
  }
}
