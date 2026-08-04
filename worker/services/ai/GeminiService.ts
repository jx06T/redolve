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
  // Remove markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

export class GeminiService implements AIService {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null> {
    if (!this.apiKey) {
      console.warn('[GeminiService] Missing GEMINI_API_KEY. Please configure it in .dev.vars (local) or via `wrangler secret put GEMINI_API_KEY` (production).');
      return null;
    }

    const base64Image = arrayBufferToBase64(imageBytes);
    const systemPrompt = buildClassificationPrompt(taxonomyTree);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

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

    // 3 次指數退避重試 (1s, 2s, 4s)
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= 3; attempt++) {
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
          console.warn(`[GeminiService] HTTP ${response.status} Error on attempt ${attempt + 1}:`, errText);
        }
      } catch (err) {
        console.warn(`[GeminiService] Network/parsing error on attempt ${attempt + 1}:`, err);
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }

    return null;
  }
}
