import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl, sharingApi } from '../services/sharingApi';
import { useStore } from '../store/useStore';

type PublicItem = { entry_id: string; collection_id: string; collection_title: string; title: string; topic_label: string | null; is_subscribed: number };
export function PublicExploreActivity() {
  const account = useStore(s => s.currentUser?.id); const [rows, setRows] = useState<PublicItem[]>([]);
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setRows([]); setError(''); setBusy(true);
    void sharingApi<{ items: PublicItem[] }>('/public/items?exclude_subscribed=yes&exclude_owned=yes', 'GET', undefined, abort.signal)
      .then(r => { if (!abort.signal.aborted) setRows(r.items.slice(0, 4)); }).catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); }); return () => abort.abort();
  }, [account, revision]);
  return <section aria-label="公開探索動態" className="rounded-3xl border border-[#E7D6C6] bg-[#F6EADF]/40 dark:bg-[#3B3028]/40 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">公開探索</h2><p className="mt-1 text-xs text-text-muted">最新公開題目；訂閱後可在延伸題目持續觀看。</p></div>
      <Link to="/explore" className="min-h-11 rounded-xl bg-[#F6EADF] px-4 py-3 text-sm text-[#865E3F] dark:bg-[#3B3028] dark:text-[#D8B99E]">探索公開題目</Link></div>
    <div className="grid gap-3 sm:grid-cols-2">{rows.map(r => <Link key={r.entry_id} to={`/explore?collection_id=${encodeURIComponent(r.collection_id)}&focus=${encodeURIComponent(r.entry_id)}`} className="flex items-start gap-3 rounded-2xl bg-surface p-3">
      <img loading="lazy" src={imageUrl(r.collection_id, r.entry_id)} alt="" className="exam-paper-image h-24 w-28 shrink-0 rounded-xl bg-white object-contain" />
      <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{r.title}</p><p className="mt-1 text-xs text-text-muted">{r.collection_title} · {r.topic_label || '未提供官方分類'}</p><p className="mt-2 text-xs text-[#865E3F] dark:text-[#D8B99E]">{r.is_subscribed ? '已訂閱' : '尚未訂閱'}</p></div>
    </Link>)}</div>
    {!rows.length && !error && <p className="text-sm text-text-muted">{busy ? '正在讀取公開題目…' : '目前沒有可探索的公開題目。'}</p>}
    {error && <p role="alert" className="text-sm text-status-eraser">公開題目暫時無法取得：{error}<button className="ml-3 underline" onClick={() => setRevision(v => v + 1)}>重新讀取</button></p>}
  </section>;
}
