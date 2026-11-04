import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisSelectionPrompt(input: Parameters<AIService['selectAnalysisQuestions']>[0]) {
  const catalog = input.catalog.map(entry => ({ ...entry,
    errorTags: entry.errorTags?.filter(tag => tag.reasonIndex < (entry.errorReasons?.length ?? 0)) }));
  return `${rules}
任務：查看全科統計與全部可用題文目錄，挑選最多 30 題讀取完整資料。涵蓋不同單元、反覆錯誤與相似題的比較，也涵蓋有改善的依據；不要只挑題數多的單元。
優先查看有訂正摘要、本人填寫或採用錯因的題目。相同錯誤類型可挑不同單元的代表題與反例，並用詳細資料核對。若某類只有未採用的 AI 建議，挑題是為了驗證假設。
若有 question，優先挑與追問相關的題目。只能從 catalog.id 選擇，不足就少選，不重複。
若有 stats.cycle，這是階段總結；兼顧 changes 所列新增、更新、重作題目，與 previousReport 的建議相關的題目。前份報告僅供比較，引用仍只能使用本次 catalog 的 ID。
${input.question ? '只輸出 {"questionIds":["id"]}。' : `可從目錄提出最多 12 項待驗證的候選問題，不足時回傳空陣列。topic 限 160 字，rationale 限 600 字，每項至少引用一題且只能引用已選入 questionIds 的題目。候選不是結論。
只輸出 {"questionIds":["id"],"candidateFindings":[{"topic":"主題","rationale":"為什麼值得核對","supportingQuestionIds":["id"]}]}。`}
資料：${JSON.stringify({ ...input, catalog })}`;
}
