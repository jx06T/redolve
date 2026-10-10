import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadWorkDraft, listWorkDrafts } from '../services/workService';
import { savedStudyUrl, workStudyUrl } from '../services/navigationState';
import { useStore } from '../store/useStore';
export function PendingWorkPanel() {
  const account=useStore(s=>s.currentUser?.id||'');const [drafts,setDrafts]=useState<ReturnType<typeof listWorkDrafts>>([]);
  useEffect(()=>{const refresh=()=>setDrafts(account?listWorkDrafts(account):[]);refresh();window.addEventListener('redolve:work-drafts',refresh);return ()=>window.removeEventListener('redolve:work-drafts',refresh);},[account]);
  if(!drafts.length)return null;
  return <section className="rounded-2xl border border-border-subtle bg-page-bg p-4">
    <h2 className="text-sm font-medium">此帳號有 {drafts.length} 份共用／已存作業尚未同步</h2>
    <p className="mt-2 text-xs text-text-muted">草稿寫入此裝置成功時，登出後仍保留；本機儲存失敗時，請先下載自己的作業再離開。登入相同帳號後才可繼續。清除瀏覽器資料會移除草稿。來源撤權或集合版本變更時，先下載自己的作業。</p>
    <ul className="mt-3 space-y-2">{drafts.map(d=><li key={d.key} className="flex flex-wrap justify-between gap-3 text-xs">
      <Link to={d.target.kind==='saved'?savedStudyUrl(d.target.savedRefId):workStudyUrl(d.target.collectionId,d.target.entryId)} className="text-primary underline">
        {d.target.kind==='saved'?'私人已存作業':'我的共用作業'} · {d.notes.slice(0,30)||'筆跡草稿'}</Link>
      <button onClick={()=>downloadWorkDraft(d.ink,d.notes)} className="underline">下載本機作業</button>
    </li>)}</ul>
  </section>;
}
