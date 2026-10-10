import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookCopy, FolderPlus, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection } from '../services/sharingApi';
import { SwitchRow } from '../components/SwitchRow';
import { API_BASE } from '../services/api';

type Invite={id:string;collection_id:string;role:string;title:string;public_name:string};
type DetachedLayer={id:string;collection_title:string;typed_notes:string|null;
  draw_asset_id:string|null;updated_at:string};
export function CollectionsHubView(){
  const navigate=useNavigate();
  const {currentUser,setAuthModalOpen,showToast}=useStore();
  const [mine,setMine]=useState<Collection[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [detached,setDetached]=useState<DetachedLayer[]>([]);
  const [title,setTitle]=useState('');
  const [name,setName]=useState('');
  const [profileName,setProfileName]=useState('');
  const profileLoadedFor=useRef('');
  const [visibility,setVisibility]=useState<'restricted'|'link'|'public'>('restricted');
  const [listed,setListed]=useState(false);
  const [defaultDestination,setDefaultDestination]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const refreshAbort=useRef<AbortController>();
  const refresh=async()=>{
    refreshAbort.current?.abort();const abort=new AbortController();refreshAbort.current=abort;
    const read=<T,>(path:string)=>sharingApi<T>(path,'GET',undefined,abort.signal);
    if(currentUser){
      const [myResult,inviteResult,pref,detachedResult,profileResult,adminResult]=await Promise.all([
        read<{collections:Collection[]}>('/my/collections'),
        read<{invitations:Invite[]}>('/my/invitations'),
        read<{default_collection_id:string|null}>('/me/upload-preferences'),
        read<{layers:DetachedLayer[]}>('/my/detached-layers'),
        read<{profile:{display_name:string}|null}>('/me/public-profile'),
        read<{isAdmin:boolean}>('/admin/me').catch(()=>({isAdmin:false})),
      ]);
      if(abort.signal.aborted)return;setMine(myResult.collections);setInvites(inviteResult.invitations);
      setDetached(detachedResult.layers);
      setDefaultDestination(pref.default_collection_id||'');
      setIsAdmin(adminResult.isAdmin);
      if(profileLoadedFor.current!==currentUser.id){
        setProfileName(profileResult.profile?.display_name||'');profileLoadedFor.current=currentUser.id;
      }
    }
  };
  useEffect(()=>{setMine([]);setInvites([]);setDetached([]);setIsAdmin(false);setDefaultDestination('');setProfileName('');profileLoadedFor.current='';setError('');
    void refresh().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return ()=>refreshAbort.current?.abort();},[currentUser?.id]);
  const create=async()=>{
    if(!currentUser){setAuthModalOpen(true);return;}
    setBusy(true);setError('');
    try{
      const result=await sharingApi<{id:string}>('/my/collections','POST',{
        title,public_name:name,visibility,listed,activate:true,
      });
      navigate(`/settings/collections/${result.id}`);
    }catch(e){setError(e instanceof Error?e.message:'建立失敗');}
    finally{setBusy(false);}
  };
  return <div className="max-w-5xl mx-auto space-y-7 pb-16">
    <header className="rounded-3xl border border-[#E5E7EB] dark:border-[#2C2C30] bg-[#FFFFFF] dark:bg-[#202023] p-5 sm:p-7">
      <p className="text-sm text-[#6C8D80] flex items-center gap-2"><BookCopy size={16}/>題目集與共用</p>
      <h1 className="mt-2 text-2xl font-semibold">把自己的題目加入集合，一起整理與訂正</h1>
      <p className="mt-2 text-sm text-text-muted">題目加入啟用中的集合後即可觀看；原題後續修改會直接反映。私人筆記不會自動公開。</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link className="px-4 py-2 rounded-xl bg-[#EAF1EC] text-[#376654]" to="/settings#subscriptions">訂閱中心</Link>
        <Link className="px-4 py-2 rounded-xl bg-primary/10 text-primary" to="/study?source=saved">我存入的題目</Link>
        <Link className="px-4 py-2 rounded-xl bg-[#EAF1EC] text-[#376654]" to="/explore">探索公開題目</Link>
        {isAdmin&&<Link className="px-4 py-2 rounded-xl bg-primary/10 text-primary" to="/admin/sharing">分享內容管理</Link>}
      </div>
    </header>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {currentUser?<section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><FolderPlus size={18}/>建立公開或限定題目集</h2>
        <label className="block text-sm">集合名稱<input value={title} onChange={e=>setTitle(e.target.value)}
          maxLength={80} className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg"/></label>
        <label className="block text-sm">集合展示署名<input value={name} onChange={e=>setName(e.target.value)}
          maxLength={80} className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg"/></label>
        <label className="block text-sm">觀看範圍<select value={visibility}
          onChange={e=>setVisibility(e.target.value as typeof visibility)}
          className="mt-1 w-full p-2.5 rounded-xl border border-border-subtle bg-page-bg">
          <option value="restricted">指定對象</option><option value="link">持連結者</option>
          <option value="public">所有人</option></select></label>
        {visibility==='public'&&<SwitchRow label="出現在公開探索" checked={listed} onChange={setListed}/>}
        <button type="button" disabled={busy||!title.trim()||!name.trim()} onClick={create}
          className="px-5 py-2.5 rounded-xl bg-primary text-white disabled:opacity-40">建立並啟用</button>
      </div>
      <div className="rounded-3xl border border-border-subtle bg-surface p-5">
        <h2 className="font-semibold flex items-center gap-2"><Users size={18}/>我建立與參與</h2>
        <div id="profile" className="mt-3 rounded-2xl border border-border-subtle p-3">
          <label className="block text-sm font-medium">我的公開顯示名稱</label><p className="mt-1 text-xs text-text-muted">其他人查看你貢獻的題目及共用筆記時使用這個帳號名稱；不會顯示你的 email。</p>
          <div className="mt-2 flex gap-2">
            <input value={profileName} maxLength={80} onChange={e=>setProfileName(e.target.value)}
              aria-label="公開顯示名稱" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm"/>
            <button disabled={!profileName.trim()} onClick={()=>void sharingApi('/me/public-profile','PUT',
              {display_name:profileName.trim()}).then(()=>showToast('公開名稱已儲存','success'))
              .catch(e=>setError(e.message))}
              className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary disabled:opacity-40">儲存</button>
          </div>
        </div>
        {mine.length?<ul className="mt-3 space-y-2">{mine.map(co=><li key={co.id}>
          <Link to={`/settings/collections/${co.id}`} className="block rounded-2xl border border-border-subtle p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <span className="font-medium">{co.title}</span><span className="ml-2 text-xs text-text-muted">
              {co.role==='owner'?'建立者':'貢獻者'}・{co.lifecycle==='active'?'啟用中':co.lifecycle==='draft'?'草稿':'已暫停'}・{co.item_count||0} 題 · {co.contributor_count||1} 位貢獻者{co.is_subscribed?' · 同時訂閱':''}
              {co.pending_owner_transfer?'・待你接受管理權':''}
            </span></Link></li>)}</ul>:<p className="mt-3 text-sm text-text-muted">尚無題目集。</p>}
        {invites.length>0&&<div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-medium">待接受邀請</h3>
          {invites.map(inv=><p key={inv.id} className="mt-2 text-sm">{inv.title}・
            {inv.role==='contributor'?'貢獻者':'觀看者'}。請使用邀請連結中的 token 接受。</p>)}
        </div>}
        <div className="mt-5 border-t border-border-subtle pt-4">
          <label className="block text-sm font-medium">預設上傳目的地</label>
          <select value={defaultDestination} onChange={e=>setDefaultDestination(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">只存我的題庫</option>
            {mine.map(co=><option key={co.id} value={co.id}>{co.title}</option>)}
          </select>
          <button onClick={()=>void sharingApi('/me/upload-preferences','PATCH',{
            default_collection_id:defaultDestination||null,
          }).then(()=>showToast('預設上傳目的地已更新','success'))
            .catch(e=>setError(e.message))}
            className="mt-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary">儲存預設</button>
          <p className="mt-1 text-xs text-text-muted">每次上傳仍可單獨改目的地。</p>
        </div>
      </div>
    </section>:<button onClick={()=>setAuthModalOpen(true)}
      className="px-5 py-2 rounded-xl bg-primary text-white">登入以建立、貢獻或訂閱</button>}
    {currentUser&&detached.length>0&&<section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold">已停止展示的我的共用筆記</h2>
      <p className="mt-1 text-sm text-text-muted">退出或移出集合後，這些舊共用層只供你取回。</p>
      <div className="mt-3 space-y-3">{detached.map(layer=><div key={layer.id}
        className="rounded-2xl border border-border-subtle p-4">
        <p className="text-sm font-medium">{layer.collection_title}・{layer.updated_at}</p>
        {layer.typed_notes&&<p className="mt-2 whitespace-pre-wrap text-sm">{layer.typed_notes}</p>}
        {layer.draw_asset_id&&<a href={`${API_BASE}/my/detached-layers/${encodeURIComponent(layer.id)}/draw`}
          download className="mt-2 inline-block rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          下載我的筆跡資料</a>}
      </div>)}</div>
    </section>}
  </div>;
}
