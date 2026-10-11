import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { useRememberedReaderParams } from '../hooks/useRememberedReaderParams';
import { ExternalQuestionCard } from '../components/ExternalQuestionCard';
import { QuestionStream } from '../components/QuestionStream';
import { FloatingReaderControls } from '../components/FloatingReaderControls';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection, type CollectionEntry } from '../services/sharingApi';
import { subscriptionService } from '../services/questionService';
import type { Subscription } from '../types/question';
import { isGuestUser } from '../utils/guest';
import { LoginNotice } from '../components/LoginNotice';

type Row = CollectionEntry & { collection_id?: string; is_owner?: boolean };
const storedSort = (account: string) => { try { return localStorage.getItem(`rdv:subscription-sort:${account}`) || 'subscribed'; } catch { return 'subscribed'; } };
const readerCache = new Map<string, { rows: Row[]; cursor: { display_order: number; id: string } | null; offset: number | null }>();
export function CollectionReaderView({ mode }: { mode: 'extended' | 'explore' | 'collection' }) {
  const navigate = useNavigate(); const route = useParams();
  const { currentUser } = useStore(); const account = isGuestUser(currentUser) ? '' : currentUser!.id;
  const [params, setParams] = useRememberedReaderParams(mode === 'collection' ? null : mode, account || 'guest');
  const navigation = useNavigationType();
  const id = mode === 'collection' ? route.id || '' : params.get('collection_id') || '';
  const query = params.get('q') || ''; const filter = params.get('state') || ''; const sort = params.get('sort') || storedSort(account);
  const [controlsOpen, setControlsOpen] = useState(mode === 'extended' && !id);
  const [subs, setSubs] = useState<Subscription[]>([]); const listQuery = params.get('list_q') || '';
  const [collection, setCo] = useState<Collection>(); const [queryDraft, setQueryDraft] = useState(query);
  const [dataKey, setDataKey] = useState('');
  const [rows, setRows] = useState<Row[]>([]); const [cursor, setCursor] = useState<{ display_order: number; id: string } | null>(null);
  const [offset, setOffset] = useState<number | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0); const [newItems, setNewItems] = useState(false);
  const [subscriptionRevision, setSubscriptionRevision] = useState(0); const [subscriptionAccount, setSubscriptionAccount] = useState<string | null>(null);
  const [subsBusy, setSubsBusy] = useState(true); const [subsError, setSubsError] = useState('');
  const [publicSets, setPublicSets] = useState<Collection[]>([]); const [publicSetsError, setPublicSetsError] = useState('');
  const abortRef = useRef<AbortController>(); const key = JSON.stringify([mode, id, query, filter, account]); const active = useRef(key); active.current = key;
  const co = dataKey === key ? collection : undefined;

  useEffect(() => setQueryDraft(query), [query]);
  useEffect(() => { setControlsOpen(mode === 'extended' && !id); }, [mode, account]);
  useEffect(() => { try { localStorage.setItem(`rdv:subscription-sort:${account}`, sort); } catch {/* Sorting remains usable without local storage. */ } }, [account, sort]);
  useEffect(() => {
    setSubs([]); setSubscriptionAccount(null); setSubsError(''); setSubsBusy(!!account); if (!account) { setSubscriptionAccount(''); return; }
    const abort = new AbortController(); void subscriptionService.list(abort.signal).then(s => {
      if (!abort.signal.aborted) { setSubs(s); setSubscriptionAccount(account); }
    }).catch(e => { if (!abort.signal.aborted) setSubsError(e.message); }).finally(() => { if (!abort.signal.aborted) setSubsBusy(false); }); return () => abort.abort();
  }, [account, subscriptionRevision]);
  useEffect(() => {
    setPublicSets([]); setPublicSetsError(''); if (mode !== 'explore') return; const abort = new AbortController();
    void sharingApi<{ collections: Collection[] }>('/public/collections?exclude_subscribed=yes', 'GET', undefined, abort.signal).then(r => { if (!abort.signal.aborted) setPublicSets(r.collections); })
      .catch(e => { if (!abort.signal.aborted) setPublicSetsError(e.message); }); return () => abort.abort();
  }, [mode, account, revision]);
  const subscribed = subscriptionAccount === account && subs.some(s => s.collection_id === id);
  const subscriptionStatusReady = !account || subscriptionAccount === account;
  const ready = mode !== 'extended' || subscriptionAccount === account && subs.some(s => s.collection_id === id && s.can_read);
  const publicFeed = mode === 'explore' && !id;
  useEffect(() => {
    if (mode !== 'collection' || !co || !subscriptionStatusReady) return;
    if (subscribed || co.visibility === 'public') {
      const next = new URLSearchParams(params); next.set('collection_id', id);
      navigate(`${subscribed ? '/extended' : '/explore'}?${next}`, { replace: true });
    }
  }, [mode, co, subscriptionStatusReady, subscribed, id, navigate, params]);
  const subscriptionChanged = (next: boolean, collectionId: string, entryId: string) => {
    setSubscriptionRevision(v => v + 1); setRevision(v => v + 1);
    const dest = next ? '/extended' : co?.visibility && co.visibility !== 'public' ? `/collections/${encodeURIComponent(collectionId)}` : '/explore';
    navigate(`${dest}?collection_id=${encodeURIComponent(collectionId)}&focus=${encodeURIComponent(entryId)}`);
  };
  useEffect(() => { if (mode === 'explore' && id && subscribed && subscriptionStatusReady) navigate(`/extended?collection_id=${encodeURIComponent(id)}${params.get('focus') ? '&focus=' + encodeURIComponent(params.get('focus')!) : ''}`, { replace: true }); }, [mode, id, subscribed, subscriptionStatusReady, navigate, params]);
  const patch = (values: Record<string, string>, replace = false) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k)); next.delete('focus'); setParams(next, { replace }); };
  const load = async (more = false) => {
    abortRef.current?.abort(); const abort = new AbortController(); abortRef.current = abort; setError('');
    if (mode !== 'explore' && !id) { setRows([]); setBusy(false); return; }
    if (mode === 'extended' && !ready) { setRows([]); setBusy(false); return; }
    setBusy(true);
    try {
      const p = new URLSearchParams({ q: query }); if (filter) p.set('state', filter);
      if (publicFeed) {
        p.set('exclude_subscribed', 'yes'); p.set('offset', String(more ? offset || 0 : 0));
        const result = await sharingApi<{ items: (Row & { entry_id: string })[]; next_offset: number | null }>(`/public/items?${p}`, 'GET', undefined, abort.signal);
        if (abort.signal.aborted || active.current !== key) return;
        setDataKey(key);
        setRows(old => more ? [...old, ...result.items.map(x => ({ ...x, id: x.entry_id }))] : result.items.map(x => ({ ...x, id: x.entry_id }))); setOffset(result.next_offset);
      } else {
        p.set('sort', 'recent'); if (more && cursor) { p.set('after_order', String(cursor.display_order)); p.set('after_id', cursor.id); }
        const result = await sharingApi<{ collection: Collection; items: Row[]; next_cursor: typeof cursor }>(`/collections/${id}?${p}`, 'GET', undefined, abort.signal);
        if (abort.signal.aborted || active.current !== key) return;
        if (mode === 'explore' && result.collection.visibility !== 'public') throw new Error('此集合不屬於公開探索。請由獲准的共用連結觀看。');
        setDataKey(key);
        setCo(result.collection);
        const cached = !more && navigation === 'POP' && revision === 0 ? readerCache.get(key) : undefined;
        if (cached) { setRows(cached.rows); setCursor(cached.cursor); setNewItems(!!result.items[0] && cached.rows[0]?.id !== result.items[0].id); }
        else { setRows(old => more ? [...old, ...result.items.filter(i => !old.some(x => x.id === i.id))] : result.items); setCursor(result.next_cursor); }
      }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '載入失敗'); } finally { if (!abort.signal.aborted) setBusy(false); }
  };
  useEffect(() => { setDataKey(''); setRows([]); setCo(undefined); setCursor(null); setOffset(null); setNewItems(false); void load(); return () => abortRef.current?.abort(); }, [key, ready, revision]);
  useEffect(() => { if (!rows.length || dataKey !== key) return; readerCache.set(key, { rows, cursor, offset }); if (readerCache.size > 20) readerCache.delete(readerCache.keys().next().value!); }, [key, dataKey, rows, cursor, offset]);
  useEffect(() => {
    if (!id || !ready) return;
    const abort = new AbortController();
    const listener = () => {
      void sharingApi<{ items: Row[] }>(`/collections/${id}?sort=recent`, 'GET', undefined, abort.signal).then(r => {
        if (!abort.signal.aborted && r.items[0] && rows[0] && r.items[0].id !== rows[0].id) setNewItems(true);
      }).catch(e => { if (!abort.signal.aborted && [401, 403, 404].includes(e.status)) { readerCache.delete(key); setRows([]); setCo(undefined); setError(e.message); } });
    }; window.addEventListener('focus', listener); return () => { abort.abort(); window.removeEventListener('focus', listener); };
  }, [id, mode, rows, ready]);
  const sorted = subs.filter(s => s.collection_id === id || (s.title || s.last_known_title).toLocaleLowerCase().includes(listQuery.toLocaleLowerCase())).sort((a, b) => sort === 'alphabet' ?
    (a.title || a.last_known_title).localeCompare(b.title || b.last_known_title, 'zh-Hant') : sort === 'viewed' ?
      (b.last_viewed_at || '').localeCompare(a.last_viewed_at || '') : b.subscribed_at.localeCompare(a.subscribed_at));
  const scopeTitle = co?.title || subs.find(s => s.collection_id === id)?.title || publicSets.find(c => c.id === id)?.title || (id ? '目前題目集' : mode === 'extended' ? '請選擇已訂閱的題目集' : '全部公開題目');
  return <div className="mx-auto flex h-full min-h-0 max-w-5xl flex-col gap-3">
    <FloatingReaderControls title={mode === 'extended' ? '延伸題目' : mode === 'explore' ? '公開探索' : '題目集觀看'}
      tone={mode === 'collection' ? 'neutral' : mode}
      summary={scopeTitle} open={controlsOpen} onOpenChange={setControlsOpen} activeFilters={!!(query || filter)}>
      {(mode !== 'extended' || account) ? <>
        {mode === 'explore' && <label className="mt-3 block text-sm">公開題目集<select aria-label="選擇公開題目集" value={id} onChange={e => { patch({ collection_id: e.target.value, q: '', state: '' }); setControlsOpen(false); }} className="mt-2 min-w-0 w-full max-w-full rounded-xl border border-border-subtle bg-surface p-3 text-sm">
          <option value="">全部公開題目</option>{id && !publicSets.some(c => c.id === id) && <option value={id}>{co?.title || '目前題目集'}</option>}{publicSets.map(c => <option key={c.id} value={c.id}>{c.title} · {c.item_count || 0} 題</option>)}
        </select></label>}
        {co && mode !== 'extended' && <div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="font-medium">{co.title}</h2>{!co.is_owner && <span className="text-xs">{!subscriptionStatusReady ? '確認訂閱狀態中…' : subscribed ? '已訂閱' : '尚未訂閱'}</span>}</div>}
        {mode === 'extended' && <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><input value={listQuery} onChange={e => patch({ list_q: e.target.value }, true)} aria-label="尋找已訂閱的集合" placeholder="尋找已訂閱集合" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm" />
            <select value={sort} onChange={e => patch({ sort: e.target.value })} aria-label="訂閱集排序" className="min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg p-2 text-sm"><option value="subscribed">訂閱時間</option><option value="viewed">觀看紀錄</option><option value="alphabet">名稱排序</option></select></div>
          <select disabled={subsBusy || !!subsError} aria-label="選擇已訂閱的題目集" value={id} onChange={e => { patch({ collection_id: e.target.value, state: '', q: '', list_q: '' }); setControlsOpen(false); }} className="min-w-0 w-full max-w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm">
            <option value="">請選擇題目集</option><optgroup label="可觀看">{sorted.filter(s => s.can_read).map(s => <option key={s.collection_id} value={s.collection_id}>{s.title || s.last_known_title}{s.unread_count ? ` · ${s.unread_count} 題未看新題` : ''}</option>)}</optgroup>
            {id && !subs.some(s => s.collection_id === id) && <option value={id} disabled>{subsBusy ? '讀取訂閱中…' : '此集合未訂閱'}</option>}
            <optgroup label="目前無法觀看">{sorted.filter(s => !s.can_read).map(s => <option disabled key={s.collection_id} value={s.collection_id}>{s.last_known_title} · 無法存取</option>)}</optgroup></select>
          <Link to="/settings#subscriptions" className="inline-block text-xs text-text-muted underline">管理訂閱關係</Link>
        </div>}
        {(mode !== 'extended' || id) && <form onSubmit={e => { e.preventDefault(); patch({ q: queryDraft.trim() }); setControlsOpen(false); }} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input aria-label="搜尋目前觀看範圍" value={queryDraft} onChange={e => setQueryDraft(e.target.value)} placeholder="搜尋此範圍的題目" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm" />
          <button className="rounded-xl bg-surface px-4 py-2 text-sm">搜尋</button>
          {mode === 'extended' && <select aria-label="閱讀篩選" value={filter} onChange={e => patch({ state: e.target.value })} className="col-span-2 min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg p-2 text-sm"><option value="">全部題目</option><option value="unread">未看新題</option><option value="starred">星號</option></select>}
        </form>}
        {(query || filter) && <button type="button" onClick={() => { patch({ q: '', state: '' }); setQueryDraft(''); }} className="mt-3 min-h-11 rounded-xl bg-page-bg px-3 py-2 text-xs">清除搜尋與篩選</button>}
      </> : null}
    </FloatingReaderControls>
    {mode === 'extended' && !account && <LoginNotice description="登入後可選擇已訂閱的題目集。" />}
    {subsError && <p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">訂閱狀態讀取失敗：{subsError}<button onClick={() => setSubscriptionRevision(v => v + 1)} className="ml-3 underline">重試訂閱清單</button></p>}
    {publicSetsError && <p role="alert" className="text-sm text-status-eraser">公開集合清單讀取失敗：{publicSetsError}<button onClick={() => setRevision(v => v + 1)} className="ml-3 underline">重試</button></p>}
    {mode === 'extended' && !!account && !subsBusy && !subsError && (!id || !ready) && <p className="rounded-2xl bg-surface p-5 text-sm">{id ? '此集合未訂閱或目前無法觀看。' : '請先選擇題目集。'}<Link to="/explore" className="ml-3 text-primary underline">探索並訂閱題目集</Link></p>}
    {newItems && <button onClick={() => setRevision(v => v + 1)} className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">有新題目 · 重新載入</button>}
    {error && <p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">{error}<button className="ml-3 underline" onClick={() => void load(rows.length > 0)}>重試</button></p>}
    {!busy && !error && !rows.length && (mode === 'explore' || id && ready) && <p className="p-5 text-sm text-text-muted">目前沒有符合條件的題目。</p>}
    {busy && !rows.length && <p className="p-5 text-sm text-text-muted">正在載入題目…</p>}
    <QuestionStream className="min-h-48 flex-1 overflow-y-auto overscroll-contain" items={dataKey === key ? rows : []} busy={busy} hasMore={dataKey === key && (publicFeed ? offset !== null : cursor !== null)} loadError={!!error} autoLoad={false} loadMore={() => void load(true)} focus={params.get('focus') || undefined}
      render={row => <ExternalQuestionCard id={row.id} collectionId={row.collection_id || id} subscribed={mode === 'extended'} starred={!!row.is_starred} savedId={row.saved_id} knownSubscribed={subscriptionAccount === account ? subs.some(s => s.collection_id === (row.collection_id || id)) : !!row.is_subscribed}
        publicContext={mode === 'explore'} isOwner={!!row.is_owner || co?.is_owner} subscriptionStatusReady={subscriptionStatusReady} onSubscriptionChanged={next => subscriptionChanged(next, row.collection_id || id, row.id)}
        onRead={() => { if (row.is_read) return; setRows(p => p.map(i => i.id === row.id ? { ...i, is_read: 1 } : i)); if (row.is_new_scope) setSubs(p => p.map(s => s.collection_id === (row.collection_id || id) ? { ...s, unread_count: Math.max(0, (s.unread_count || 0) - 1) } : s)); }}
        onSaved={savedId => setRows(p => p.map(i => i.id === row.id ? { ...i, saved_id: savedId } : i))}
        onStar={starred => setRows(p => p.map(i => i.id === row.id ? { ...i, is_starred: starred ? 1 : 0 } : i))} />} />
  </div>;
}
