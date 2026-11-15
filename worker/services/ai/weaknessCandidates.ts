import { Type } from '@google/genai';
import type { ErrorReason } from '../../../src/types/learning';
import type { Weakness } from '../../../src/types/weakness';

export const candidateRules = `在同一次回應內依序完成兩步，只輸出最後的結構化候選。
第一步先依本人明說的內容與可見作答，寫出有證據的具體知識缺口、混淆關係或錯誤操作，以及可用異題驗證的動作，最多四項。catalog 只在第二步使用。不得從考點、答錯或訂正時使用的公式推斷原先作答。缺乏足以指向具體失誤的線索時回傳空陣列。
第二步再逐項比對 catalog。只有既有項目描述同一個具體知識缺口、混淆關係或錯誤操作時才附上該 weaknessId。主題相同、措辭相近或只有上位概念都不足以配對。沒有相同項目或 catalog 為空時，保留具體候選並把 weaknessId 設為 null。
basis 使用 user_explicit（本人明說）、observed_steps（可見步驟）、inferred_from_context（有線索但仍屬推測）。clue 要指出可核對的線索，屬於推測時說明不確定處。只有最後答案或訂正後正解時，不得標為 observed_steps。候選須由使用者確認。
text 通常 8～24 個中文字，寫一個具體缺口或失誤，避免僅寫子單元名或「觀念不清」。詞義、史實等錯誤可保留辨識缺口所必需的字詞、人物或時代。clue 用一句指出本題證據，target 用一句說明下一題可檢查的動作。text 不含僅供本題使用的數字或選項，clue 可保留必要細節。不要在三個欄位重複同一句話，不猜測使用者個性、動機或整科能力。
本人明說不記得某詞義、事實或概念關係時，可記為具體知識缺口；不必強行改寫成計算步驟。若本人只說「生物不好」或「這章不熟」，仍不足以形成具體候選。只有錯誤選項時，不能判定是記憶、理解還是判讀出了問題。
target 依錯因選擇辨義、比較概念、說明機制、判讀新資料或核對條件等可驗證動作，避免只寫「多練習」。相同失誤在一題重複出現只列一次。`;

export const weaknessCandidateSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
  text: { type: Type.STRING }, weaknessId: { type: Type.STRING, nullable: true },
  basis: { type: Type.STRING, enum: ['user_explicit', 'observed_steps', 'inferred_from_context'] },
  clue: { type: Type.STRING }, target: { type: Type.STRING },
}, required: ['text', 'weaknessId', 'basis', 'clue', 'target'] } };

export function normalizeWeaknessCandidates(raw: unknown, catalog: readonly Weakness[]): ErrorReason[] {
  if (!Array.isArray(raw)) return [];
  const reasons = new Map<string, ErrorReason>();
  for (const value of raw.slice(0, 12)) {
    const text = typeof value?.text === 'string' ? value.text.trim().slice(0, 160) : '';
    if (!text || !['user_explicit', 'observed_steps', 'inferred_from_context'].includes(value.basis)) continue;
    const matched = catalog.find(item => item.id === value.weaknessId);
    if (value.weaknessId != null && !matched) continue;
    const key = matched?.id ?? text.normalize('NFKC').replace(/[。！!？?]+$/u, '');
    if (reasons.has(key)) continue;
    reasons.set(key, { text, origin: 'ai', basis: value.basis, ...(matched ? { weaknessId: matched.id } : {}),
      clue: typeof value.clue === 'string' ? value.clue.slice(0, 300) : '',
      target: matched?.target ?? (typeof value.target === 'string' ? value.target.slice(0, 240) : '') });
    if (reasons.size === 4) break;
  }
  return [...reasons.values()];
}
