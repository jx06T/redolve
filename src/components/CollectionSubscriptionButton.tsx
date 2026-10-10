import { useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { subscriptionService } from '../services/questionService';

export function CollectionSubscriptionButton({collectionId,subscribed,isOwner=false,statusReady=true,onChanged}: {
  collectionId:string;subscribed:boolean;isOwner?:boolean;statusReady?:boolean;onChanged:(subscribed:boolean)=>void;
}) {
  const {currentUser,setAuthModalOpen,showToast}=useStore();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const pending=useRef(false);
  const toggle=async()=>{
    if(isGuestUser(currentUser)){setAuthModalOpen(true);return;}
    if(pending.current||!statusReady)return;pending.current=true;setBusy(true);setError('');
    try{await (subscribed?subscriptionService.unsubscribe(collectionId):subscriptionService.subscribe(collectionId));
      onChanged(!subscribed);window.dispatchEvent(new Event('redolve:subscriptions-changed'));showToast(subscribed?'已取消訂閱；存入的題目仍保留':'已訂閱，可在延伸題目選擇此集合','success');
    }catch(e){setError(e instanceof Error?e.message:'訂閱操作失敗');}
    finally{pending.current=false;setBusy(false);}
  };
  return <div className="space-y-2">
    {isOwner?<span className="text-xs text-text-muted">我建立的題目集</span>:<button disabled={busy||!statusReady} onClick={()=>void toggle()}
      className="min-h-11 rounded-xl border border-[#E7D6C6] bg-surface px-4 py-3 text-sm text-[#865E3F] dark:text-[#D8B99E] disabled:opacity-40">{busy?'處理中…':!statusReady?'確認訂閱狀態中…':subscribed?'取消訂閱題目集':'訂閱題目集'}</button>}
    {error&&<p role="alert" className="text-xs text-status-eraser">{error}</p>}
  </div>;
}
