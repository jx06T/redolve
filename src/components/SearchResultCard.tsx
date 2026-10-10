import { Link } from 'react-router-dom';
import type { SearchHit } from '../types/search';
import { ProblemCard } from './ProblemCard';
import { QuestionWorkCard } from './QuestionWorkCard';

export function SearchResultCard({hit,full,studyUrl}:{hit:SearchHit;full:boolean;studyUrl:string}) {
  return <article className={full?'space-y-2':'rounded-2xl border border-border-subtle bg-surface p-4'}>
    {full?hit.origin==='owned'&&hit.problem?<ProblemCard problem={hit.problem} readOnly streamSearch/>:
      <QuestionWorkCard kind={hit.origin==='saved'?'saved':'shared'} id={hit.id} collectionId={hit.collection_id||undefined} readOnly/>:
      <><h2 className="font-medium">{hit.title||'未命名題目'}</h2><p className="mt-1 text-xs text-text-muted">{[hit.topic_label,hit.collection_title,hit.provider_name].filter(Boolean).join(' · ')}</p>{hit.typed_notes&&<p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-text-muted">{hit.typed_notes}</p>}</>}
    <Link to={studyUrl} className="mt-2 inline-flex rounded-xl border border-border-subtle bg-surface px-4 py-2 text-xs text-primary">前往刷題</Link>
  </article>;
}
