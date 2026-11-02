import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisSelectionPrompt(input: Parameters<AIService['selectAnalysisQuestions']>[0]) { return `${rules}
任務：查看全科統計與全部可用題文目錄，挑選最多 30 題讀取完整資料。涵蓋不同單元、反覆錯誤與相似題的比較，也涵蓋有改善的依據；不要只挑題數多的單元。
若有 question，優先挑與追問相關的題目。只能從 catalog.id 選擇，不足就少選，不重複。
只輸出 {"questionIds":["id"]}。
資料：${JSON.stringify(input)}`; }
