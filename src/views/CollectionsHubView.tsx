import { LoginNotice } from '../components/LoginNotice';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppDialog } from '../components/AppDialog';
import { isGuestUser } from '../utils/guest';
import { FolderPlus, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection } from '../services/sharingApi';
import { SwitchRow } from '../components/SwitchRow';
import { API_BASE } from '../services/api';

type Invite={id:string;collection_id:string;role:string;title:string;public_name:string};
type DetachedLayer={id:string;collection_title:string;typed_notes:string|null;
  draw_asset_id:string|null;updated_at:string};
export function CollectionsHubView(){
  const navigate=useNavigate();
  const {currentUser,setAuthModalOpen}=useStore();
  const [mine,setMine]=useState<Collection[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [detached,setDetached]=useState<DetachedLayer[]>([]);
  const [title,setTitle]=useState('');
  const [name,setName]=useState('');const [hasProfile,setHasProfile]=useState(false);
  const [creating,setCreating]=useState(false);
  const [visibility,setVisibility]=useState<'restricted'|'link'|'public'>('restricted');
  const [listed,setListed]=useState(false);const [allowReshare,setAllowReshare]=useState(true);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const refreshAbort=useRef<AbortController>();
  const refresh=async()=>{
    refreshAbort.current?.abort();const abort=new AbortController();refreshAbort.current=abort;
    const read=<T,>(path:string)=>sharingApi<T>(path,'GET',undefined,abort.signal);
    if(!isGuestUser(currentUser)){
      const [myResult,inviteResult,detachedResult,profileResult]=await Promise.all([
        read<{collections:Collection[]}>('/my/collections'),
        read<{invitations:Invite[]}>('/my/invitations'),
        read<{layers:DetachedLayer[]}>('/my/detached-layers'),
        read<{profile:{display_name:string}|null}>('/me/public-profile'),
      ]);
      if(abort.signal.aborted)return;setMine(myResult.collections);setInvites(inviteResult.invitations);
      setDetached(detachedResult.layers);
      setName(profileResult.profile?.display_name||'');setHasProfile(!!profileResult.profile);
    }
  };
  useEffect(()=>{setMine([]);setInvites([]);setDetached([]);setError('');
    void refresh().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return ()=>refreshAbort.current?.abort();},[currentUser?.id]);
  const create=async()=>{
    if(isGuestUser(currentUser)){setAuthModalOpen(true);return;}
    setBusy(true);setError('');
    try{
      const result=await sharingApi<{id:string}>('/my/collections','POST',{
        title,public_name:name,visibility,listed,activate:true,allow_reshare:allowReshare,
      });
      navigate(`/settings/collections/${result.id}`);
    }catch(e){setError(e instanceof Error?e.message:'建立失敗');}
    finally{setBusy(false);}
  };
  return <div className="max-w-5xl mx-auto space-y-7 pb-16">
    <header className="flex items-center justify-between gap-3"><h2 className="font-semibold">我的共用集</h2><button onClick={()=>isGuestUser(currentUser)?setAuthModalOpen(true):setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary"><FolderPlus size={16}/>建立題目集</button></header>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!isGuestUser(currentUser)?<section>
      {creating&&<AppDialog title="建立共用題目集" busy={busy} onClose={()=>setCreating(false)}>      <div className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><FolderPlus size={18}/>建立公開或限定題目集</h2>
        <label className="block text-sm">集合名稱<input value={title} onChange={e=>setTitle(e.target.value)}
          maxLength={80} className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg"/></label>
        <label className="block text-sm">公開顯示名稱<input disabled={hasProfile} value={name} onChange={e=>setName(e.target.value)}
          maxLength={80} className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg"/></label>
        <p className="text-xs text-text-muted">所有共用集統一使用個人檔案中的公開顯示名稱。</p>
        <label className="block text-sm">觀看範圍<select value={visibility}
          onChange={e=>setVisibility(e.target.value as typeof visibility)}
          className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg">
          <option value="restricted">指定對象</option><option value="link">持連結者</option>
          <option value="public">所有人</option></select></label>
        {visibility==='public'&&<SwitchRow label="出現在公開探索" checked={listed} onChange={setListed}/>}
        <SwitchRow label="允許存入後再分享" checked={allowReshare} disabled={busy} onChange={setAllowReshare}/>
        <p className="text-xs text-text-muted">開啟後，獲准觀看者可建立不需登入的單題連結。私人集合也預設開啟，可在建立前關閉。</p>
        <button type="button" disabled={busy||!title.trim()||!name.trim()} onClick={create}
          className="px-5 py-2.5 rounded-xl bg-primary text-white disabled:opacity-40">建立並啟用</button>
      </div>
</AppDialog>}
      <div className="rounded-3xl border border-border-subtle bg-surface p-5">
        <h2 className="font-semibold flex items-center gap-2"><Users size={18}/>我建立與參與</h2>
        {mine.length?<ul className="mt-3 space-y-2">{mine.map(co=><li key={co.id}>
          <Link to={`/settings/collections/${co.id}`} className="block rounded-2xl border border-border-subtle p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <span className="font-medium">{co.title}</span><span className="ml-2 text-xs text-text-muted">
              {co.role==='owner'?'建立者':'貢獻者'}・{co.lifecycle==='active'?'啟用中':co.lifecycle==='draft'?'草稿':'已暫停'}・{co.item_count||0} 題 · {co.contributor_count||1} 位貢獻者{co.is_subscribed?' · 同時訂閱':''}
              {co.pending_owner_transfer?'・待你接受管理權':''}
            </span></Link></li>)}</ul>:<p className="mt-3 text-sm text-text-muted">尚無題目集。</p>}
        {invites.length>0&&<div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-medium">待接受邀請</h3>
          {invites.map(inv=><p key={inv.id} className="mt-2 text-sm">{inv.title}・
            {inv.role==='contributor'?'貢獻者':'觀看者'}。<Link to="/settings#profile" className="ml-2 text-primary underline">至個人檔案接受邀請</Link></p>)}
        </div>}
      </div>
    </section>:<LoginNotice description="登入後可建立與貢獻共用題目集。"/>}
    {!isGuestUser(currentUser)&&detached.length>0&&<details className="rounded-3xl border border-border-subtle bg-surface p-5">
      <summary className="cursor-pointer font-semibold">取回已停止展示的共用筆記</summary>
      <p className="mt-1 text-sm text-text-muted">退出或移出集合後，這些舊共用層只供你取回。</p>
      <div className="mt-3 space-y-3">{detached.map(layer=><div key={layer.id}
        className="rounded-2xl border border-border-subtle p-4">
        <p className="text-sm font-medium">{layer.collection_title}・{layer.updated_at}</p>
        {layer.typed_notes&&<p className="mt-2 whitespace-pre-wrap text-sm">{layer.typed_notes}</p>}
        {layer.draw_asset_id&&<a href={`${API_BASE}/my/detached-layers/${encodeURIComponent(layer.id)}/draw`}
          download className="mt-2 inline-block rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          下載我的筆跡資料</a>}
      </div>)}</div>
    </details>}
  </div>;
}
