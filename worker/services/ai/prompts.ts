import { TaxonomyNode } from '../../types';

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
 * Builds the system prompt for Gemini visual classification of high-school exam problems.
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
