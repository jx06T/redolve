import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisReportPrompt(input: Parameters<AIService['analyzeLearning']>[0]) { return `${rules}
任務：撰寫整科的全局報告。先用 overview 綜合說明目前能確定的整體狀況、變化與資料限制，接著 findings 依有效資料量組織成「值得注意的考點、跨題可能混淆、趨勢與下一步」等有意義段落，不固定三項、不湊數或重複。
每個 finding 必須至少有 evidenceIds 或 metricIds 依據。具體概念／錯因至少引用一題，可同時引用多題；只有統計的全科觀察可用 metricIds:["subject"]，單元則用 stats.units.id。解釋推薦原因與如何複習。
只輸出 {"overview":"整科綜合解讀", "findings":[{"title":"段落標題","explanation":"內容","evidenceIds":["id"],"metricIds":["subject"]}]}。
資料：${JSON.stringify(input)}`; }
