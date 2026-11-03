import { Link } from 'react-router-dom';
import type { SearchHit } from '../types/search';
import { ProblemCard } from './ProblemCard';
import { QuestionWorkCard } from './QuestionWorkCard';
import { getProblemImageUrl } from '../services/api';
import { imageUrl, savedImageUrl } from '../services/sharingApi';
import { QuestionStarButton } from './QuestionStarButton';

export function SearchResultCard({ hit, full, studyUrl, onChanged,onStarred }: { hit: SearchHit; full: boolean; studyUrl: string; onChanged?:()=>void;onStarred?:(starred:boolean)=>void }) {
  return <article className={full ? 'space-y-2' : 'rounded-2xl border border-border-subtle bg-surface p-4'}>
    {full ? hit.origin === 'owned' && hit.problem ? <ProblemCard problem={hit.problem} readOnly streamSearch onChanged={onChanged} onStarred={onStarred} /> :
      <QuestionWorkCard kind={hit.origin === 'saved' ? 'saved' : 'shared'} id={hit.id} collectionId={hit.collection_id || undefined} readOnly onChanged={onChanged} onStarred={onStarred} /> :
      <><img loading="lazy" src={hit.origin === 'owned' ? (hit.problem?.image_url?.startsWith('blob:') ? hit.problem.image_url : getProblemImageUrl(hit.id)) : hit.origin === 'saved' ? savedImageUrl(hit.id) : imageUrl(hit.collection_id || '', hit.id)} alt={hit.title || '題目圖片'} className="exam-paper-image w-full h-auto rounded-xl bg-white" />
        <div className=' mb-2'>
          <div className="mt-3 flex items-start justify-between gap-2"><h2 className="text-sm font-medium">來源：{hit.title || '未提供來源'}</h2>
            <QuestionStarButton target={hit.origin==='owned'?{kind:'owned',itemId:hit.id}:hit.origin==='saved'?{kind:'saved',savedRefId:hit.id}:{kind:'shared',collectionId:hit.collection_id!,entryId:hit.id}} starred={!!hit.is_starred} onChanged={onStarred}/></div>
          <p className="mt-1 text-xs text-text-muted">分類：{hit.topic_label || '未分類'}</p>
        </div>
      </>
    }
    <Link to={studyUrl} className={`${full?"-mt-8 -translate-y-2 ml-0.5":""} inline-flex rounded-xl border border-border-subtle bg-surface px-4 py-2 text-xs text-primary`}>前往刷題</Link>
  </article>;
}
