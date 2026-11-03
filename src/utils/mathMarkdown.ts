// Keep explicit math delimiters compatible without guessing formulas in plain text.
// Markdown code spans/fences must preserve their literal contents.
export function normalizeMathDelimiters(text: string): string {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math}$`)).join('');
}

export const needsMarkdown = (text: string) => /[$\\`*_\[\]#~>|]/.test(text) || /(^|\n)\s*(?:[-+]\s|\d+[.)]\s)/.test(text);
