import { AIService, TagResult } from './AIService';
import { TaxonomyNode } from '../../types';
import {
  buildClassificationPrompt,
  buildSdkResponseSchema,
  buildRestResponseSchema,
} from './prompts';
import { GoogleGenAI } from '@google/genai';

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
  private apiKey: string;
  private preferredModel: string;
  private aiClient: GoogleGenAI | null = null;

  constructor(apiKey: string, modelName = 'gemini-3.1-flash-lite') {
    this.apiKey = apiKey;
    this.preferredModel = modelName;
    if (apiKey) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn('[GeminiService] Failed to initialize GoogleGenAI client:', err);
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
      };
    };

    // 將首選模型放在陣列第一位，並過濾掉重複項
    const modelsToTry = [
      this.preferredModel,
      ...CANDIDATE_MODELS.filter((m) => m !== this.preferredModel),
    ];

    // Attempt 1: Using official @google/genai SDK with dynamic Structured Outputs from real DB taxonomy
    if (this.aiClient) {
      for (const model of modelsToTry) {
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
          console.warn(`[GeminiService] SDK call with model "${model}" failed:`, err?.message || err);
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

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(restPayload),
        });

        if (response.ok) {
          const data: any = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const cleaned = cleanJsonString(rawText);
            const parsed = JSON.parse(cleaned);
            return sanitizeResult(parsed);
          }
        } else {
          const errText = await response.text();
          console.warn(`[GeminiService] REST Model "${model}" failed (HTTP ${response.status}):`, errText);
        }
      } catch (err) {
        console.warn(`[GeminiService] REST Network error with model "${model}":`, err);
      }
    }

    return null;
  }
}