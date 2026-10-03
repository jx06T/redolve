import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sharingApi } from '../services/sharingApi';

type Report={id:string;collection_id:string;entry_id:string|null;category:string;
  detail:string|null;state:string;resolution:string|null;created_at:string};

export function AdminSharingView(){
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [reports,setReports]=useState<Report[]>([]);
  const [missing,setMissing]=useState<string[]>([]);
  const [checked,setChecked]=useState<number|null>(null);
  const [orphan,setOrphan]=useState<string[]>([]);
  const [r2Checked,setR2Checked]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=async()=>{
    const me=await sharingApi<{isAdmin:boolean}>('/admin/me');
    setAllowed(me.isAdmin);
    if(me.isAdmin)setReports((await sharingApi<{reports:Report[]}>('/admin/content-reports')).reports);
  };
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'載入失敗'));},[]);
  const scan=async()=>{
    setBusy(true);setError('');setChecked(null);setMissing([]);setR2Checked(null);setOrphan([]);
    try{
      let after='',total=0,failed:string[]=[];
      do{
        const page=await sharingApi<{checked:number;missing_r2:string[];next_cursor:string|null}>(
          `/admin/assets/audit${after?`?after=${encodeURIComponent(after)}`:''}`);
        total+=page.checked;failed=[...failed,...page.missing_r2];
        setChecked(total);setMissing(failed);
        after=page.next_cursor||'';
      }while(after);
      let cursor='',r2Total=0,unregistered:string[]=[];
      do{
        const page=await sharingApi<{checked:number;orphan_r2:string[];next_cursor:string|null}>(
          `/admin/assets/reverse-audit${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
        r2Total+=page.checked;unregistered=[...unregistered,...page.orphan_r2];
        setR2Checked(r2Total);setOrphan(unregistered);
        cursor=page.next_cursor||'';
      }while(cursor);
    }catch(e){setError(e instanceof Error?e.message:'檢查失敗');}
    finally{setBusy(false);}
  };
  const save=async(report:Report)=>{
    setBusy(true);setError('');
    try{
      await sharingApi(`/admin/content-reports/${report.id}`,'PATCH',
        {state:report.state,resolution:report.resolution||''});
      await load();
    }catch(e){setError(e instanceof Error?e.message:'儲存失敗');}
    finally{setBusy(false);}
  };
  if(allowed===null)return <p className="p-6 text-text-muted" role={error?'alert':undefined}>
    {error||'載入管理資料中…'}</p>;
  if(!allowed)return <p className="p-6" role="alert">此頁僅供管理者使用。</p>;
  return <div className="mx-auto max-w-5xl space-y-5 pb-16">
    <header className="rounded-3xl border border-border-subtle bg-surface p-5">
      <p className="text-xs font-medium text-primary">平台管理</p>
      <h1 className="mt-1 text-2xl font-semibold">分享內容檢查</h1>
      <p className="mt-2 text-sm text-text-muted">圖片檢查會雙向比對 D1 與 R2；尚不執行孤兒清理或刪除。</p>
    </header>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    <section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold">圖片物件檢查</h2>
      <button disabled={busy} onClick={()=>void scan()}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">
        {busy?'檢查中…':'檢查 D1 與 R2 圖片'}</button>
      {checked!==null&&<p className="mt-3 text-sm">已檢查 {checked} 個資產；找不到 {missing.length} 個物件。</p>}
      {missing.length>0&&<ul className="mt-2 list-inside list-disc break-all text-sm text-rose-600">
        {missing.map(id=><li key={id}>{id}</li>)}</ul>}
      {r2Checked!==null&&<p className="mt-2 text-sm">已檢查 {r2Checked} 個 R2 物件；未登記於 D1：{orphan.length} 個。</p>}
      {orphan.length>0&&<ul className="mt-2 list-inside list-disc break-all text-sm text-amber-700 dark:text-amber-300">
        {orphan.map(key=><li key={key}>{key}</li>)}</ul>}
    </section>
    <section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold">內容檢舉</h2>
      {!reports.length?<p className="mt-3 text-sm text-text-muted">目前沒有檢舉。</p>:
        <div className="mt-3 space-y-3">{reports.map(report=><div key={report.id}
          className="rounded-2xl border border-border-subtle p-4">
          <p className="text-sm font-medium">{report.category}・{report.created_at}</p>
          <Link to={`/collections/${report.collection_id}${report.entry_id?`/items/${report.entry_id}`:''}`}
            className="mt-1 inline-block text-sm text-primary underline">查看來源</Link>
          {report.detail&&<p className="mt-2 whitespace-pre-wrap text-sm">{report.detail}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={report.state} aria-label="檢舉處理狀態"
              onChange={e=>setReports(previous=>previous.map(row=>row.id===report.id?
                {...row,state:e.target.value}:row))}
              className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
              <option value="open">待處理</option><option value="reviewing">審查中</option>
              <option value="resolved">已處理</option><option value="dismissed">不成立</option>
            </select>
            <input value={report.resolution||''} aria-label="處理紀錄" placeholder="處理紀錄"
              onChange={e=>setReports(previous=>previous.map(row=>row.id===report.id?
                {...row,resolution:e.target.value}:row))}
              className="min-w-48 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm"/>
            <button disabled={busy} onClick={()=>void save(report)}
              className="rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary disabled:opacity-40">儲存</button>
          </div>
        </div>)}</div>}
    </section>
  </div>;
}
