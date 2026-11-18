import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { sharingApi } from '../services/sharingApi';
import { useStore } from '../store/useStore';
import { LearningDataPanel } from '../components/LearningDataPanel';
import { CorrectionImageCompare } from '../components/CorrectionImageCompare';
import type { CorrectionBatchJob } from '../types/correctionBatch';
import type { LearningQuestion } from '../types/learning';

const button = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border-subtle px-3 text-sm disabled:opacity-40';

export function AdminCorrectionReviewView() {
  const { batchId = '' } = useParams();
  const uid = useStore(state => state.currentUser?.id);
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const [job, setJob] = useState<CorrectionBatchJob>(), [error, setError] = useState('');
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<LearningQuestion>(), [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const index = job?.items.findIndex(item => item.id === params.get('question')) ?? -1;
  const activeIndex = index < 0 ? 0 : index;
  const item = job?.items[activeIndex];

  useEffect(() => {
    const abort = new AbortController(); setJob(undefined); setError('');
    if (uid) void sharingApi<CorrectionBatchJob>(`/admin/correction-batches/${encodeURIComponent(batchId)}`, 'GET', undefined, abort.signal)
      .then(value => { if (!abort.signal.aborted) setJob(value); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [uid, batchId, reload]);
  useEffect(() => {
    if (job?.items.length && index < 0) setParams({ question: job.items[0].id }, { replace: true });
  }, [job, index, setParams]);
  useEffect(() => { setCurrent(undefined); setDirty(false); setSaving(false); setMessage(''); }, [item?.id]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const link = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
      if (saving || !window.confirm('這題有尚未儲存的修改，確定離開？')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', link, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', link, true); };
  }, [dirty, saving]);
  const canLeave = () => !saving && (!dirty || window.confirm('這題有尚未儲存的修改，確定離開？'));
  const go = (next: number) => {
    if (!job?.items[next] || !canLeave()) return;
    setParams({ question: job.items[next].id }, { replace: true });
  };
  const back = () => { if (canLeave()) navigate('/admin/correction-batches'); };
  const markSaved = (question: LearningQuestion) => {
    setCurrent(question); setDirty(false); setMessage('已儲存並確認，可以繼續下一題。');
    setJob(old => old ? { ...old, items: old.items.map(entry => entry.id === item?.id ? { ...entry, adopted: question.correction?.id === entry.id && question.correction.adopted } : entry) } : old);
    window.dispatchEvent(new Event('redolve:corrections'));
  };
  return <div className="flex h-full min-h-0 flex-col gap-3 text-text-main">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3"><button className={button} disabled={saving} onClick={back}><ArrowLeft size={16} />返回批次</button><h1 className="text-lg font-semibold">批次校正</h1></div>
      {job && <div className="flex items-center gap-2"><button className={button} aria-label="上一題" disabled={saving || activeIndex === 0} onClick={() => go(activeIndex - 1)}><ChevronLeft size={18} /></button>
        <label className="sr-only" htmlFor="review-question">切換校正題目</label>
        <select id="review-question" className="min-h-11 max-w-44 rounded-xl border border-border-subtle bg-surface px-2 text-sm" value={item?.id || ''} disabled={saving} onChange={event => go(job.items.findIndex(entry => entry.id === event.target.value))}>
          {job.items.map((entry, i) => <option key={entry.id} value={entry.id}>第 {i + 1}／{job.items.length} 題{entry.adopted ? ' · 已確認' : entry.status === 'complete' ? ' · 待校正' : ' · 未完成'}</option>)}
        </select>
        <button className={button} aria-label="下一題" disabled={saving || activeIndex >= job.items.length - 1} onClick={() => go(activeIndex + 1)}><ChevronRight size={18} /></button></div>}
    </header>
    {error && <div className="space-y-2 rounded-2xl border border-border-subtle bg-surface p-4"><p role="alert">{error}</p><button className={button} onClick={() => setReload(value => value + 1)}>重新載入</button></div>}
    {!uid && <p>請先登入管理員帳號。</p>}
    {uid && !job && !error && <p role="status">載入批次題目…</p>}
    {job && !item && <p>這組工作目前沒有可校正的題目。</p>}
    {item && <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span className="break-all">{item.ref.kind === 'owned' ? '上傳題' : '存入題'} · {item.ref.kind === 'owned' ? item.ref.itemId : item.ref.savedRefId}</span>
        <span>{dirty ? '有尚未儲存的修改' : message || (item.adopted ? '已確認' : '檢查後採用並確認')}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,45%)_minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] md:grid-rows-1">
        <CorrectionImageCompare key={`${uid}:${item.id}`} questionRef={item.ref} />
        <section className="min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-2xl" aria-label="校正辨識資料">
          {current?.correction?.id !== undefined && current.correction.id !== item.id && <p className="mb-3 rounded-xl bg-status-warning/10 p-3 text-sm">此題已有較新的辨識工作，目前顯示最新建議，請對照目前圖片校正。</p>}
          {item.status !== 'complete' && <p className="mb-3 rounded-xl bg-status-warning/10 p-3 text-sm">{item.error || '這題尚未完成批次辨識，可先手動校正現有資料。'}</p>}
          <LearningDataPanel key={`${uid}:${item.id}`} questionRef={item.ref} onLoaded={setCurrent} onSaved={markSaved} onDirtyChange={setDirty} onCloseBlockedChange={setSaving} stickyActions />
        </section>
      </div>
    </>}
  </div>;
}
