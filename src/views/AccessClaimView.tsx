import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { sharingApi } from '../services/sharingApi';

export function AccessClaimView({kind}:{kind:'invite'|'link'}){
  const {token=''}=useParams();
  const navigate=useNavigate();
  const {currentUser,setAuthModalOpen}=useStore();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(kind==='invite'&&!currentUser)return;
    if(!token)return;
    setBusy(true);
    const path=kind==='invite'?'/invitations/accept':'/share-links/claim';
    void sharingApi<{collection_id:string}>(path,'POST',{token})
      .then(result=>navigate(`/collections/${result.collection_id}`,{replace:true}))
      .catch(e=>setError(e instanceof Error?e.message:'連結無效'))
      .finally(()=>setBusy(false));
  },[kind,token,currentUser,navigate]);
  return <div className="max-w-xl mx-auto mt-8 rounded-3xl border border-border-subtle bg-surface p-6">
    <h1 className="text-xl font-semibold">{kind==='invite'?'接受題目集邀請':'開啟題目集觀看連結'}</h1>
    {kind==='invite'&&!currentUser?<div className="mt-4 space-y-3">
      <p className="text-sm text-text-muted">請使用收到邀請的 Google 帳號登入。</p>
      <button onClick={()=>setAuthModalOpen(true)} className="rounded-xl bg-primary px-4 py-2 text-white">登入</button>
    </div>:!error&&<p className="mt-4 text-sm text-text-muted">
      {busy?'正在驗證權限…':'準備驗證連結…'}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    <Link to="/my/collections" className="mt-5 inline-block text-sm text-primary">返回題目集</Link>
  </div>;
}
