import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sharingApi } from '../../services/sharingApi';
import { useStore } from '../../store/useStore';

type Invitation={id:string;collection_id:string;role:string;title:string;public_name:string;expires_at:string};
export function ReceivedInvitations(){
  const account=useStore(s=>s.currentUser?.id);const showToast=useStore(s=>s.showToast);
  const [rows,setRows]=useState<Invitation[]>([]);const [accepted,setAccepted]=useState<Invitation[]>([]);
  const [busy,setBusy]=useState(true);const [pending,setPending]=useState('');const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);const lock=useRef(false);const identity=useRef(account);identity.current=account;
  useEffect(()=>{const abort=new AbortController();setRows([]);setAccepted([]);setBusy(true);setError('');
    void sharingApi<{invitations:Invitation[]}>('/my/invitations','GET',undefined,abort.signal)
      .then(r=>{if(!abort.signal.aborted)setRows(r.invitations);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);})
      .finally(()=>{if(!abort.signal.aborted)setBusy(false);});return ()=>abort.abort();
  },[account,revision]);
  const accept=async(inv:Invitation)=>{
    if(lock.current)return;lock.current=true;setPending(inv.id);setError('');const actor=account;
    try{await sharingApi('/invitations/accept','POST',{invitation_id:inv.id});
      if(identity.current!==actor)return;
      setRows(p=>p.filter(i=>i.id!==inv.id));setAccepted(p=>[...p,inv]);showToast('已接受邀請；訂閱關係可另行設定','success');
    }catch(e){if(identity.current===actor)setError(e instanceof Error?e.message:'接受邀請失敗');}
    finally{lock.current=false;setPending('');}
  };
  return <section aria-label="收到的邀請" className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
    <h2 className="font-semibold">收到的邀請</h2><p className="text-xs text-text-muted">接受邀請取得觀看或貢獻權限，不會自動訂閱。</p>
    {busy?<p className="text-sm text-text-muted">讀取邀請中…</p>:!rows.length&&<p className="text-sm text-text-muted">目前沒有待接受的邀請。</p>}
    {rows.map(inv=><div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-page-bg p-4">
      <div><p className="text-sm font-medium">{inv.title}</p><p className="mt-1 text-xs text-text-muted">{inv.public_name} · {inv.role==='contributor'?'貢獻者':'觀看者'} · 有效至 {inv.expires_at}</p></div>
      <button disabled={!!pending} onClick={()=>void accept(inv)} className="min-h-11 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary disabled:opacity-40">{pending===inv.id?'接受中…':'接受邀請'}</button>
    </div>)}
    {accepted.map(inv=><div key={inv.id} className="rounded-2xl bg-page-bg p-4 text-sm">已加入〔{inv.title}〕<Link className="ml-3 text-primary underline" to={inv.role==='contributor'?`/settings/collections/${inv.collection_id}`:`/collections/${inv.collection_id}`}>{inv.role==='contributor'?'管理共用集':'觀看題目集與設定訂閱'}</Link></div>)}
    {error&&<p role="alert" className="text-sm text-status-eraser">{error}<button onClick={()=>setRevision(v=>v+1)} className="ml-3 underline">重新讀取邀請</button></p>}
  </section>;
}
