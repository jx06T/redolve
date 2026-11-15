import type { AIService } from './AIService';
import { analysisPromptRules as rules } from './analysisPromptRules';

export function buildAnalysisReportPrompt(input: Parameters<AIService['analyzeLearning']>[0]) { return `${rules}
任務：撰寫整科的全局報告。先用 overview 綜合說明目前能確定的整體狀況、變化與資料限制，接著 findings 依有效資料量組織成「值得注意的考點、跨題可能混淆、趨勢與下一步」等有意義段落，不固定三項、不湊數或重複。
overview 通常二至四句；每項 explanation 通常二至四句，依序說明觀察、必要的不確定處及一項可執行的複習動作。不要逐項抄錄統計表、重複總覽或輸出完整詳解。同一證據若支持同一結論，合併敘述。篇幅隨新證據增加，不能只為填滿各分類而增加段落。
每項先寫從作答、訂正或本人採用的錯因能直接觀察的事，再寫有待核對的推測。單題只能支持單題觀察或待驗證假設，跨題模式須引用多道有關證據。只有一筆實質變化時簡短交代新證據；資料不足時 findings 可以是空陣列。
candidateFindings 是選題階段從短預覽提出的假設。用詳細證據核對，可以保留、縮小或捨棄候選；反例應減弱推論。候選文字本身不能當作證據。
每個 finding 依證據標記 kind：
- unit_performance 說明單元重作表現與優先複習方向。metricIds 必須包含相應的 stats.units.id；若有代表題，evidenceIds 引用所列單元中的題，並可提供練習。交代作答次數和不同題數的差別；兩期樣本不同時優先解讀同題比較。只有一題反覆答錯時可建議重作該題，避免推論整個單元都有困難。
- error_pattern 說明具體錯法或待確認的原因。evidenceIds 至少引用一道有關題目。單元名稱或考點標籤本身不足以支持此類觀察。
- other 適用於其餘觀察，仍須有 evidenceIds 或 metricIds 依據。全科統計可用 metricIds:["subject"]。
單元數據若能改變複習優先順序，即使沒有證據歸納具體錯法，也應列入 unit_performance。只有收錄分布或樣本太少時，可在總覽交代資料限制。
title 使用簡短單元名或具體錯法短語，例如「忽略參數範圍限制」。詳細依據與建議放在 explanation。
若有 stats.cycle：baseline 是首次基準，不能聲稱已進步；cycle 則比較 previousReport 的觀察與本階段新資料，說明哪些有新證據、哪些仍無法判斷，避免重述整份舊報告。兩階段長度與題目組成可能不同，不可直接以作答總數或答對比例推論能力變化。
階段作答統計以伺服器收到原始作答的時間歸屬，可能含較早的離線作答；correctedAttempts 是結果更正，不是額外一次練習。題庫數字是截止時的全科現況。previousReport 詳細內容到期時，只能比較保留的數字。前份報告的文字不是本次題目證據，引用 ID 仍須來自本次 evidence。
practiceQuestionIds 最多 5 題，只能從該項 evidenceIds 挑選。優先選能實際驗證該項觀察、題文可用且有相關訂正或反覆作答紀錄的題。沒有適合重作的題目時回傳空陣列。用 explanation 說明重作的目的。
只輸出 {"overview":"整科綜合解讀", "findings":[{"kind":"unit_performance","title":"單元名稱","explanation":"內容","evidenceIds":[],"metricIds":["單元 ID"],"practiceQuestionIds":[]}]}。
資料：${JSON.stringify(input)}`; }
