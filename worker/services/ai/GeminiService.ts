import { AIService, TagResult } from './AIService';
import { TaxonomyNode } from '../../types';
import { buildClassificationPrompt } from './prompts';

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

const CANDIDATE_MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash',
  'gemini-1.5-pro-latest',
];

export class GeminiService implements AIService {
  private apiKey: string;
  private preferredModel: string;

  constructor(apiKey: string, modelName = 'gemini-1.5-flash-latest') {
    this.apiKey = apiKey;
    this.preferredModel = modelName;
  }

  async tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null> {
    if (!this.apiKey) {
      console.warn('[GeminiService] Missing GEMINI_API_KEY. Please configure it in .dev.vars (local) or via `wrangler secret put GEMINI_API_KEY` (production).');
      return null;
    }

    const base64Image = arrayBufferToBase64(imageBytes);
    const systemPrompt = buildClassificationPrompt(taxonomyTree);

    const payload = {
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
        temperature: 0.2,
      },
    };

    const modelsToTry = [
      this.preferredModel,
      ...CANDIDATE_MODELS.filter((m) => m !== this.preferredModel),
    ];

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
          console.warn(`[GeminiService] Model "${model}" failed (HTTP ${response.status}):`, errText);
          // If 404 (model not found on key/region), try next candidate model immediately
          if (response.status === 404) {
            continue;
          }
        }
      } catch (err) {
        console.warn(`[GeminiService] Network error with model "${model}":`, err);
      }
    }

    return null;
  }
}
