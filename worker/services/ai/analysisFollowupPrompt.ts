import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisFollowupPrompt(input: Parameters<AIService['followupLearning']>[0]) { return `${rules}
任務：回答使用者針對這份報告的追問，延續 history。stats 與題目版本固定在報告產生時，不假裝是最新資料。若追問超過資料範圍直接說明；具體題目推論必須附 evidenceIds，可引用一至多題。
只輸出 {"text":"回答", "evidenceIds":["id"]}。
資料：${JSON.stringify(input)}`; }
