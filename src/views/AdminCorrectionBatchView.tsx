import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
import { sharingApi } from '../services/sharingApi';
import { composeProblemImage } from '../utils/exportImage';
import { PersonalTopicSelect } from '../components/PersonalTopicSelect';
import type { PersonalQuestionRef } from '../types/learning';
import type { CorrectionBatchCandidate, CorrectionBatchInput, CorrectionBatchJob, CorrectionBatchMode } from '../types/correctionBatch';

const base = '/admin/correction-batches';
const keyFor = (ref: PersonalQuestionRef) => `${ref.kind}:${ref.kind === 'owned' ? ref.itemId : ref.savedRefId}`;
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-40';
const field = 'min-h-11 min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm';
const statuses: Record<CorrectionBatchJob['status'], string> = {
  submitting: '正在提交', unknown: '待查明提交結果', running: 'Google 處理中', complete: '已匯入結果', failed: '未完成', cancelled: '已取消',
};
type Page = { candidates: CorrectionBatchCandidate[]; next: string | null; model: string; promptVersion: string };

export function AdminCorrectionBatchView() {
  const uid = useStore(s => s.currentUser?.id);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [kind, setKind] = useState<'owned' | 'saved'>('owned'), [topic, setTopic] = useState('');
  const [mode, setMode] = useState<CorrectionBatchMode>('missing');
  const [since, setSince] = useState(''), [until, setUntil] = useState('');
  const [page, setPage] = useState<Page | null>(null), [selected, setSelected] = useState<PersonalQuestionRef[]>([]);
  const [jobs, setJobs] = useState<CorrectionBatchJob[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(''), [failures, setFailures] = useState<string[]>([]);
  const controller = useRef(new AbortController()), stop = useRef(false), running = useRef(false);
  const sessionValid = () => !controller.current.signal.aborted && useStore.getState().currentUser?.id === uid;
  const fetchJobs = async (older = false) => {
    const before = older ? jobs.at(-1)?.createdAt : undefined;
    const result = await sharingApi<{ jobs: CorrectionBatchJob[] }>(base + (before ? `?before=${encodeURIComponent(before)}` : ''), 'GET', undefined, controller.current.signal);
    if (sessionValid()) setJobs(old => older ? [...old, ...result.jobs.filter(j => !old.some(o => o.id === j.id))] : result.jobs);
  };
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort; stop.current = false; running.current = false;
    setAllowed(null); setPage(null); setSelected([]); setJobs([]); setBusy(false); setSubmitting(false); setProgress(''); setFailures([]); setError(''); setRefreshProgress(''); setRefreshing(false);
    if (uid) void sharingApi<{ isAdmin: boolean }>('/admin/me', 'GET', undefined, abort.signal).then(async me => {
      if (abort.signal.aborted) return;
      setAllowed(me.isAdmin); if (me.isAdmin) await fetchJobs();
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { stop.current = true; abort.abort(); };
  }, [uid]);
  const act = async (fn: () => Promise<void>) => {
    if (running.current || !sessionValid()) return;
    running.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { if (sessionValid()) setError(e instanceof Error ? e.message : '操作失敗'); }
    finally { if (sessionValid()) { running.current = false; setBusy(false); } }
  };
  const search = (after = '') => void act(async () => {
    const params = new URLSearchParams({ kind, mode, topic, since, until, after });
    const result = await sharingApi<Page>(`${base}/candidates?${params}`, 'GET', undefined, controller.current.signal);
    if (sessionValid()) { setPage(result); setSelected([]); }
  });
  const changeScope = (fn: () => void) => { fn(); setPage(null); setSelected([]); };
  const updateJob = (job: CorrectionBatchJob) => { setJobs(old => [job, ...old.filter(j => j.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); window.dispatchEvent(new Event('redolve:corrections')); };
  const refreshAll = () => void act(async () => {
    setRefreshing(true); setRefreshProgress('正在取得所有待更新工作…');
    const signal = controller.current.signal;
    try {
      // Collect IDs first so imports cannot change the pagination while scanning.
      const ids = new Set<string>();
      let after: string | null = '';
      do {
        const result: { ids: string[]; next: string | null } = await sharingApi(
          `${base}/refresh-targets?after=${encodeURIComponent(after)}`, 'GET', undefined, signal);
        if (!sessionValid()) return;
        result.ids.forEach(id => ids.add(id));
        after = result.next;
      } while (after);
      await fetchJobs();
      let checked = 0, completed = 0, pending = 0;
      const failed: string[] = [];
      for (const id of ids) {
        if (!sessionValid()) return;
        setRefreshProgress(`正在向 Google 更新 ${checked + 1}／${ids.size} 組`);
        try {
          const job = await sharingApi<CorrectionBatchJob>(`${base}/${encodeURIComponent(id)}/refresh`, 'POST', {}, signal);
          if (!sessionValid()) return;
          updateJob(job);
          if (job.status === 'complete') completed++;
          if (['submitting', 'unknown', 'running'].includes(job.status)) pending++;
        } catch (e) {
          if (!sessionValid()) return;
          failed.push(`${id}：${e instanceof Error ? e.message : '查詢失敗'}`);
        }
        checked++;
      }
      if (sessionValid()) {
        setRefreshProgress(ids.size ? `已更新 ${checked} 組，${completed} 組已匯入、${pending} 組仍待完成${failed.length ? `、${failed.length} 組查詢失敗` : ''}。` : '所有工作狀態已更新，目前沒有待處理工作。');
        if (failed.length) setError(failed.join('\n'));
      }
    } catch (e) {
      if (sessionValid()) setRefreshProgress('更新尚未完成，可再次按「更新全部進度」繼續。');
      throw e;
    } finally {
      if (sessionValid()) setRefreshing(false);
    }
  });
  const submit = () => void act(async () => {
    stop.current = false; setFailures([]); setSubmitting(true);
    const refs = [...selected]; let sent = 0;
    let group: { input: Omit<CorrectionBatchInput, 'imagePath' | 'ink'>; blob: Blob }[] = [];
    const sendGroup = async () => {
      if (!group.length || !sessionValid()) return;
      setProgress(`正在提交 ${group.length} 題，已送出 ${sent}／${refs.length} 題`);
      const form = new FormData(); form.set('id', crypto.randomUUID()); form.set('inputs', JSON.stringify(group.map(g => g.input)));
      group.forEach((g, i) => form.set(`image${i}`, g.blob, 'correction.jpg'));
      const response = await fetch(API_BASE + base, { method: 'POST', credentials: 'include', body: form, signal: controller.current.signal });
      const result: unknown = await response.json();
      if (!response.ok) {
        const failure = result as { error?: { message?: string } };
        throw Error(failure.error?.message || '提交未完成，請更新工作清單確認是否已送出');
      }
      if (!sessionValid()) return;
      const job = result as CorrectionBatchJob; updateJob(job);
      const sentKeys = new Set(group.map(g => keyFor(g.input.ref)));
      setSelected(old => old.filter(ref => !sentKeys.has(keyFor(ref))));
      setPage(old => old ? { ...old, candidates: old.candidates.filter(candidate => !sentKeys.has(keyFor(candidate.ref))) } : null);
      sent += group.length; group = [];
      if (job.status === 'unknown' || job.status === 'failed') { stop.current = true; setError(job.error || '提交未完成，請查看工作紀錄'); }
    };
    try {
      for (let i = 0; i < refs.length && !stop.current && sessionValid(); i++) {
        const ref = refs[i], id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
        setProgress(`準備圖片 ${i + 1}／${refs.length}，已送出 ${sent} 題`);
        try {
          const prepared = await sharingApi<CorrectionBatchInput>(`${base}/input/${ref.kind}/${encodeURIComponent(id)}`, 'GET', undefined, controller.current.signal);
          if (!sessionValid()) break;
          const blob = await composeProblemImage(API_BASE + prepared.imagePath, prepared.ink, { maxDimension: 4096, maxPixels: 6000000, type: 'image/jpeg', quality: 0.8 });
          if (!sessionValid()) break;
          if (blob.size > 2000000) throw Error('合成圖片超過 2 MB，請先縮短計算區');
          const { imagePath: _path, ink: _ink, ...input } = prepared;
          group.push({ input, blob });
        } catch (e) {
          if (sessionValid()) setFailures(old => [...old, `${id}：${e instanceof Error ? e.message : '圖片準備失敗'}`]);
        }
        if (group.length === 3) await sendGroup();
      }
      if (!stop.current && sessionValid()) await sendGroup();
    } finally {
      if (sessionValid()) { setSubmitting(false); setProgress(`本次已提交 ${sent} 題。未送出的題目保留勾選。`); await fetchJobs(); }
    }
  });
  if (!uid) return <p className="p-6">請先登入管理員帳號。</p>;
  if (allowed === false) return <p className="p-6">僅管理員可使用此功能。</p>;
  return <main className="mx-auto w-full max-w-5xl space-y-5 p-4 text-text-main sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-xl font-semibold"><Layers size={21} />舊題訂正批次整理</h1><Link className={button} to="/settings#profile">返回設定</Link></header>
    <p className="text-sm leading-relaxed text-text-muted">補齊本人已訂正題目的答案、訂正摘要與候選錯因。Google 非同步處理，目標於 24 小時內完成。結果仍需確認，不會覆蓋已確認資料。</p>
    {error && <p role="alert" className="rounded-xl border border-status-warning/25 bg-status-warning/10 p-3 text-sm">{error}</p>}
    {allowed === null ? <p role="status">確認管理員權限中…</p> : <>
      <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="batch-scope">
        <h2 id="batch-scope" className="font-medium">選擇整理範圍</h2>
        <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">題目來源<select className={field} value={kind} onChange={e => changeScope(() => setKind(e.target.value as typeof kind))}><option value="owned">本人上傳</option><option value="saved">本人存入</option></select></label>
          <div className="space-y-1 text-sm"><label htmlFor="batch-topic">科目／單元</label><PersonalTopicSelect id="batch-topic" value={topic} onChange={value => changeScope(() => setTopic(value))} emptyLabel="全部科目" disabled={busy} /></div>
          <label className="space-y-1 text-sm">辨識狀態<select className={field} value={mode} onChange={e => changeScope(() => setMode(e.target.value as CorrectionBatchMode))}><option value="missing">尚無成功的訂正分析</option><option value="outdated">尚未分析或提示詞／模型版本已更新</option><option value="all">全部已訂正題目（重新分析）</option></select></label>
          <div className="grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0 space-y-1 text-sm">最後更新起日<input className={field} type="date" value={since} onChange={e => changeScope(() => setSince(e.target.value))} /></label><label className="min-w-0 space-y-1 text-sm">最後更新迄日<input className={field} type="date" value={until} onChange={e => changeScope(() => setUntil(e.target.value))} /></label></div>
        </fieldset>
        <p className="text-xs text-text-muted">日期依台北時間篩選題目最後更新日，並非當初訂正完成日。只使用已同步的本人筆跡，請先讓其他裝置同步完成。</p>
        <button className={button} disabled={busy} onClick={() => search()}>載入題目</button>
        {page && <>
          <p className="break-words text-xs text-text-muted">本次版本 {page.promptVersion} · {page.model}。每次最多選 30 題，自動分組送出。</p>
          <div className="flex flex-wrap items-center gap-2"><button className={button} disabled={busy || !page.candidates.length} onClick={() => setSelected(page.candidates.slice(0, 30).map(c => c.ref))}>選取本頁前 30 題</button><button className={button} disabled={busy || !selected.length} onClick={() => setSelected([])}>清除選取</button><span className="text-sm text-text-muted">已選 {selected.length} 題</span></div>
          <div className="max-h-96 overflow-y-auto overscroll-contain divide-y divide-border-subtle">
            {!page.candidates.length && <p className="py-6 text-sm text-text-muted">沒有符合條件的題目；進行中的辨識工作不會重複列入。</p>}
            {page.candidates.map(candidate => {
              const checked = selected.some(r => keyFor(r) === keyFor(candidate.ref));
              return <label key={keyFor(candidate.ref)} className="flex cursor-pointer items-start gap-3 py-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={checked} disabled={busy || !checked && selected.length >= 30} onChange={e => setSelected(old => e.target.checked ? [...old, candidate.ref] : old.filter(r => keyFor(r) !== keyFor(candidate.ref)))} /><span className="min-w-0"><span className="block break-words">{candidate.title || '未命名題目'} · {candidate.topic || '未分類'}</span><span className="mt-1 block break-all text-xs text-text-muted">{keyFor(candidate.ref)} · {candidate.promptVersion || '尚無可辨認的分析版本'}{candidate.confirmed ? ' · 已確認內容會保留' : ''}</span></span></label>;
            })}
          </div>
          {page.next && <button className={button} disabled={busy} onClick={() => search(page.next!)}>下一頁題目（清除目前勾選）</button>}
        </>}
        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"><button className={button + ' bg-primary/10 text-primary-600 dark:text-primary-700'} disabled={busy || !selected.length} onClick={submit}>提交 {selected.length || ''} 題至 Google Batch</button>{submitting && <button className={button} onClick={() => { stop.current = true; }}>停止後續送出</button>}</div>
        <p className="text-xs text-text-muted">準備與送出期間請留在此頁；送出後可關閉。再次進入後按「更新全部進度」收取結果。</p>
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {failures.length > 0 && <details open><summary className="text-sm">未送出 {failures.length} 題</summary><ul className="mt-2 space-y-1 break-words text-xs text-text-muted">{failures.map((message, i) => <li key={i}>{message}</li>)}</ul></details>}
      </section>
      <section className="space-y-3" aria-labelledby="batch-jobs"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="batch-jobs" className="font-medium">批次工作</h2><button className={button} disabled={busy} onClick={refreshAll}><RefreshCw size={15} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />{refreshing ? '更新中…' : '更新全部進度'}</button></div>
        <Link className={button + ' bg-primary/10 text-primary-600 dark:text-primary-700'} to="/admin/correction-batches/all/review">校正全部題目</Link>
        <p className="text-xs text-text-muted">合併所有批次，依最新辨識排序，同一題保留最新批次結果。</p>
        {refreshProgress && <p role="status" className="text-sm text-text-muted">{refreshProgress}</p>}
        {!jobs.length && <p className="py-4 text-sm text-text-muted">尚無批次工作。</p>}
        {jobs.map(job => <article key={job.id} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{statuses[job.status]} · {job.items.length} 題</h3><time className="text-xs text-text-muted">{new Date(job.createdAt).toLocaleString('zh-TW')}</time></div>
          <p className="break-words text-xs text-text-muted">{job.promptVersion} · {job.model} · 成功 {job.items.filter(i => i.status === 'complete').length}／失敗 {job.items.filter(i => i.status === 'failed').length}</p>
          {job.error && <p className="text-sm text-text-muted">{job.error}</p>}
          {job.items.length > 0 && <Link className={button + ' bg-primary/10 text-primary-600 dark:text-primary-700'} to={`/admin/correction-batches/${encodeURIComponent(job.id)}/review`}>開啟校正工作區</Link>}
          <div className="flex flex-wrap gap-2">{(!job.cleaned || ['running', 'submitting', 'unknown'].includes(job.status)) && <button className={button} disabled={busy} onClick={() => void act(async () => { const result = await sharingApi<CorrectionBatchJob>(`${base}/${job.id}/refresh`, 'POST', {}, controller.current.signal); if (sessionValid()) updateJob(result); })}>更新進度並匯入</button>}
            {['running', 'unknown', 'submitting'].includes(job.status) && <button className={button} disabled={busy} onClick={() => void act(async () => { const result = await sharingApi<CorrectionBatchJob>(`${base}/${job.id}/cancel`, 'POST', {}, controller.current.signal); if (sessionValid()) updateJob(result); })}>取消並清理</button>}
            {job.items.some(i => i.status === 'failed') && <button className={button} disabled={busy} onClick={() => { setSelected(job.items.filter(i => i.status === 'failed').map(i => i.ref)); setProgress('已選取這組失敗題目，可按上方提交重試。'); }}>選取失敗題目重試</button>}
          </div>
          <details><summary className="cursor-pointer text-sm text-text-muted">逐題結果與確認</summary><ul className="mt-3 space-y-2">{job.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-page-bg p-3 text-xs"><span className="min-w-0 break-all">{keyFor(item.ref)} · {item.adopted ? '已採用' : item.status === 'complete' ? '待確認建議' : item.status === 'pending' ? '處理中' : item.error || '未完成'}</span><Link className={button} to={`/admin/correction-batches/${encodeURIComponent(job.id)}/review?question=${encodeURIComponent(item.id)}`}>檢視圖片與校正</Link></li>)}</ul></details>
        </article>)}
        {jobs.length >= 20 && <button className={button} disabled={busy} onClick={() => void act(() => fetchJobs(true))}>載入較早工作</button>}
      </section>
    </>}
  </main>;
}
