import { sharingApi } from './sharingApi';
import { useStore } from '../store/useStore';
import { getOfflineProblem, putOfflineProblem } from './offlineStorage';
import { questionListCache } from './listCache';
export type QuestionStarTarget={kind:'owned';itemId:string}|{kind:'saved';savedRefId:string}|{kind:'shared';collectionId:string;entryId:string};
export const starKey=(target:QuestionStarTarget)=>JSON.stringify(target.kind==='owned'?['owned',target.itemId]:target.kind==='saved'?['saved',target.savedRefId]:['shared',target.collectionId,target.entryId]);
export async function setQuestionStar(target:QuestionStarTarget,starred:boolean){
  const account=useStore.getState().currentUser?.id||'guest';
  let canonical=target;
  if(target.kind==='owned'&&target.itemId.startsWith('temp_')){
    const item=await getOfflineProblem(target.itemId);
    if(!item)throw new Error('找不到本機題目，請重新載入');
    await putOfflineProblem({...item,starred:starred?1:0});questionListCache.invalidate();
  }else{
    const result=await sharingApi<{target?:QuestionStarTarget}>('/question-stars','PUT',{target,starred});
    canonical=result.target||target;
  }
  if((useStore.getState().currentUser?.id||'guest')!==account)return;
  if(canonical.kind==='owned')useStore.getState().updateProblemInStore(canonical.itemId,{starred:starred?1:0});
  for(const key of new Set([starKey(target),starKey(canonical)]))window.dispatchEvent(new CustomEvent('redolve:question-star',{detail:{account,key,starred}}));
}
