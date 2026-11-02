import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisReportPrompt(input: Parameters<AIService['analyzeLearning']>[0]) { return `${rules}
任務：撰寫整科的全局報告。先用 overview 綜合說明目前能確定的整體狀況、變化與資料限制，接著 findings 依有效資料量組織成「值得注意的考點、跨題可能混淆、趨勢與下一步」等有意義段落，不固定三項、不湊數或重複。
每個 finding 必須至少有 evidenceIds 或 metricIds 依據。具體概念／錯因至少引用一題，可同時引用多題；只有統計的全科觀察可用 metricIds:["subject"]，單元則用 stats.units.id。解釋推薦原因與如何複習。
若有 stats.cycle：baseline 是首次基準，不能聲稱已進步；cycle 則比較 previousReport 的觀察與本階段新資料，說明哪些有新證據、哪些仍無法判斷，避免重述整份舊報告。兩階段長度與題目組成可能不同，不可直接以作答總數或答對比例推論能力變化。
階段作答統計以伺服器收到原始作答的時間歸屬，可能含較早的離線作答；correctedAttempts 是結果更正，不是額外一次練習。題庫數字是截止時的全科現況。previousReport 詳細內容到期時，只能比較保留的數字。前份報告的文字不是本次題目證據，引用 ID 仍須來自本次 evidence。
只輸出 {"overview":"整科綜合解讀", "findings":[{"title":"段落標題","explanation":"內容","evidenceIds":["id"],"metricIds":["subject"]}]}。
資料：${JSON.stringify(input)}`; }
