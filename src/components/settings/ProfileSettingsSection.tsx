import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { isGuestUser } from '../../utils/guest';
import { sharingApi, type Collection } from '../../services/sharingApi';
import { ReceivedInvitations } from './ReceivedInvitations';

export function ProfileSettingsSection({children}:{children:ReactNode}) {
  const {currentUser,setAuthModalOpen,showToast}=useStore();
  const [name,setName]=useState('');const [destination,setDestination]=useState('');
  const [collections,setCollections]=useState<Collection[]>([]);const [isAdmin,setAdmin]=useState(false);
  const [busy,setBusy]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setName('');setDestination('');setCollections([]);setAdmin(false);setError('');
    if(isGuestUser(currentUser)){setBusy(false);return;}
    const read=<T,>(path:string)=>sharingApi<T>(path,'GET',undefined,abort.signal);
    void Promise.all([read<{profile:{display_name:string}|null}>('/me/public-profile'),read<{default_collection_id:string|null}>('/me/upload-preferences'),read<{collections:Collection[]}>('/my/collections'),read<{isAdmin:boolean}>('/admin/me')]).then(([profile,prefs,sets,admin])=>{
      if(abort.signal.aborted)return;setName(profile.profile?.display_name||'');setDestination(prefs.default_collection_id||'');setCollections(sets.collections);setAdmin(admin.isAdmin);
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});
    return ()=>abort.abort();
  },[currentUser,revision]);
  const save=async(fn:()=>Promise<unknown>)=>{setSaving(true);setError('');try{await fn();showToast('個人設定已儲存','success');}catch(e){setError(e instanceof Error?e.message:'儲存失敗');}finally{setSaving(false);}};
  if(isGuestUser(currentUser))return <section className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm">登入後可管理個人檔案與 API 金鑰。<button onClick={()=>setAuthModalOpen(true)} className="ml-3 text-primary">登入</button></section>;
  return <div className="space-y-5"><section className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-4">
    <h2 className="font-semibold">個人檔案</h2>
    {error&&<p role="alert" className="text-sm text-status-eraser">{error}<button onClick={()=>setRevision(v=>v+1)} className="ml-3 underline">重新讀取</button></p>}
    <label className="block text-sm">公開顯示名稱<input aria-label="公開顯示名稱" disabled={busy||saving} value={name} onChange={e=>setName(e.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"/></label>
    <p className="text-xs text-text-muted">貢獻題目、共用筆跡與筆記時顯示這個名稱。</p>
    <button disabled={busy||saving||!name.trim()} onClick={()=>void save(()=>sharingApi('/me/public-profile','PUT',{display_name:name.trim()}))} className="rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary disabled:opacity-40">儲存名稱</button>
    <label className="block border-t border-border-subtle pt-4 text-sm">預設上傳目的地<select aria-label="預設上傳目的地" disabled={busy||saving} value={destination} onChange={e=>setDestination(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"><option value="">只存我的題庫</option>{collections.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    <p className="text-xs text-text-muted">原題會保留在自己的題庫。每次上傳可另選目的地。</p>
    <button disabled={busy||saving} onClick={()=>void save(()=>sharingApi('/me/upload-preferences','PATCH',{default_collection_id:destination||null}))} className="rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary disabled:opacity-40">儲存預設</button>
  </section><ReceivedInvitations/>{children}{isAdmin&&<Link className="inline-block rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-muted" to="/admin/sharing">平台管理 · 分享內容檢查</Link>}</div>;
}
