// Support explicit delimiters and standalone legacy TeX without changing stored text.
// Markdown code spans/fences must preserve their literal contents.
export function normalizeMathDelimiters(text: string): string {
  const normalized = text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math}$`)).join('');
  // Older answer fields can contain a whole TeX expression without $ delimiters.
  // Require a known math command and reject prose, code and existing delimiters.
  if (!/[$`\r\n]/.test(normalized) && /\\(?:[dt]?frac|sqrt|vec|overrightarrow|boxed|sin|cos|tan|log|ln|pi|theta|alpha|beta|gamma|sum|int|infty|pm|cdot|times|ge|le|neq)\b/.test(normalized)) {
    const expression = normalized.replace(/\\(?:text|textrm|mathrm|operatorname)\{[^{}]*\}/g, 'x').replace(/\\[a-zA-Z]+/g, 'x');
    if (!/[\u3400-\u9fff]|[a-zA-Z]{3,}/.test(expression)) return `$${normalized.trim()}$`;
  }
  return normalized;
}

export const needsMarkdown = (text: string) => /[$\\`*_\[\]#~>|]/.test(text) || /(^|\n)\s*(?:[-+]\s|\d+[.)]\s)/.test(text);
