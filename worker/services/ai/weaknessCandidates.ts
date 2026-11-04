import { Type } from '@google/genai';
import type { ErrorReason } from '../../../src/types/learning';
import type { Weakness } from '../../../src/types/weakness';

export const candidateRules = `只提出能區分的具體錯誤操作，最多四項；證據不足可為零。不要從考點、答錯或訂正時使用的公式推斷原先作答。不得以「粗心」或「不熟悉某章」當作候選。
優先配對傳入 catalog 的 weaknessId。無合適項目時留 null，提供具體名稱和可用異題驗證的動作。不要虛構 ID 或把候選確認為事實。
basis 使用 user_explicit（本人明說）、observed_steps（可見步驟）、inferred_from_context（情境推測）。只有最後答案時不可標為 observed_steps。clue 寫可核對的線索，情境推測時明說不足之處。
若是除以負參數後未反向，只有證據區分「漏用題目已給條件」、「已知為負但未反向」、「符號未知而漏分類」時才精準配對。不足時保留中性候選或留空。`;

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
