import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Loader2, LayoutGrid, List, ArrowUpRight, BookOpen, FileText } from 'lucide-react';
import { searchProblems, getProblemImageUrl } from '../services/api';
import { imageUrl, savedImageUrl } from '../services/sharingApi';
import { useSEO } from '../hooks/useSEO';
import { ProblemCard } from '../components/ProblemCard';
import { getTaxonomyPath, formatProblemCode } from '../components/StatusBadge';
import { useStore } from '../store/useStore';
import type { SearchHit, SearchPage, SearchScope } from '../types/search';
import type { TaxonomyNode } from '../types';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { isGuestUser } from '../utils/guest';

const labels: Record<SearchScope, string> = { mine: '我的題庫', shared: '共用與訂閱', public: '公開探索' };
const flattenTopics = (nodes: TaxonomyNode[], personal: boolean, depth = 0): { id: string; label: string }[] =>
  nodes.flatMap(node => !personal && node.user_id ? [] : [
    { id: node.id, label: `${'　'.repeat(depth)}${node.label}` },
    ...flattenTopics(node.children || [], personal, depth + 1),
  ]);
function parseTags(value: string | null): string[] {
  try { const tags: unknown = JSON.parse(value || '[]');
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch { return []; }
}
const destination = (hit: SearchHit) => hit.origin === 'owned' ? `/problem/${hit.id}`
  : hit.origin === 'saved' ? `/saved/${hit.id}` : hit.origin === 'collection'
    ? `/collections/${hit.id}` : `/collections/${hit.collection_id}/items/${hit.id}`;

export function SearchView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { taxonomies, currentUser, setAuthModalOpen } = useStore();
  const guest = isGuestUser(currentUser);
  const query = params.get('q') || '';
  const scope: SearchScope = params.get('scope') === 'shared' ? 'shared'
    : params.get('scope') === 'public' ? 'public' : 'mine';
  const origin = params.get('origin') || 'all';
  const collectionId = params.get('collection_id') || '';
  const topic = params.get('topic_id') || '';
  const status = params.get('status') || '';
  const tag = params.get('tag') || '';
  const subscribed = params.get('subscribed') === 'yes';
  const [localQuery, setLocalQuery] = useState(query);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');
  const [state, setState] = useState<{ key: string; page: SearchPage | null; error: string }>({
    key: '', page: null, error: '',
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  // Old results never render under a new scope/account while its request is pending.
  const key = JSON.stringify([currentUser?.id, query, scope, origin, collectionId, topic, status, tag, subscribed, retry]);
  const ready = state.key === key;
  const results = ready ? state.page?.items || [] : [];
  const error = ready ? state.error : '';
  const loading = Boolean(query.trim() && !ready);
  const needsLogin = guest && scope === 'shared' && !collectionId;
  const requestParams = () => {
    const result = new URLSearchParams({ scope, limit: '30' });
    for (const name of ['origin', 'collection_id', 'topic_id', 'status', 'tag', 'subscribed']) {
      const value = params.get(name);
      if (value) result.set(name, value);
    }
    return result;
  };
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    next.delete('offset');
    setParams(next);
  };
  const switchScope = (next: SearchScope) => setParams(new URLSearchParams({
    scope: next, ...(query ? { q: query } : {}),
  }));
  useSEO({ title: query ? `搜尋「${query}」` : '題目搜尋',
    description: '搜尋個人題庫、已存題目、共用與訂閱題目集，以及公開集合。' });
  useEffect(() => { setLocalQuery(query); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadingMore(false);
    if (!query.trim() || needsLogin) {
      setState({ key, page: { items: [], next_offset: null, scope }, error: '' });
      return;
    }
    const run = async (): Promise<SearchPage> => {
      if (guest && scope === 'mine') {
        let items = await OfflineSyncManager.searchOfflineProblems(query);
        const allowedTopics = new Set<string>();
        const gather = (nodes: TaxonomyNode[], selected = false) => {
          for (const node of nodes) {
            const included = selected || node.id === topic;
            if (included) allowedTopics.add(node.id);
            gather(node.children || [], included);
          }
        };
        if (topic) gather(taxonomies);
        items = origin === 'saved' || collectionId ? [] : items.filter(item =>
          (!topic || allowedTopics.has(item.topic_id || ''))
          && (!status || item.status === status) && (!tag || parseTags(item.keywords).includes(tag)));
        return { items: items.map(item => ({
          origin: 'owned', id: item.id, title: item.source, topic_id: item.topic_id,
          topic_label: null, keywords: item.keywords, typed_notes: item.typed_notes || null,
          status: item.status, review_count: item.review_count, created_at: item.created_at,
          collection_id: null, collection_title: null, provider_name: null, saved_id: null,
          relevance_score: 0, problem: item,
        })), next_offset: null, scope };
      }
      return searchProblems(query, requestParams(), controller.signal);
    };
    void run().then(page => { if (active) setState({ key, page, error: '' }); })
      .catch(e => { if (active) setState({ key, page: null,
        error: e instanceof Error ? e.message : '搜尋暫時無法使用，請稍後重試。' }); });
    return () => { active = false; controller.abort(); };
  }, [key, guest, needsLogin, taxonomies]);

  const loadMore = async () => {
    if (!ready || state.page?.next_offset == null || loadingMore) return;
    const requestKey = key;
    const next = requestParams();
    next.set('offset', String(state.page.next_offset));
    setLoadingMore(true);
    try {
      const page = await searchProblems(query, next);
      setState(previous => {
        if (previous.key !== requestKey || !previous.page) return previous;
        const seen = new Set(previous.page.items.map(hit => `${hit.origin}:${hit.id}`));
        return { ...previous, error: '', page: { ...page, items: [
          ...previous.page.items, ...page.items.filter(hit => !seen.has(`${hit.origin}:${hit.id}`)),
        ] } };
      });
    } catch {
      setState(previous => previous.key === requestKey
        ? { ...previous, error: '載入更多結果失敗，請重試。' } : previous);
    } finally { setLoadingMore(false); }
  };
  const preview = (hit: SearchHit) => {
    const path = destination(hit);
    const image = hit.origin === 'owned' ? (hit.problem?.image_url.startsWith('blob:')
      ? hit.problem.image_url : getProblemImageUrl(hit.id)) : hit.origin === 'saved'
        ? savedImageUrl(hit.id) : hit.origin === 'collection' ? null : imageUrl(hit.collection_id!, hit.id);
    return <article key={`${hit.origin}:${hit.id}`}
      className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3 shadow-xs">
      <p className={`text-xs font-medium ${hit.origin === 'owned' ? 'text-primary' : 'text-[#47705C] dark:text-[#A9C7B6]'}`}>
        {hit.origin === 'owned' ? '我上傳的原題' : hit.origin === 'saved' ? '已存入我的題庫'
          : hit.origin === 'collection' ? '公開題目集' : scope === 'public' ? '公開題目' : '共用／訂閱題目'}
      </p>
      {hit.origin === 'owned' && hit.problem && <span className="text-xs text-text-muted">
        {formatProblemCode(hit.problem, taxonomies)}</span>}
      <h2 className="font-semibold text-text-main"><Link to={path}>{hit.title || '未命名題目'}</Link></h2>
      {hit.origin !== 'collection' && <div className="text-xs text-text-muted">
        {hit.status ? <span>{getTaxonomyPath(hit.topic_id, undefined, taxonomies).fullPath}・{
          hit.status === 'processing' ? '辨識中' : hit.status === 'resolved' ? '已訂正'
            : hit.status === 'archived' ? '已封存' : '待訂正'
        }</span> : hit.topic_label || '未分類'}
      </div>}
      {hit.collection_title && hit.origin !== 'collection' && <p className="text-xs text-text-muted">
        來源：{hit.collection_title}{hit.provider_name ? `・${hit.provider_name}` : ''}
      </p>}
      {image ? <Link to={path} aria-label={`開啟 ${hit.title || '題目'}`}
        className="block h-44 rounded-2xl overflow-hidden bg-neutral-50 dark:bg-neutral-800 border border-border-subtle">
        <img src={image} alt="題目預覽" loading="lazy" className="w-full h-full object-contain p-2" />
      </Link> : <Link to={path} className="flex items-center gap-2 rounded-2xl bg-[#EAF1EC] dark:bg-[#26362F] p-5">
        <BookOpen size={24} /><span>查看題目集</span></Link>}
      {hit.typed_notes && <div className="flex items-start gap-2 rounded-xl bg-page-bg p-3 text-xs">
        <FileText size={14} className="shrink-0 mt-0.5" /><p className="line-clamp-2 whitespace-pre-wrap">{hit.typed_notes}</p>
      </div>}
      <div className="flex flex-wrap gap-1">{parseTags(hit.keywords).slice(0, 6).map(keyword =>
        <span key={keyword} className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs text-text-muted">#{keyword}</span>)}</div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3 text-xs">
        <Link to={path} className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-white">
          {hit.origin === 'collection' ? '開啟集合' : '前往此題目'}<ArrowUpRight size={14} /></Link>
        {hit.saved_id && hit.origin !== 'saved' && <Link to={`/saved/${hit.saved_id}`}
          className="text-[#47705C] dark:text-[#A9C7B6] underline">已存入・開啟我的版本</Link>}
      </div>
    </article>;
  };
  return <div className="max-w-4xl mx-auto space-y-5 pb-16">
    <div className="flex flex-wrap gap-2" aria-label="搜尋範圍">{(['mine', 'shared', 'public'] as const).map(value =>
      <button key={value} type="button" aria-pressed={scope === value} onClick={() => switchScope(value)}
        className={`rounded-xl px-4 py-2 text-sm ${scope === value ? 'bg-primary text-white' : 'bg-surface border border-border-subtle'}`}>
        {labels[value]}</button>)}</div>
    <header className={`rounded-3xl border p-5 ${scope === 'mine' ? 'bg-surface border-border-subtle'
      : 'border-[#DCE8E0] dark:border-[#3D5449] bg-[#EAF1EC] dark:bg-[#26362F]'}`}>
      <h1 className="font-semibold">{guest && scope === 'mine' ? '本機題庫搜尋' : labels[scope]}</h1>
      <p className="mt-1 text-xs text-text-muted">{scope === 'mine'
        ? '搜尋原題、已存版本與自己的筆記。' : scope === 'shared'
          ? '搜尋我建立、獲准觀看與訂閱的題目集，包含訂閱前已存在的題目。' : '搜尋出現在公開探索的題目集與題目。'}</p>
      {collectionId && <div className="mt-2 flex items-center gap-3 text-xs">
        <span>限定目前題目集</span><button type="button" className="underline"
          onClick={() => update('collection_id', '')}>搜尋此範圍所有題目集</button></div>}
    </header>
    <form onSubmit={e => { e.preventDefault(); update('q', localQuery.trim()); setRetry(value => value + 1); }} className="flex gap-2">
      <label className="sr-only" htmlFor="question-search">搜尋關鍵字</label>
      <div className="relative min-w-0 flex-1">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input id="question-search" value={localQuery} onChange={e => setLocalQuery(e.target.value)}
          maxLength={200} placeholder="輸入關鍵字、標籤或題目來源…"
          className="w-full rounded-2xl border border-border-subtle bg-surface py-3 pl-11 pr-4 outline-none focus:border-primary" />
      </div>
      <button type="submit" className="rounded-2xl bg-primary px-5 py-3 text-sm text-white">搜尋</button>
    </form>
    <div className="flex flex-wrap gap-2">
      {scope === 'mine' && <select aria-label="題目來源" value={origin} onChange={e => update('origin', e.target.value)}
        className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
        <option value="all">原題與已存題目</option><option value="owned">我上傳的原題</option><option value="saved">已存入的題目</option>
      </select>}
      <select aria-label="科目與單元" value={topic} onChange={e => update('topic_id', e.target.value)}
        className="max-w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
        <option value="">所有科目與單元</option>{flattenTopics(taxonomies, scope === 'mine').map(node =>
          <option key={node.id} value={node.id}>{node.label}</option>)}
      </select>
      {scope === 'mine' && <select aria-label="訂正狀態" value={status} onChange={e => update('status', e.target.value)}
        className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
        <option value="">所有狀態</option><option value="processing">辨識中</option><option value="unsolved">待訂正</option>
        <option value="resolved">已訂正</option><option value="archived">已封存</option>
      </select>}
      <input aria-label="指定標籤" maxLength={80} value={tag} onChange={e => update('tag', e.target.value)}
        placeholder="指定完整標籤" className="w-40 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
      {scope === 'shared' && <label className="flex items-center gap-2 text-sm px-2">
        <input type="checkbox" checked={subscribed} onChange={e => update('subscribed', e.target.checked ? 'yes' : '')} />只看我訂閱的集合
      </label>}
    </div>
    {needsLogin ? <button type="button" onClick={() => setAuthModalOpen(true)}
      className="rounded-xl bg-primary px-4 py-2 text-white">登入以搜尋共用與訂閱題目</button> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-text-muted">已載入 {results.length} 筆結果{state.page?.next_offset != null && ready ? '，可載入更多' : ''}</p>
        {scope === 'mine' && <div className="flex gap-1 rounded-2xl bg-neutral-100 dark:bg-neutral-800 p-1">
          {(['compact', 'full'] as const).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode}
            onClick={() => setViewMode(mode)} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs ${viewMode === mode ? 'bg-surface' : ''}`}>
            {mode === 'compact' ? <LayoutGrid size={14} /> : <List size={14} />}
            {mode === 'compact' ? '精簡預覽' : '完整原題'}
          </button>)}
        </div>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12">
        <Loader2 size={24} className="animate-spin text-primary" /><span className="text-sm">搜尋中…</span>
      </div> : !results.length ? error ? null : <p className="rounded-3xl bg-surface border border-border-subtle p-8 text-sm text-text-muted">
        {query.trim() ? '沒有符合目前範圍及條件的結果。可調整篩選或簡化關鍵字。' : '輸入關鍵字開始搜尋。'}
      </p> : <div className={scope === 'mine' && viewMode === 'full' ? 'space-y-6' : 'grid gap-4 md:grid-cols-2'}>
        {results.map((hit, index) => scope === 'mine' && viewMode === 'full' && hit.origin === 'owned' && hit.problem
          ? <ProblemCard key={`owned:${hit.id}`} problem={hit.problem} problemIndex={index} /> : preview(hit))}
      </div>}
      {ready && state.page?.next_offset != null && <button type="button" disabled={loadingMore}
        onClick={() => void loadMore()} className="rounded-xl border border-border-subtle bg-surface px-5 py-2 text-sm disabled:opacity-50">
        {loadingMore ? '載入中…' : '載入更多結果'}
      </button>}
    </>}
    <button type="button" onClick={() => navigate('/my/notebook')} className="text-xs text-text-muted underline">開啟我的題庫</button>
  </div>;
}
