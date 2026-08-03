import { AIService, TagResult } from './AIService';
import { TaxonomyNode } from '../../types';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class GeminiService implements AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async tagProblem(imageBytes: ArrayBuffer, taxonomyTree: TaxonomyNode[]): Promise<TagResult | null> {
    if (!this.apiKey) {
      console.warn('[GeminiService] Missing GEMINI_API_KEY, falling back.');
      return null;
    }

    const base64Image = arrayBufferToBase64(imageBytes);
    const systemPrompt = `你是一個專業的高中學測/分科測驗錯題AI分析助手。
請閱讀圖片中的題目，並對照以下課綱分類樹（Taxonomy Tree）：
${JSON.stringify(taxonomyTree, null, 2)}

請分析此題目，輸出一個嚴格格式的 JSON 物件，包含以下欄位：
- topic_id: 最匹配的課綱單元 ID（如 'math-probability' 或 'math-bayes'）
- keywords: 3至5個相關學術關鍵字陣列（中文，如 ["條件機率", "貝氏定理"]）
- keyword_tokens: 拆解為細粒度單詞與片語的檢索 token 陣列（如 ["機率", "條件", "貝氏", "定理", "條件機率"]）

僅輸出 JSON，不要加入 Markdown 標記或額外解釋。`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;

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
            const parsed = JSON.parse(rawText);
            return {
              topic_id: parsed.topic_id ?? 'math-real-num',
              keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
              keyword_tokens: Array.isArray(parsed.keyword_tokens) ? parsed.keyword_tokens : [],
            };
          }
        }
      } catch (err) {
        console.warn(`[GeminiService] Attempt ${attempt + 1} failed:`, err);
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }

    // 最終失敗時靜默降級
    return null;
  }
}
