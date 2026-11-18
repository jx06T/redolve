import { useEffect, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { sharingApi } from '../services/sharingApi';
import { API_BASE } from '../services/api';
import { composeProblemImage } from '../utils/exportImage';
import { RichText } from './RichText';
import type { PersonalQuestionRef } from '../types/learning';
import type { CorrectionBatchInput } from '../types/correctionBatch';

const control = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-3 text-sm disabled:opacity-40';

/** Read-only images. Uses the same personal ink composition as recognition. */
export function CorrectionImageCompare({ questionRef }: { questionRef: PersonalQuestionRef }) {
  const [images, setImages] = useState<{ original: string; corrected: string; notes: string }>();
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<'corrected' | 'original' | 'compare'>('corrected');
  const [zoom, setZoom] = useState(1);
  const id = questionRef.kind === 'owned' ? questionRef.itemId : questionRef.savedRefId;
  useEffect(() => {
    const abort = new AbortController(), urls: string[] = [];
    setImages(undefined); setError(''); setZoom(1);
    const load = async () => {
      const input = await sharingApi<CorrectionBatchInput>(`/admin/correction-batches/input/${questionRef.kind}/${encodeURIComponent(id)}`, 'GET', undefined, abort.signal);
      const response = await fetch(API_BASE + input.imagePath, { credentials: 'include', cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw Error('原圖載入失敗，請重試');
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const original = URL.createObjectURL(blob); urls.push(original);
      const correctedBlob = await composeProblemImage(original, input.ink, { maxDimension: 4096, maxPixels: 6000000, type: 'image/jpeg', quality: 0.9 });
      if (abort.signal.aborted) return;
      const corrected = URL.createObjectURL(correctedBlob); urls.push(corrected);
      setImages({ original, corrected, notes: input.notes || '' });
    };
    void load().catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '圖片載入失敗'); });
    return () => { abort.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [questionRef.kind, id, retry]);
  const view = (url: string, label: string) => <div className="flex min-h-0 min-w-0 flex-col gap-2">
    {mode === 'compare' && <h3 className="text-xs text-text-muted">{label}</h3>}
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-border-subtle bg-page-bg" tabIndex={0} aria-label={label + '，可捲動'}>
      <div style={{ width: `${zoom * 100}%` }}><img className="exam-paper-image block h-auto w-full max-w-none" src={url} alt={label} draggable={false} /></div>
    </div>
  </div>;
  return <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-3" aria-label="原圖與本人訂正">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="圖片顯示方式">
        {([['corrected', '本人訂正'], ['original', '原圖'], ['compare', '並排比較']] as const).map(([value, label]) =>
          <button key={value} className={control + (mode === value ? ' bg-primary/10 text-primary-600 dark:text-primary-700' : '')} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="圖片縮放">
        <button className={control} aria-label="縮小圖片" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.25))}><Minus size={16} /></button>
        <button className={control} aria-label="還原圖片大小" onClick={() => setZoom(1)}><RotateCcw size={15} /><span className="ml-1">{Math.round(zoom * 100)}%</span></button>
        <button className={control} aria-label="放大圖片" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.25))}><Plus size={16} /></button>
      </div>
    </div>
    <p className="text-xs text-text-muted">顯示目前已同步的原圖與本人訂正筆跡，放大後可捲動查看。</p>
    {!images && !error && <p role="status" className="p-4 text-sm text-text-muted">載入原圖與訂正內容…</p>}
    {error && <div className="space-y-2 p-3"><p role="alert" className="text-sm">{error}</p><button className={control} onClick={() => setRetry(value => value + 1)}>重新載入圖片</button></div>}
    {images && <>
      <div className={'grid min-h-0 flex-1 gap-3 ' + (mode === 'compare' ? 'grid-cols-2' : 'grid-cols-1')}>
        {mode !== 'corrected' && view(images.original, '原圖')}
        {mode !== 'original' && view(images.corrected, '原圖與本人訂正筆跡')}
      </div>
      {images.notes && <details className="max-h-40 shrink-0 overflow-auto border-t border-border-subtle pt-2"><summary className="cursor-pointer text-sm">本人訂正筆記</summary><RichText className="mt-2 text-sm" text={images.notes} /></details>}
    </>}
  </section>;
}
