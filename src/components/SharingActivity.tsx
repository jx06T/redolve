import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sharingApi } from '../services/sharingApi';
import { libraryService } from '../services/libraryService';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { PublicExploreActivity } from './PublicExploreActivity';
type Activity={id:string;title:string;to:string;label:string};
export function SharingActivity() {
  const user=useStore(s=>s.currentUser);const account=isGuestUser(user)?'':user!.id;const [rows,setRows]=useState<Activity[]>([]);const [error,setError]=useState('');
  useEffect(()=>{setRows([]);setError('');if(!account)return;const abort=new AbortController();
    void Promise.all([
      sharingApi<{items:{entry_id:string;collection_id:string;title:string|null;collection_title:string}[]}>('/subscriptions/feed','GET',undefined,abort.signal),
      sharingApi<{items:{id:string;source_title:string}[]}>('/saved','GET',undefined,abort.signal),
    ]).then(async([feed,saved])=>{
      const updates=await Promise.all(saved.items.slice(0,5).map(async s=>({s,update:await libraryService.previewUpdate(s.id).catch(()=>({changed:false}))})));
      if(abort.signal.aborted)return;
      setRows([...feed.items.slice(0,4).map(i=>({id:i.entry_id,title:i.title||'新題目',label:`訂閱新題 · ${i.collection_title}`,to:`/extended?collection_id=${i.collection_id}&focus=${i.entry_id}`})),
        ...updates.filter(x=>x.update.changed).map(({s})=>({id:s.id,title:s.source_title,label:'已存題目 · 來源有更新',to:`/study?source=saved&focus=${s.id}`}))]);
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();
  },[account]);
  return <>{rows.length>0&&<section aria-label="共用與訂閱動態" className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
    <h2 className="font-semibold">共用與訂閱動態</h2>
    {rows.map(r=><Link key={r.id} to={r.to} className="block rounded-xl bg-page-bg p-3"><p className="text-xs text-text-muted">{r.label}</p><p className="mt-1 text-sm">{r.title}</p></Link>)}
    {error&&<p role="alert" className="text-xs text-status-eraser">動態暫時無法取得：{error}</p>}
    <div className="flex flex-wrap gap-4 text-xs text-primary"><Link to="/extended">觀看訂閱題目</Link><Link to="/settings#collections">共用集管理</Link><Link to="/settings#subscriptions">管理訂閱</Link></div>
  </section>}<PublicExploreActivity/></>;
}
