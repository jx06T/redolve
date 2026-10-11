import { searchProblems } from './api';
import { questionService } from './questionService';
import { getRootSubjectId } from '../components/StatusBadge';
import type { Item, TaxonomyNode } from '../types';
import type { SearchHit } from '../types/search';

type StudyScope = {subjectId?:string;topicId?:string;status?:Item['status']|'all'};
type StudyHit = Pick<SearchHit,'id'|'origin'|'topic_id'>;

/** Explicit dashboard entries define the whole scope, rather than restoring prior filters. */
export function dashboardStudyUrl(scope:StudyScope,first:StudyHit|undefined,tree:TaxonomyNode[]) {
  const topic=scope.topicId;
  const subject=scope.subjectId||(topic&&topic!=='unclassified'?getRootSubjectId(topic,tree):'all');
  const params=new URLSearchParams({source:first?.origin==='saved'?'saved':'owned',subject_id:subject});
  if(topic)params.set('topic_id',topic);
  if(scope.status!=='all')params.set('status',scope.status||'unsolved');
  else params.set('status','all');
  if(first)params.set('focus',first.id);
  return `/study?${params}`;
}

export async function resolveDashboardStudyUrl(scope:StudyScope,context:{guest:boolean;tree:TaxonomyNode[];signal:AbortSignal}) {
  const topic=scope.topicId||(scope.subjectId!=='all'?scope.subjectId:undefined);
  const status=scope.status==='all'?undefined:scope.status||'unsolved';
  const page=context.guest
    ?await questionService.search({source:'owned',query:'',topic,status,guest:true,taxonomies:context.tree,signal:context.signal})
    :await searchProblems('',new URLSearchParams({scope:'mine',origin:'all',browse:'1',limit:'1',metadata_only:'1',
      ...(topic?{topic_id:topic}:{}),...(status?{status}:{})}),context.signal);
  if(context.signal.aborted)throw new DOMException('已取消進入刷題','AbortError');
  return dashboardStudyUrl(scope,page.items[0],context.tree);
}
