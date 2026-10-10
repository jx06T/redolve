import { Link } from 'react-router-dom';
import type { SearchHit } from '../types/search';
import { ProblemCard } from './ProblemCard';
import { QuestionWorkCard } from './QuestionWorkCard';
import { getProblemImageUrl } from '../services/api';
import { imageUrl, savedImageUrl } from '../services/sharingApi';

export function SearchResultCard({hit,full,studyUrl}:{hit:SearchHit;full:boolean;studyUrl:string}) {
  return <article className={full?'space-y-2':'rounded-2xl border border-border-subtle bg-surface p-4'}>
    {full?hit.origin==='owned'&&hit.problem?<ProblemCard problem={hit.problem} readOnly streamSearch/>:
      <QuestionWorkCard kind={hit.origin==='saved'?'saved':'shared'} id={hit.id} collectionId={hit.collection_id||undefined} readOnly/>:
      <><img loading="lazy" src={hit.origin==='owned'?(hit.problem?.image_url?.startsWith('blob:')?hit.problem.image_url:getProblemImageUrl(hit.id)):hit.origin==='saved'?savedImageUrl(hit.id):imageUrl(hit.collection_id||'',hit.id)} alt={hit.title||'題目圖片'} className="exam-paper-image w-full h-auto rounded-xl bg-white"/>
        <h2 className="mt-3 text-sm font-medium">來源：{hit.title||'未提供來源'}</h2><p className="mt-1 text-xs text-text-muted">分類：{hit.topic_label||'未分類'}</p></>}
    <Link to={studyUrl} className="mt-2 inline-flex rounded-xl border border-border-subtle bg-surface px-4 py-2 text-xs text-primary">前往刷題</Link>
  </article>;
}
