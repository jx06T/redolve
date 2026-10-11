import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Share2, Star } from 'lucide-react';
import { ShareModal } from './ShareModal';
import { AppDialog } from './AppDialog';
import { DrawCanvas } from './DrawCanvas';
import { SwitchRow } from './SwitchRow';
import { useStore } from '../store/useStore';
import { workService } from '../services/workService';
import { libraryService } from '../services/libraryService';
import { subscriptionService } from '../services/questionService';
import { sharingApi } from '../services/sharingApi';
import { savedStudyUrl } from '../services/navigationState';
import type { WorkContent } from '../types/question';
import { CollectionSubscriptionButton } from './CollectionSubscriptionButton';
import { isGuestUser } from '../utils/guest';

export function ExternalQuestionCard({ id, collectionId, subscribed = false, starred = false, savedId, onSaved, onStar, onRead, knownSubscribed = false, publicContext = false, isOwner = false, subscriptionStatusReady = true, onSubscriptionChanged }: {
  id: string; collectionId: string; subscribed?: boolean; starred?: boolean; savedId?: string | null; knownSubscribed?: boolean;
  onSaved?: (savedId: string) => void; onStar?: (starred: boolean) => void; onRead?: () => void;
  publicContext?: boolean; isOwner?: boolean; subscriptionStatusReady?: boolean; onSubscriptionChanged?: (subscribed: boolean) => void;
}) {
  const user = useStore(s => s.currentUser); const account = isGuestUser(user) ? '' : user!.id;
  const { setAuthModalOpen, showToast } = useStore();
  const [content, setContent] = useState<WorkContent>(); const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0); const [saved, setSaved] = useState(savedId || '');
  const [imageReady, setImageReady] = useState(false);
  const [star, setStar] = useState(starred); const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'report' | 'share' | 'duplicate' | null>(null);
  const [reason, setReason] = useState(''); const [existing, setExisting] = useState('');
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const imageArea = useRef<HTMLDivElement>(null); const [areaWidth, setAreaWidth] = useState(800);
  useEffect(() => { const node = imageArea.current; if (!node) return; const observer = new ResizeObserver(() => setAreaWidth(node.clientWidth)); observer.observe(node); setAreaWidth(node.clientWidth); return () => observer.disconnect(); }, [content]);
  const referenceLayers = content?.layers.filter(l => visible[l.id] ?? (!l.legacy && l.authorId === content.shared?.source.contributor_id)) || [];
  const referenceHeight = Math.max(0, ...referenceLayers.map(l => l.ink ? (l.ink.calcSpaceHeight || 0) * areaWidth / (l.ink.baseWidth || 800) : 0));
  useEffect(() => setSaved(savedId || ''), [savedId]);
  useEffect(() => setStar(starred), [starred]);
  useEffect(() => {
    const abort = new AbortController(); setContent(undefined); setImageReady(false); setFailure('');
    void workService.loadShared(collectionId, id, '', abort.signal).then(d => {
      if (abort.signal.aborted) return; setContent(d);
    }).catch(e => { if (!abort.signal.aborted) setFailure(e.message); });
    const recheck = () => { void workService.loadShared(collectionId, id, '', abort.signal).then(d => { if (!abort.signal.aborted) setContent(d); }).catch(e => { if (!abort.signal.aborted) { setContent(undefined); setFailure(e.message); } }); };
    window.addEventListener('focus', recheck); return () => { abort.abort(); window.removeEventListener('focus', recheck); };
  }, [collectionId, id, account, retry, subscribed]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setFailure(''); try { await fn(); }
      catch (e) { setFailure(e instanceof Error ? e.message : '操作失敗'); } finally { setBusy(false); }
  };
  const save = async () => {
    const result = await libraryService.save(id); setSaved(result.saved_id); setDialog(null);
    onSaved?.(result.saved_id); showToast('已存入「我存入」，可繼續私人訂正', 'success');
  };
  return <article data-reader-loading={!failure && (!content || !imageReady)} className={`rounded-3xl border bg-surface p-4 sm:p-5 ${subscribed ? 'border-[#DCE8E0]' : 'border-[#E7D6C6]'}`}>
    <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{content ? `${content.provider}的${publicContext || content.shared?.collection.visibility === 'public' ? '公開' : '共用'}題目` : '題目'}</h2>
        {content && <p className="mt-1 text-xs text-text-muted">來源：{content.title} · <Link to={subscribed || knownSubscribed ? `/extended?collection_id=${encodeURIComponent(collectionId)}` : publicContext || content.shared?.collection.visibility === 'public' ? `/explore?collection_id=${encodeURIComponent(collectionId)}` : `/collections/${encodeURIComponent(collectionId)}`} className="underline">{content.collectionTitle}</Link></p>}
      </div>
      <div className="flex items-center gap-1 text-text-muted"><span className={`mr-1 rounded-lg px-2 py-1 text-xs ${subscribed || knownSubscribed ? 'bg-[#EAF1EC] dark:bg-[#26362F]' : 'bg-[#F6EADF] dark:bg-[#3B3028]'}`}>{!subscriptionStatusReady ? '確認訂閱中' : subscribed || knownSubscribed ? '已訂閱' : publicContext || content?.shared?.collection.visibility === 'public' ? '公開' : '共用'}</span>
        {subscribed && <button disabled={busy} aria-label={star ? '取消星號' : '標記星號'} title={star ? '取消星號' : '標記星號'} aria-pressed={star} onClick={() => void act(async () => { await subscriptionService.star(collectionId, id, !star); onStar?.(!star); setStar(v => !v); })} className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-neutral-100 aria-pressed:bg-primary/10 aria-pressed:text-primary"><Star size={16} fill={star ? 'currentColor' : 'none'} /></button>}
        <button aria-label="檢舉" title="檢舉題目" onClick={() => { if (!account) setAuthModalOpen(true); else setDialog('report'); }} className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-neutral-100"><Flag size={16} /></button>
        <button aria-label="分享連結" title="分享此題" onClick={() => setDialog('share')} className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-neutral-100"><Share2 size={16} /></button>
      </div>
    </header>
    {content ? <>
      <p className="mb-3 text-xs text-text-muted">{content.shared?.source.topic_label || '未提供官方分類'}{(() => { try { const tags = JSON.parse(content.shared?.source.keywords || '[]'); return Array.isArray(tags) && tags.length ? ' · ' + tags.join('、') : ''; } catch { return ''; } })()}</p>
      <div ref={imageArea} className="relative overflow-hidden rounded-2xl border border-border-subtle">
        <img src={content.image} alt={content.title} className="exam-paper-image block w-full h-auto" onLoad={() => { setImageReady(true); if ((subscribed || knownSubscribed) && account) void sharingApi(`/subscriptions/${collectionId}/items/${id}/read`, 'PUT', {}).then(() => onRead?.()).catch(() => { }); }} onError={() => { setImageReady(true); setFailure('題圖暫時無法載入，請重試。'); }} />
        {referenceHeight > 0 && <div aria-hidden style={{ height: referenceHeight }} className="border-t border-dashed border-border-subtle bg-page-bg" />}
        {referenceLayers.map(l => l.ink &&
          <div key={l.id} className="pointer-events-none absolute inset-0"><DrawCanvas initialDrawData={l.ink} readOnly inkVisible /></div>)}
      </div>
      {content.layers.length > 0 && <details className="mt-3 rounded-2xl bg-page-bg p-3"><summary className="text-sm cursor-pointer">共用參考內容</summary>
        {content.layers.map(l => <div key={l.id} className="mt-2">
          {l.ink && <SwitchRow label={`${l.author}的筆跡`} checked={visible[l.id] ?? (!l.legacy && l.authorId === content.shared?.source.contributor_id)}
            onChange={value => setVisible(v => ({ ...v, [l.id]: value }))} />}
          {l.notes && <details className="mt-2 text-sm"><summary className="cursor-pointer">{l.author} · {l.notes.slice(0, 60)}{l.notes.length > 60 ? '…' : ''}</summary><p className="mt-2 whitespace-pre-wrap">{l.notes}</p></details>}
        </div>)}</details>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-3 text-xs">
        {account === content.shared?.source.contributor_id ? <Link to={`/study?source=owned&focus=${content.shared.source.id}`} className="rounded-xl bg-page-bg px-3 py-3">我的原題 · 前往訂正</Link> :
          saved ? <Link to={savedStudyUrl(saved)} className="rounded-xl bg-[#EAF1EC] dark:bg-[#26362F] px-3 py-3">已存入 · 前往訂正</Link> :
            <button disabled={busy} onClick={() => {
              if (!account) { setAuthModalOpen(true); return; }
              void act(async () => {
                const d = await libraryService.inspectSave(id);
                if (d.own_source) { showToast('這是你上傳的原題，請到「我上傳」訂正', 'info'); return; }
                if (d.existing_id) { setExisting(d.existing_id); setDialog('duplicate'); } else await save();
              });
            }}
              className="rounded-xl bg-primary/10 px-3 py-3 text-primary disabled:opacity-40">存入我的題庫</button>}
        {onSubscriptionChanged && <CollectionSubscriptionButton collectionId={collectionId} subscribed={subscribed || knownSubscribed} isOwner={isOwner || content.shared?.collection.is_owner} statusReady={subscriptionStatusReady} onChanged={onSubscriptionChanged} />}
      </div>
    </> : !failure && <p className="p-5 text-sm text-text-muted">正在載入題圖與參考內容…</p>}
    {failure && <p role="alert" className="mt-3 text-sm text-status-eraser">{failure}
      <button onClick={() => setRetry(v => v + 1)} className="ml-3 underline">重新載入</button></p>}
    <ShareModal isOpen={dialog === 'share'} target={{kind:'collection',collectionId,entryId:id}} canCreate={!!content?.shared?.capabilities.can_create_share} onClose={() => setDialog(null)}/>
    {dialog && dialog !== 'share' && <AppDialog title={dialog === 'report' ? '檢舉題目' : '你已從其他集合存入相同原題'} busy={busy} onClose={() => setDialog(null)}>
      {dialog === 'duplicate' ? <><p className="text-sm">你可以沿用已存版本，或另存此集合的參考內容。兩份私人訂正互相獨立。</p>
          <Link to={savedStudyUrl(existing)} className="mt-3 inline-block rounded-xl bg-page-bg px-4 py-2">前往已存版本</Link>
          <button disabled={busy} onClick={() => void act(save)} className="mt-3 ml-2 rounded-xl bg-primary px-4 py-2 text-white">另存此來源</button></> :
          <><label className="block text-sm">檢舉原因<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3" /></label>
            <button disabled={busy || !reason.trim()} onClick={() => void act(async () => {
              await sharingApi(`/collections/${collectionId}/reports`, 'POST', { entry_id: id, category: 'other', detail: reason.trim() }); setDialog(null); showToast('檢舉已送出', 'success');
            })} className="mt-3 rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40">送出檢舉</button></>}
      {failure && <p role="alert" className="mt-3 text-sm text-status-eraser">{failure}</p>}
    </AppDialog>}
  </article>;
}
