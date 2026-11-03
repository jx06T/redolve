import { lazy, memo, Suspense } from 'react';
import { needsMarkdown } from '../utils/mathMarkdown';

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

/** One presentation format for question content, answers, and AI explanations. */
export const RichText = memo(function RichText({ text, inline = false, className = '' }: {
  text: string | null | undefined; inline?: boolean; className?: string;
}) {
  const value = text || '', Root = inline ? 'span' : 'div';
  return <Root className={`rich-text${inline ? ' rich-text-inline' : ''} ${className}`}>
    {needsMarkdown(value) ? <Suspense fallback={<span className="whitespace-pre-wrap">{value}</span>}><MarkdownRenderer text={value} inline={inline} /></Suspense> : <span className="whitespace-pre-wrap">{value}</span>}
  </Root>;
});
