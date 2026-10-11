import type { QuestionRef } from '../types/question';
import { sharingApi } from './sharingApi';
import type { ShareLink } from './api';
const segment=encodeURIComponent;
const path=(ref:QuestionRef)=>ref.kind==='owned'?`/problems/${segment(ref.itemId)}`
 :ref.kind==='saved'?`/saved/${segment(ref.savedRefId)}`
 :`/collections/${segment(ref.collectionId)}/items/${segment(ref.entryId)}`;
export const shareService={
 create:(ref:QuestionRef,options:{allow_ink:boolean;allow_notes:boolean;expires_at:string|null})=>
  sharingApi<{token:string}>(path(ref)+'/share','POST',options),
 list:(ref:QuestionRef,signal?:AbortSignal)=>sharingApi<{shares:ShareLink[]}>(path(ref)+'/shares','GET',undefined,signal),
 revoke:(ref:QuestionRef,token:string)=>sharingApi(path(ref)+'/share/'+segment(token),'DELETE'),
 listAll:(cursor?:string,signal?:AbortSignal)=>sharingApi<{shares:(ShareLink&{source:string;origin_kind:string})[];next_cursor:string|null}>('/me/question-shares'+(cursor?'?cursor='+segment(cursor):''),'GET',undefined,signal),
 clearExpired:()=>sharingApi('/me/question-shares/expired','DELETE'),
 revokeAny:(token:string)=>sharingApi('/me/question-shares/'+segment(token),'DELETE'),
 url:(token:string)=>`${window.location.origin}/share/${segment(token)}`,
};
