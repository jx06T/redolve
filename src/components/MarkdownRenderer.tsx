import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { PluggableList } from 'unified';
import { normalizeMathDelimiters } from '../utils/mathMarkdown';
import 'katex/dist/katex.min.css';

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: PluggableList = [[rehypeKatex, {
  trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, errorColor: '#9CA3AF',
}]];
const components: Components = {
  // Citations remain app-owned controls. Text links open separately from practice.
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  // AI-provided Markdown must not fetch arbitrary external images.
  img: ({ alt }) => <span>{alt}</span>,
  input: () => null,
};
const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <span>{children}</span>,
  h1: ({ children }) => <strong>{children}</strong>, h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>, h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>, h6: ({ children }) => <strong>{children}</strong>,
  blockquote: ({ children }) => <span>{children}</span>,
  ul: ({ children }) => <span>{children}</span>, ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span className="block">{children}</span>,
  pre: ({ children }) => <span>{children}</span>,
  table: ({ children }) => <span>{children}</span>, thead: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>, tr: ({ children }) => <span className="block">{children}</span>,
  th: ({ children }) => <span>{children} </span>, td: ({ children }) => <span>{children} </span>,
};

export default function MarkdownRenderer({ text, inline = false }: { text: string; inline?: boolean }) {
  return <Markdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    components={inline ? inlineComponents : components}>{normalizeMathDelimiters(text)}</Markdown>;
}
