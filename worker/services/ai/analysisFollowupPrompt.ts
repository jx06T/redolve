import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisFollowupPrompt(input: Parameters<AIService['followupLearning']>[0]) { return `${rules}
任務：回答使用者針對這份報告的追問，延續 history。stats 與題目版本固定在報告產生時，不假裝是最新資料。若追問超過資料範圍直接說明；具體題目推論必須附 evidenceIds，可引用一至多題。
先直接回答這次問題，通常一至三個短段落。使用者要求詳細說明時才展開；不重述整份報告、不使用制式開場或道歉。使用者質疑結論時先核對已有證據，若原結論證據不足就明確下修。沒有證據時指出缺少的資料，不猜測新的錯因。
本流程只能解釋報告，不能宣稱已修改答案、弱點或安排練習。evidenceIds 僅列本次回答真正使用的題目，純統計回答可回傳空陣列。
只輸出 {"text":"回答", "evidenceIds":["id"]}。
資料：${JSON.stringify(input)}`; }
