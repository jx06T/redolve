import { Type } from '@google/genai';
import type { ErrorReason } from '../../../src/types/learning';
import type { Weakness } from '../../../src/types/weakness';

export const candidateRules = `在同一次回應內依序完成兩步，只輸出最後的結構化候選。
第一步先依本人明說的內容與可見作答步驟，寫出有證據的具體錯誤操作和可用異題驗證的動作，最多四項。catalog 只在第二步使用。不得從考點、答錯或訂正時使用的公式推斷原先作答。缺乏足以指向具體失誤的線索時回傳空陣列。
第二步再逐項比對 catalog。只有既有項目描述同一個錯誤操作時才附上該 weaknessId。主題相同、措辭相近或只有上位概念都不足以配對。沒有相同項目或 catalog 為空時，保留具體候選並把 weaknessId 設為 null。
basis 使用 user_explicit（本人明說）、observed_steps（可見步驟）、inferred_from_context（有線索但仍屬推測）。clue 要指出可核對的線索，屬於推測時說明不確定處。只有最後答案或訂正後正解時，不得標為 observed_steps。候選須由使用者確認。
不等式中，漏用已知條件、已知為負但未反向、符號未知而漏分類是不同操作。線索不足以區分時，只描述能確認的部分，或留空。`;

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
