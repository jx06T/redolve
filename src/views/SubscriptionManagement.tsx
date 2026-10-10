import { LoginNotice } from '../components/LoginNotice';
import { isGuestUser } from '../utils/guest';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { subscriptionService } from '../services/questionService';
import { AppDialog } from '../components/AppDialog';
import { useStore } from '../store/useStore';
import type { Subscription } from '../types/question';
export function SubscriptionManagement() {
  const {currentUser}=useStore();const [rows,setRows]=useState<Subscription[]>([]);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [remove,setRemove]=useState<Subscription|null>(null);
  const [q,setQ]=useState('');
  useEffect(()=>{setRows([]);if(isGuestUser(currentUser))return;const abort=new AbortController();
    void subscriptionService.list(abort.signal).then(setRows).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();},[currentUser]);
  return <section className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-4">
    <h1 className="text-lg font-semibold">訂閱中心</h1><p className="text-sm text-text-muted">管理訂閱關係；觀看題目請前往「延伸題目」。取消訂閱保留你的已存版本與星號。</p>
    {isGuestUser(currentUser)?<LoginNotice description="登入後可管理題目集的訂閱關係。"/>:<>
      <input value={q} onChange={e=>setQ(e.target.value)} aria-label="搜尋我的訂閱" placeholder="尋找訂閱集" className="w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
      <ul className="space-y-3">{rows.filter(s=>(s.title||s.last_known_title).includes(q)).map(s=><li key={s.collection_id} className="flex flex-wrap justify-between gap-3 rounded-2xl border border-border-subtle p-4">
        <div><p className="font-medium">{s.title||s.last_known_title}</p><p className="mt-1 text-xs text-text-muted">訂閱者{s.role==='contributor'?' · 貢獻者':''} · {s.can_read?'可觀看':'目前無法存取'} · {new Date(s.subscribed_at).toLocaleDateString()}</p></div>
        <div className="flex items-center gap-3">{s.can_read&&<Link to={`/extended?collection_id=${s.collection_id}`} className="text-sm text-primary underline">觀看題目</Link>}
          <button onClick={()=>setRemove(s)} className="text-sm text-status-eraser">取消訂閱</button></div>
      </li>)}</ul>{!rows.length&&<p className="text-sm text-text-muted">尚無訂閱。</p>}</>}
    <Link to="/explore" className="inline-block text-sm text-primary underline">探索公開題目</Link>
    {error&&<p role="alert" className="text-sm text-status-eraser">{error}</p>}
    {remove&&<AppDialog title={`取消訂閱「${remove.title||remove.last_known_title}」？`} onClose={()=>setRemove(null)} busy={busy}>
      <p className="text-sm">此集合將離開延伸題目選單。你的已存版本、私人訂正和星號保留。</p>
      <button disabled={busy} onClick={()=>{setBusy(true);void subscriptionService.unsubscribe(remove.collection_id).then(()=>{
        setRows(p=>p.filter(s=>s.collection_id!==remove.collection_id));setRemove(null);
      }).catch(e=>setError(e.message)).finally(()=>setBusy(false));}} className="mt-4 rounded-xl bg-primary px-4 py-2 text-white">確認取消</button>
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
    </AppDialog>}
  </section>;
}
