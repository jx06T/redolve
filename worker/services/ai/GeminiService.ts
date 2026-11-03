import { AIService, TagResult } from './AIService';
import { normalizeRecognition } from '../../../src/types/learning';
import { TaxonomyNode } from '../../types';
import {
  buildClassificationPrompt,
  buildSdkResponseSchema,
  buildRestResponseSchema,
} from './prompts';
import { GeminiAnalysis } from './GeminiAnalysis';
import { GoogleGenAI } from '@google/genai';
import { reportProviderError,responseError } from './providerError';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

// 根據 Google AI Studio / Gemini API 官方支援之正式生產環境模型清單配置
// 重要規範 (DO NOT REMOVE/MODIFY):
// 舊版 1.5, 2.0, 2.5 等無 -latest 之固定版本模型標籤已被 Google 廢棄/無法使用。
// 模型備援與預設配置必須嚴格從 3.1、3.5 以及帶有 -latest 之模型中選取：
// 包括 gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-flash-lite-latest。
// 請確保此註記與模型清單維護於此，嚴禁再改回已不可用之舊版 1.5 / 2.0 / 2.5 固定版本模型。
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',

];

export class GeminiService implements AIService {
  private analysis: GeminiAnalysis;
  private correction: GeminiAnalysis;
  recognizeCorrection(image: ArrayBuffer, input: Parameters<AIService['recognizeCorrection']>[1]) { return this.correction.correction(image, input); }
  selectAnalysisQuestions(input: Parameters<AIService['selectAnalysisQuestions']>[0]) { return this.analysis.select(input); }
  analyzeLearning(input: Parameters<AIService['analyzeLearning']>[0]) { return this.analysis.report(input); }
  followupLearning(input: Parameters<AIService['followupLearning']>[0]) { return this.analysis.followup(input); }
  private apiKey: string;
  private preferredModel: string;
  private aiClient: GoogleGenAI | null = null;

  constructor(apiKey: string, modelName = 'gemini-3.1-flash-lite', analysisModel = 'gemini-3.1-pro-preview', correctionModel = 'gemini-3.1-pro-preview') {
    this.apiKey = apiKey;
    this.preferredModel = modelName;
    this.analysis = new GeminiAnalysis(apiKey, analysisModel);
    this.correction = new GeminiAnalysis(apiKey, correctionModel);
    if (apiKey) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey, httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } });
      } catch (err) {
        reportProviderError(err,{operation:'client-init',model:this.preferredModel});
      }
    }
  }

  async tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null> {
    if (!this.apiKey) {
      console.warn(
        '[GeminiService] Missing GEMINI_API_KEY. Please configure it in .dev.vars (local) or via `wrangler secret put GEMINI_API_KEY` (production).'
      );
      return null;
    }

    const base64Image = arrayBufferToBase64(imageBytes);
    const systemPrompt = buildClassificationPrompt(taxonomyTree);
    const sdkSchema = buildSdkResponseSchema(taxonomyTree);
    const restSchema = buildRestResponseSchema(taxonomyTree);

    // Collect all valid IDs from taxonomyTree for strict matching
    const validTopicIds = new Set<string>();
    const collectIds = (nodes: TaxonomyNode[]) => {
      for (const node of nodes) {
        validTopicIds.add(node.id);
        if (node.children) collectIds(node.children);
      }
    };
    collectIds(taxonomyTree);

    const sanitizeResult = (parsed: any): TagResult => {
      const learning = normalizeRecognition(parsed);
      const rawTopic = parsed?.topic_id;
      let matchedTopicId: string | null = null;
      if (typeof rawTopic === 'string' && rawTopic.trim() && rawTopic !== 'null') {
        const clean = rawTopic.trim();
        if (validTopicIds.has(clean)) {
          matchedTopicId = clean;
        }
      }

      return {
        topic_id: matchedTopicId,
        keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.map(String).filter(Boolean) : [],
        keyword_tokens: Array.isArray(parsed?.keyword_tokens) ? parsed.keyword_tokens.map(String).filter(Boolean) : [],
        ocr_text: typeof parsed?.ocr_text === 'string' ? parsed.ocr_text.trim() : '',
        question_type: learning.content.questionType,
        options: learning.content.options,
        original_answer: learning.personal.originalAnswer,
        correct_answer: learning.content.correctAnswer,
        error_reasons: learning.personal.errorReasons.map(reason => reason.text),
      };
    };

    // 將首選模型放在陣列第一位，並過濾掉重複項
    const modelsToTry = [
      this.preferredModel,
      ...CANDIDATE_MODELS.filter((m) => m !== this.preferredModel),
    ];
    // One SDK attempt plus one REST fallback; no hidden SDK retry multiplication.
    let remainingCalls = 2;

    // Attempt 1: Using official @google/genai SDK with dynamic Structured Outputs from real DB taxonomy
    if (this.aiClient) {
      for (const model of modelsToTry) {
        if (remainingCalls <= 1) break;
        remainingCalls--;
        try {
          const response = await this.aiClient.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: base64Image,
                    },
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: sdkSchema as any,
              temperature: 0.1,
            },
          });

          const responseText = response.text;
          if (responseText) {
            const cleaned = cleanJsonString(responseText);
            const parsed = JSON.parse(cleaned);
            return sanitizeResult(parsed);
          }
        } catch (err: any) {
          const failure=reportProviderError(err,{operation:'recognition-sdk',model});
          if(!failure.allowFallback)throw failure;
          // Try next candidate model
        }
      }
    }

    // Attempt 2: Direct REST Fetch Fallback with Native Structured Outputs Schema from real DB taxonomy
    const restPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: restSchema,
        temperature: 0.1,
      },
    };

    for (const model of this.aiClient ? modelsToTry.slice(1) : modelsToTry) {
      if (remainingCalls-- <= 0) break;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(restPayload),
          signal: AbortSignal.timeout(20000),
        });

        if (response.ok) {
          const data: any = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const cleaned = cleanJsonString(rawText);
            const parsed = JSON.parse(cleaned);
            return sanitizeResult(parsed);
          }
        } else throw await responseError(response);
      } catch (err) {
        const failure=reportProviderError(err,{operation:'recognition-rest',model});
        if(!failure.allowFallback)throw failure;
      }
    }

    return null;
  }
}
