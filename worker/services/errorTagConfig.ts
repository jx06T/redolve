// Match complete, unambiguous phrases. Keep codes stable when adjusting labels or aliases.
export const errorTagConfig = [
  {
    code: 'misread_task', label: '讀錯題意',
    aliases: ['看錯題意', '看錯題目要求', '誤解題目要求', '把不成立看成成立', '把選錯誤看成選正確'],
  },
  {
    code: 'missed_condition', label: '漏查條件或範圍',
    aliases: ['忽略參數範圍限制', '沒有注意參數的範圍限制', '漏查條件', '漏檢查條件', '漏驗定義域', '漏查角度範圍', '忽略定理適用條件'],
  },
  {
    code: 'concept_misunderstood', label: '概念或性質理解有誤',
    aliases: ['誤解內積分配律', '不熟悉內積的分配律性質', '混淆內積與外積', '誤解半角公式', '不熟悉半角公式'],
  },
  {
    code: 'invalid_method', label: '解法或步驟不當',
    aliases: ['用特例證明一般命題', '用單一特例證明一般命題', '把必要條件當成充分條件', '推論步驟無法推出結論'],
  },
  {
    code: 'calculation_error', label: '計算或代換出錯',
    aliases: ['代入數值算錯', '展開算錯', '代入錯誤', '計算錯誤', '移項時符號算錯'],
  },
  {
    code: 'work_incomplete', label: '作答未完成',
    aliases: ['最後一項沒算完', '最後一個選項沒算完', '漏驗一個選項', '未完成最後一步', '未完成計算', '未完成繁瑣計算'],
  },
];

const normalize = (text: string) => text.normalize('NFKC').trim().replace(/[。.!！]+$/u, '').trim();
const tagsByPhrase = new Map<string, { code: string; label: string } | null>();
for (const { code, label, aliases } of errorTagConfig) {
  for (const phrase of [label, ...aliases]) {
    const key = normalize(phrase), prior = tagsByPhrase.get(key);
    tagsByPhrase.set(key, prior === undefined || prior?.code === code ? { code, label } : null);
  }
}

export function classifyErrorReason(text: string) {
  return tagsByPhrase.get(normalize(text)) ?? undefined;
}
