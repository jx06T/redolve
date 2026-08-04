import { AIService, TagResult } from './AIService';
import { TaxonomyNode } from '../../types';
import { buildClassificationPrompt } from './prompts';
import { GoogleGenAI, Type } from '@google/genai';

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

/**
 * Standard structured output schema for problem classification.
 */
const CLASSIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description: '高中學科科目名稱 (例如: 數學, 物理, 化學, 生物, 地科)',
    },
    chapter: {
      type: Type.STRING,
      description: '所屬大章節名稱',
    },
    topic_id: {
      type: Type.STRING,
      description: '精確對應課綱單元清單中的單元 ID (例如: math-bayes, physics-kinematics)',
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3至5個核心概念關鍵字 (例如: ["貝氏定理", "條件機率", "樣本空間"])',
    },
    keyword_tokens: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '繁簡中文與符號切分搜尋 tokens (例如: ["機率", "條件", "貝氏", "定理"])',
    },
    problem_text_summary: {
      type: Type.STRING,
      description: '題目題幹重點與考點簡要摘要',
    },
  },
  required: ['topic_id', 'keywords', 'keyword_tokens'],
};

// Recommended models ranked by performance, speed and latency
const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
];

export class GeminiService implements AIService {
  private apiKey: string;
  private preferredModel: string;
  private aiClient: GoogleGenAI | null = null;

  constructor(apiKey: string, modelName = 'gemini-2.5-flash') {
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

    const modelsToTry = [
      this.preferredModel,
      ...CANDIDATE_MODELS.filter((m) => m !== this.preferredModel),
    ];

    // Attempt 1: Using official @google/genai SDK with Structured Outputs
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
              responseSchema: CLASSIFICATION_SCHEMA,
              temperature: 0.1,
            },
          });

          const responseText = response.text;
          if (responseText) {
            const cleaned = cleanJsonString(responseText);
            const parsed = JSON.parse(cleaned);
            return {
              topic_id: parsed.topic_id ?? 'math-real-num',
              keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
              keyword_tokens: Array.isArray(parsed.keyword_tokens) ? parsed.keyword_tokens : [],
            };
          }
        } catch (err: any) {
          console.warn(`[GeminiService] SDK call with model "${model}" failed:`, err?.message || err);
          // Try next candidate model
        }
      }
    }

    // Attempt 2: Direct REST Fetch Fallback with Native Structured Outputs Schema
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
        response_schema: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING' },
            chapter: { type: 'STRING' },
            topic_id: { type: 'STRING' },
            keywords: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            keyword_tokens: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            problem_text_summary: { type: 'STRING' },
          },
          required: ['topic_id', 'keywords', 'keyword_tokens'],
        },
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
            return {
              topic_id: parsed.topic_id ?? 'math-real-num',
              keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
              keyword_tokens: Array.isArray(parsed.keyword_tokens) ? parsed.keyword_tokens : [],
            };
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
