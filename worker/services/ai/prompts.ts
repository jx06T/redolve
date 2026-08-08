import { TaxonomyNode } from '../../types';
import { Type } from '@google/genai';

/**
 * Extracts all valid topic IDs from the taxonomy tree.
 */
export function extractAllTopicIds(tree: TaxonomyNode[]): string[] {
  const ids: string[] = [];

  function traverse(nodes: TaxonomyNode[]) {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return ids;
}

/**
 * Extracts only leaf-node topic IDs (nodes with no children).
 * These are the most specific classification targets for the AI.
 * Using only leaf IDs prevents the AI from assigning root/chapter-level
 * nodes (e.g. "math", "math-trig") which cannot be filtered by chapter.
 */
export function extractLeafTopicIds(tree: TaxonomyNode[]): string[] {
  const ids: string[] = [];

  function traverse(nodes: TaxonomyNode[]) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      } else {
        ids.push(node.id);
      }
    }
  }

  traverse(tree);
  return ids;
}

/**
 * Formats a taxonomy tree into a compact, hierarchical list of IDs and labels
 * to reduce token count and improve Gemini classification precision.
 */
export function formatTaxonomyTreeForPrompt(tree: TaxonomyNode[]): string {
  const lines: string[] = [];

  function traverse(nodes: TaxonomyNode[], prefix = '') {
    for (const node of nodes) {
      lines.push(`${prefix}- [ID: "${node.id}"] ${node.label}`);
      if (node.children && node.children.length > 0) {
        traverse(node.children, prefix + '  ');
      }
    }
  }

  traverse(tree);
  return lines.join('\n');
}

/**
 * Builds the system prompt for Gemini visual classification of high-school exam problems
 * using the real database taxonomy tree.
 */
export function buildClassificationPrompt(taxonomyTree: TaxonomyNode[]): string {
  const treeOutline = formatTaxonomyTreeForPrompt(taxonomyTree);

  return `你是一個專業的台灣高中學測與分科測驗錯題 AI 分析助手。
請仔細閱讀圖片中的題目內容（包含文字、數學公式符號、幾何圖形、物理/化學/生物圖表或情境），並對照以下系統資料庫中的完整課綱科目與章節清單（Taxonomy Tree）：

${treeOutline}

請進行精準分析與分類，並遵守以下嚴格規則：
1. 嚴格對照上述課綱清單中存在的單元 ID（topic_id）。
2. 若題目明確屬於課綱中的某科目章節，請輸出該單元最精確的 ID（例如 "math-bayes", "physics-kinematics", "chem-acid-base", "bio-genetics" 等）。
3. 若圖片內容並非學科錯題（例如生活照、風景、塗鴉、模糊無法辨識或非台灣高中學測/分科課綱範疇），"topic_id" 請務必輸出 null，絕對不要隨意指派不相干的課綱分類。
4. 提取 3 至 5 個核心概念關鍵字 (keywords) 與繁簡中文/英文切詞搜尋索引 (keyword_tokens)。
   特別注意：若題目為英文科目（例如高中英文、多益、托福、文法、克漏字、篇章結構、閱讀測驗、單字片語題等），keywords 請務必直接提取題幹與選項中出現的核心英文單字、重要片語、文法句型或特定考點術語（例如: ["superb", "although", "relative clause", "concession"]，絕對不要僅輸出泛稱中文如 "單字題"、"文法題"），以利學生以英文單字快速搜尋錯題。
5. 盡可能完整地辨識出圖片中的「題目原文 (包含數字與中英文字)」，並將這段純文字輸出到 ocr_text 欄位中，以供未來的全文搜尋使用。若圖片過於模糊，可輸出空字串 ""。

請輸出嚴格 JSON 格式：
{
  "topic_id": string | null,
  "keywords": string[],
  "keyword_tokens": string[],
  "ocr_text": string
}`;
}

/**
 * Dynamically builds the SDK responseSchema with strict enum validation against database leaf topic IDs.
 * Only leaf nodes (most specific units) are included in the enum to prevent the AI from
 * assigning root/chapter-level IDs that break chapter-level filtering.
 */
export function buildSdkResponseSchema(taxonomyTree: TaxonomyNode[]) {
  const leafTopicIds = extractLeafTopicIds(taxonomyTree);

  return {
    type: Type.OBJECT,
    properties: {
      topic_id: {
        type: Type.STRING,
        description: '精確對應課綱單元清單中最末層單元 ID，若非學科題目或無法分類則輸出 null',
        nullable: true,
        ...(leafTopicIds.length > 0 ? { enum: leafTopicIds } : {}),
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
      ocr_text: {
        type: Type.STRING,
        description: '圖片中的題目完整文字內容 (OCR)',
      },
    },
    required: ['keywords', 'keyword_tokens', 'ocr_text'],
  };
}

/**
 * Dynamically builds the REST response_schema with strict enum validation against database leaf topic IDs.
 * Only leaf nodes (most specific units) are included in the enum to prevent the AI from
 * assigning root/chapter-level IDs that break chapter-level filtering.
 */
export function buildRestResponseSchema(taxonomyTree: TaxonomyNode[]) {
  const leafTopicIds = extractLeafTopicIds(taxonomyTree);

  return {
    type: 'OBJECT',
    properties: {
      topic_id: {
        type: 'STRING',
        nullable: true,
        ...(leafTopicIds.length > 0 ? { enum: leafTopicIds } : {}),
      },
      keywords: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      keyword_tokens: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      ocr_text: {
        type: 'STRING',
      },
    },
    required: ['keywords', 'keyword_tokens', 'ocr_text'],
  };
}