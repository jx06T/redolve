export interface Weakness { id: string; title: string; target: string; subjectId: string }
export interface WeaknessReview { ids: string[]; version: number }
export interface AttemptReasonCandidate { id: string; text: string }
export type WeaknessBasis = 'user_explicit' | 'observed_steps' | 'inferred_from_context';
export interface WeaknessTrend extends Weakness {
  questions: number; confirmedAttempts: number; recurringAttempts: number; sameQuestionCorrect: number; delayedCorrect: number; needsReview: number;
  evidenceQuestionIds: string[];
}
export interface WeaknessAttemptEvidence { attemptId: string; weaknessIds: string[]; answeredAt: string }

// Stable IDs are shared by correction, practice and reports. Titles can be refined independently.
const math = [
  ['domain', '漏查函數的定義域', '先列出函數允許的輸入', '定義域 對數 真數 根式 分母'],
  ['range', '漏用值域排除不可能的答案', '用值域檢查候選值', '值域 最大值 最小值'],
  ['given-parameter', '漏用題目已給的參數條件', '在關鍵變形時套用已給的正負或範圍', '參數 不等式 正負'],
  ['zero-factor', '約去未知因子時漏掉零值情況', '約去因子前保留其為零的情況', '因式 約分 方程'],
  ['extraneous-root', '平方後漏驗增根', '平方後將候選解代回原式', '平方 增根 根式'],
  ['negative-inequality', '乘除已知負數時未反轉不等號', '因子已知為負時反轉不等號', '不等式 負數 正負 參數'],
  ['unknown-sign', '乘除符號未知的式子時漏分情況', '依因子為正、負或零分別處理', '不等式 正負 參數'],
  ['absolute-value', '去掉絕對值時漏按內部正負分段', '找分界點並逐段寫出式子', '絕對值 分段'],
  ['interval-endpoint', '不等式解集的端點取捨錯誤', '確認端點有定義並判斷開閉區間', '不等式 端點 區間'],
  ['decreasing', '同取遞減函數時未反轉比較方向', '確認單調區間並正確比較大小', '遞減 單調 不等式'],
  ['horizontal-shift', '函數圖形的水平平移方向判反', '從自變數的代換判斷平移方向', '平移 圖形 函數'],
  ['composition', '複合函數的代入順序顛倒', '先算內層再代入外層', '複合 函數'],
  ['trig-period', '改變三角函數的角頻率後算錯週期', '由角頻率求週期', '三角 週期 sin cos'],
  ['trig-solutions', '解三角方程時漏列區間內的其他解', '用對稱與週期列齊解', '三角 方程 sin cos'],
  ['half-angle', '使用半角公式時未依象限判定正負', '用半角所在象限決定根號前符號', '半角 象限 三角'],
  ['dot-expansion', '展開內積時漏掉交叉項', '用分配律寫全內積各項', '內積 分配律 向量'],
  ['dot-angle', '由內積正負判斷夾角時判反', '由非零向量內積判斷夾角類型', '內積 夾角 向量'],
  ['scalar-projection', '求純量投影時漏除方向向量長度', '用方向向量長度正規化投影', '投影 內積 向量'],
  ['cosine-side', '用餘弦定理時配錯邊與對角', '在不同標記下配對邊和對角', '餘弦 三角形'],
  ['similar-sides', '列相似三角形比例時配錯對應邊', '對齊頂點後列出對應邊長比', '相似 三角形 比例'],
  ['double-count', '把同一結果的不同順序重複算入', '辨別結果是否區分順序', '排列 組合 計數'],
  ['exclusive-independent', '把互斥事件當成獨立事件', '分辨互斥與獨立', '機率 互斥 獨立'],
  ['conditional-sample', '算條件機率時仍使用原樣本空間', '在已知條件下重選分母', '條件機率 樣本 貝氏'],
  ['binomial-assumptions', '在試驗條件不符時套用二項分布', '檢查獨立且成功機率固定', '二項 試驗 機率'],
  ['variance-scale', '把資料的縮放倍數直接套到變異數', '區分標準差與變異數的縮放', '變異數 標準差 統計'],
  ['sequence-sum', '混淆數列通項與前幾項和', '以相鄰部分和的差求通項並檢查首項', '數列 級數 部分和'],
  ['sequence-index', '寫數列通項時把首項索引算偏', '代入第一個索引核對首項', '數列 通項 首項'],
  ['single-example', '用單一特例證明全稱命題', '區分個案驗證與全稱證明', '命題 證明 反例'],
  ['condition-direction', '把必要條件當成充分條件', '分別驗證兩個推論方向', '必要 充分 命題'],
  ['case-boundary', '分類討論時漏掉交界的情況', '列齊所有情況並檢查交界值', '分類 討論 交界'],
] as const;

export const mathWeaknesses = math.map(([code, title, target, keywords]) => ({ id: `math-${code}`, title, target, subjectId: 'math', keywords: keywords.split(' ') }));
