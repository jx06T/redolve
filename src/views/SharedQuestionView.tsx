import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalQuestionCard } from '../components/ExternalQuestionCard';
import { BackButton } from '../components/ReaderNavigation';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { subscriptionService } from '../services/questionService';

// The same read-only card as Explore/Extended, with the entry API enforcing ACL.
// A shared link does not grant permissions or create a subscription.
export function SharedQuestionView() {
  const {id='',entryId=''}=useParams();const user=useStore(s=>s.currentUser);
  const account=isGuestUser(user)?'':user!.id;
  const [status,setStatus]=useState({account:'',ready:false,subscribed:false});
  const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  useEffect(()=>{const abort=new AbortController();setError('');setStatus({account,ready:!account,subscribed:false});
    if(account)void subscriptionService.list(abort.signal).then(rows=>{if(!abort.signal.aborted)setStatus({account,ready:true,subscribed:rows.some(s=>s.collection_id===id)});}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return ()=>abort.abort();
  },[account,id,retry]);
  return <div className="mx-auto max-w-5xl space-y-4"><div className="flex justify-end"><BackButton/></div>
    {error&&<p role="alert" className="text-sm text-text-muted">訂閱狀態讀取失敗：{error}<button className="ml-3 underline" onClick={()=>setRetry(v=>v+1)}>重試</button></p>}
    <ExternalQuestionCard key={`${account}:${id}:${entryId}`} id={entryId} collectionId={id}
      knownSubscribed={status.account===account&&status.subscribed}
      subscriptionStatusReady={status.account===account&&status.ready}
      onSubscriptionChanged={subscribed=>setStatus({account,ready:true,subscribed})}/>
  </div>;
}
