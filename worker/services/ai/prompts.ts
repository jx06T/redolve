import { TaxonomyNode } from '../../types';
import { Type } from '@google/genai';

/**
 * Extracts all leaf/unit topic IDs from the taxonomy tree.
 */
export function extractAllTopicIds(tree: TaxonomyNode[]): string[] {
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
請閱讀圖片中的題目內容（包含文字、數學符號、幾何圖形、化學式或物理情境），並對照以下學測/分科測驗課綱單元清單（Taxonomy Tree）：

${treeOutline}

請精準分析此題目，輸出一個嚴格格式的 JSON 物件，不得包含 Markdown 標記（如 \`\`\`json）或額外文字說明。
JSON 格式必須包含以下欄位：
1. "topic_id": string (必須精確對應上述課綱中最適當的單元 ID，例如 "math-bayes", "math-matrix", "physics-kinematics" 等)
2. "keywords": string[] (3至5個中文核心學術概念關鍵字，例如 ["貝氏定理", "條件機率", "樣本空間"])
3. "keyword_tokens": string[] (拆解為細粒度單詞與片語的搜尋 token 陣列，例如 ["機率", "條件", "貝氏", "定理", "條件機率", "樣本空間"])`;
}

/**
 * Dynamically builds the SDK responseSchema with strict enum validation against database topic IDs.
 */
export function buildSdkResponseSchema(taxonomyTree: TaxonomyNode[]) {
  const topicIds = extractAllTopicIds(taxonomyTree);

  return {
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
        description: '精確對應課綱單元清單中的單元 ID',
        ...(topicIds.length > 0 ? { enum: topicIds } : {}),
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
}

/**
 * Dynamically builds the REST response_schema with strict enum validation against database topic IDs.
 */
export function buildRestResponseSchema(taxonomyTree: TaxonomyNode[]) {
  const topicIds = extractAllTopicIds(taxonomyTree);

  return {
    type: 'OBJECT',
    properties: {
      subject: { type: 'STRING' },
      chapter: { type: 'STRING' },
      topic_id: {
        type: 'STRING',
        ...(topicIds.length > 0 ? { enum: topicIds } : {}),
      },
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
  };
}
