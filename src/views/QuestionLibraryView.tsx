import { LoginNotice } from '../components/LoginNotice';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { StudyLibraryLayout, SearchLibraryLayout } from '../components/LibraryLayouts';
import { QuestionStream } from '../components/QuestionStream';
import { QuestionWorkCard } from '../components/QuestionWorkCard';
import { ProblemCard } from '../components/ProblemCard';
import { Sidebar } from '../components/Sidebar';
import { findNodeAndLineage } from '../components/StatusBadge';
import { SearchResultCard } from '../components/SearchResultCard';
import { AddToCollectionDialog } from '../components/AddToCollectionDialog';
import { useStore } from '../store/useStore';
import { questionService, collectionService } from '../services/questionService';
import { questionListCache, LIST_FRESHNESS_MS } from '../services/listCache';
import { readSource, rememberStudy } from '../services/navigationState';
import { isGuestUser } from '../utils/guest';
import { useProblemActions } from '../hooks/useProblemActions';
import { ProblemMetadataModal } from '../components/problem/ProblemMetadataModal';
import type { Item } from '../types';


import type { SearchHit } from '../types/search';
import type { Collection } from '../services/sharingApi';
import type { TaxonomyNode } from '../types';

const topics = (nodes: TaxonomyNode[], depth = 0): { id: string; label: string }[] => nodes.flatMap(n => [
  { id: n.id, label: `${'　'.repeat(depth)}${n.label}` }, ...topics(n.children || [], depth + 1)]);
const officialTree = (nodes: TaxonomyNode[]): TaxonomyNode[] => nodes.filter(n => !n.user_id).map(n => ({ ...n, children: officialTree(n.children || []) }));
type LibraryPage = { key: string; items: SearchHit[]; next: number | null; rebase?: boolean; receivedAt: number; generation: number; cacheVersion?: string };
const pageCache = new Map<string, LibraryPage>();
questionListCache.onInvalidate(() => pageCache.clear());
let pageCacheAccount = '';
export function QuestionLibraryView({ search = false }: { search?: boolean }) {
  const location = useLocation(); const legacy = useParams(); const [params, setParams] = useSearchParams();
  const source = readSource(params.get('source')); const account = useStore(s => s.currentUser?.id || 'guest');
  const { currentUser, taxonomies, problems, showToast } = useStore();
  const scopeTaxonomies = source === 'contributing' ? officialTree(taxonomies) : taxonomies;
  const find = useStore(s => s.inPageSearchQuery);
  const collection = params.get('collection_id') || ''; const query = params.get('q') || '';
  const selectedSubject = params.get('subject_id') || legacy.subject || 'all';
  const topic = params.get('topic_id') || legacy.topic || (selectedSubject !== 'all' ? selectedSubject : '');
  const outlineSubject = selectedSubject !== 'all' ? selectedSubject : topic === 'unclassified' ? topic : findNodeAndLineage(scopeTaxonomies, topic)?.[0].id || '';
  const status = params.get('status') || ''; const tag = params.get('tag') || '';
  const excludeArchived = (!search || params.get('exclude_archived') === 'yes') && (!status || status === 'all');
  const compactSearch = search && params.get('view') !== 'full';
  const scopeKey = JSON.stringify([account, source, collection, query, topic, status, tag, search, excludeArchived, compactSearch]);
  const [data, setData] = useState<LibraryPage>({ key: '', items: [], next: null, receivedAt: 0, generation: -1 });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [sets, setSets] = useState<Collection[]>([]); const [setsError, setSetsError] = useState('');
  const [draftQuery, setDraftQuery] = useState(query);
  const [outline, setOutline] = useState<SearchHit[]>([]); const [outlineBusy, setOutlineBusy] = useState(false);
  const [draft, setDraft] = useState({ topic, status, tag, collection }); const [add, setAdd] = useState<string | null>(null);
  const mutationEpoch = useRef(0);
  const markChanged = () => { mutationEpoch.current++; setDirty(true); setData(d => ({ ...d, rebase: true })); };
  const [dirty, setDirty] = useState(false); const [membershipRevision, setMembershipRevision] = useState(0);
  const { saveMetadata, analyzeItem } = useProblemActions();
  const navType = useNavigationType();
  const [editing, setEditing] = useState<Item | null>(null); const [editTopic, setEditTopic] = useState(''); const [editTags, setEditTags] = useState(''); const [analyzing, setAnalyzing] = useState(false);
  const [memberships, setMemberships] = useState<Record<string, { entry_id: string; collection_id: string; title: string; state: string; lifecycle: string; visibility: string }[]>>({});
  const pending = useRef<{ key: string; offset: number } | null>(null);
  const abortRef = useRef<AbortController>(); const active = useRef(scopeKey); active.current = scopeKey;
  useEffect(() => { setDraftQuery(query); setDraft({ topic, status, tag, collection }); }, [query, topic, status, tag, collection]);
  useEffect(() => { if (!search) rememberStudy(account, location.pathname + location.search, source); }, [account, location.pathname, location.search, source, search]);
  useEffect(() => {
    if (isGuestUser(currentUser) || search && source !== 'contributing') { setSets([]); setSetsError(''); return; }
    const abort = new AbortController(); setSets([]); setSetsError('');
    void collectionService.listContributable(abort.signal).then(setSets).catch(e => { if (!abort.signal.aborted) setSetsError(e.message); });
    return () => abort.abort();
  }, [account, currentUser, revision, search, source]);
  const load = async (offset = 0, append = false, restoreCount = 0, restore?: LibraryPage) => {
    const epoch = mutationEpoch.current;
    const requestGeneration = questionListCache.version();
    if (pending.current?.key === scopeKey && pending.current.offset === offset && !abortRef.current?.signal.aborted) return;
    abortRef.current?.abort(); const abort = new AbortController(); abortRef.current = abort; pending.current = { key: scopeKey, offset };
    const key = scopeKey; setBusy(true); setError('');
    try {
      const readPage = (offset: number) => questionService.search({
        source, collectionId: source === 'contributing' ? collection : undefined, query, topic, status: status === 'all' ? '' : status, excludeArchived, tag, offset,
        projection: compactSearch ? 'compact' : 'full', signal: abort.signal, guest: isGuestUser(currentUser), taxonomies
      });
      let page = await readPage(offset);
      if (abort.signal.aborted || active.current !== key) return;
      // Losing the validator may mean revoked access. Never append an empty denial to old rows.
      if (append && source === 'contributing' && data.cacheVersion && !page.cache_version) {
        page = offset === 0 ? page : await readPage(0);
        append = false; offset = 0;
        if (abort.signal.aborted || active.current !== key) return;
      }
      // A current authorization + unchanged collection/user version validates the whole loaded range.
      if (restore && !restore.rebase && page.cache_version && restore.cacheVersion === page.cache_version
        && questionListCache.wasCached(page) && restore.generation === questionListCache.version()
        && Date.now() - restore.receivedAt < LIST_FRESHNESS_MS) { setData(restore); return; }
      let receivedAt = questionListCache.receivedAt(page), generation = questionListCache.versionOf(page) ?? requestGeneration;
      while (!abort.signal.aborted && page.items.length < restoreCount && page.next_offset !== null) {
        const next = await readPage(page.next_offset);
        receivedAt = Math.min(receivedAt, questionListCache.receivedAt(next));
        generation = Math.min(generation, questionListCache.versionOf(next) ?? requestGeneration);
        page = { ...next, cache_version: page.cache_version === next.cache_version ? next.cache_version : undefined,
          items: [...page.items, ...next.items.filter(i => !page.items.some(p => p.id === i.id && p.origin === i.origin))] };
      }
      if (abort.signal.aborted || active.current !== key) return;
      const versionChanged = append && source === 'contributing' && data.key === key && data.cacheVersion !== page.cache_version;
      if (versionChanged) setDirty(true);
      setData(previous => ({
        key, items: (offset || append) && previous.key === key ?
          [...previous.items, ...page.items.filter(i => !previous.items.some(p => p.origin === i.origin && p.id === i.id))] : page.items, next: page.next_offset, rebase: append && (mutationEpoch.current !== epoch || versionChanged),
        receivedAt: append && previous.key === key ? Math.min(previous.receivedAt, receivedAt) : receivedAt,
        generation: append && previous.key === key ? Math.min(previous.generation, generation) : generation,
        cacheVersion: append && previous.key === key && previous.cacheVersion !== page.cache_version ? undefined : page.cache_version,
      }));
      if (source === 'owned' && !compactSearch) {
        const existing = useStore.getState().problems;
        const previous = offset || append ? existing : [];
        useStore.getState().setProblems([...previous, ...page.items.flatMap(i => i.problem && !previous.some(p => p.id === i.id) ?
          [questionListCache.wasCached(page) ? existing.find(p => p.id === i.id && p.user_id === i.problem?.user_id) || i.problem : i.problem] : [])], null);
      }
    } catch (e) { if (!abort.signal.aborted && active.current === key) setError(e instanceof Error ? e.message : '載入失敗'); }
    finally { if (abortRef.current === abort) { pending.current = null; if (active.current === key) setBusy(false); } }
  };
  useEffect(() => {
    setDirty(false);
    if (pageCacheAccount !== account) { pageCache.clear(); pageCacheAccount = account; }
    const candidate = !isGuestUser(currentUser) ? pageCache.get(scopeKey) : undefined;
    const fresh = candidate && candidate.generation === questionListCache.version() && Date.now() - candidate.receivedAt < LIST_FRESHNESS_MS ? candidate : undefined;
    const cached = source !== 'contributing' ? fresh : undefined;
    if (cached) {
      setDirty(!!cached.rebase); setData(cached); setBusy(false); setError(''); if (source === 'owned' && !compactSearch) {
        const existing = useStore.getState().problems;
        useStore.getState().setProblems(cached.items.flatMap(i => i.problem ? [existing.find(p => p.id === i.id && p.user_id === i.problem?.user_id) || i.problem] : []), null);
      }
    }
    else { setData({ key: scopeKey, items: [], next: null, receivedAt: 0, generation: -1 }); void load(0, false, source === 'contributing' && navType === 'POP' ? fresh?.items.length : 0, source === 'contributing' ? fresh : undefined); }
    return () => abortRef.current?.abort();
  }, [scopeKey, revision]);
  useEffect(() => { if (data.key !== scopeKey || !data.receivedAt || isGuestUser(currentUser)) return; pageCache.set(scopeKey, data); if (pageCache.size > 20) pageCache.delete(pageCache.keys().next().value!); }, [data, scopeKey]);
  const refresh = () => { questionListCache.invalidate(); pageCache.clear(); setRevision(v => v + 1); };
  useEffect(() => { window.addEventListener('redolve:library-refresh', refresh); return () => window.removeEventListener('redolve:library-refresh', refresh); }, []);
  useEffect(() => {
    if (search) { setMemberships({}); return; }
    const ids = data.items.filter(i => i.origin === 'owned').map(i => i.id); if (isGuestUser(currentUser) || !ids.length) { setMemberships({}); return; }
    const abort = new AbortController(); void collectionService.memberships(ids, abort.signal).then(r => {
      if (abort.signal.aborted) return; setMemberships(r);
    }).catch(() => { }); return () => abort.abort();
  }, [data.items, currentUser, membershipRevision, search]);
  const patch = (values: Record<string, string>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k)); if (!('focus' in values)) next.delete('focus'); setParams(next); };
  const items = data.key === scopeKey ? data.items : [];
  useEffect(() => {
    const store = useStore.getState(); const ids = find.trim() ? items.filter(i => [i.title, i.keywords, i.typed_notes, i.collection_title, i.provider_name].some(t => t?.toLocaleLowerCase().includes(find.toLocaleLowerCase()))).map(i => `stream:${i.id}`) : [];
    ids.forEach(store.registerInPageMatch); return () => ids.forEach(store.unregisterInPageMatch);
  }, [items, find]);
  useEffect(() => {
    setOutline([]); setOutlineBusy(false);
    if (search || !outlineSubject) return;
    const abort = new AbortController(); setOutlineBusy(true);
    void (async () => { let offset = 0; const all: SearchHit[] = []; do { const page = await questionService.search({ source, collectionId: source === 'contributing' ? collection : undefined, query, topic: outlineSubject, status: status === 'all' ? '' : status, excludeArchived, tag, offset, metadataOnly: true, guest: isGuestUser(currentUser), taxonomies, signal: abort.signal }); if (abort.signal.aborted) return; all.push(...page.items); setOutline([...all]); if (page.next_offset === null) break; offset = page.next_offset; } while (!abort.signal.aborted); })().catch(() => { if (!abort.signal.aborted) showToast('題目大綱載入失敗，可重新套用篩選重試', 'error'); }).finally(() => { if (!abort.signal.aborted) setOutlineBusy(false); }); return () => abort.abort();
  }, [account, source, collection, query, outlineSubject, status, tag, revision, search, excludeArchived]);
  const filterFields = <div className="space-y-3">
    <div>
      <label className="block text-sm">科目與單元<select aria-label="科目與單元" value={draft.topic} onChange={e => setDraft(v => ({ ...v, topic: e.target.value }))} className="mt-1 w-full rounded-xl border border-border-subtle bg-page-bg p-3">
        <option value="">所有科目與單元</option><option value="unclassified">未分類</option>{topics(scopeTaxonomies).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
    </div>
    <div>
      {<label className="block text-sm">訂正狀態<select aria-label="訂正狀態" value={draft.status} onChange={e => setDraft(v => ({ ...v, status: e.target.value }))} className="mt-1 w-full rounded-xl border border-border-subtle bg-page-bg p-3">
        <option value="">全部狀態</option><option value="unsolved">待訂正</option><option value="resolved">已訂正</option><option value="archived">已封存</option></select></label>}
    </div>
    <div>
      <label className="block text-sm">標籤<input value={draft.tag} onChange={e => setDraft(v => ({ ...v, tag: e.target.value }))} className="mt-1 w-full rounded-xl border border-border-subtle bg-page-bg p-3" /></label>
    </div>
    <div className='mt-4'>
      <button onClick={() => { patch({ topic_id: draft.topic, subject_id: '', status: draft.status, tag: draft.tag, exclude_archived: '' }); }} className="rounded-xl bg-primary px-4 py-2 text-white text-sm">套用篩選</button>
      <button onClick={() => { setDraft({ topic: '', status: '', tag: '', collection: source === 'owned' ? '' : collection }); patch({ topic_id: '', subject_id: '', status: '', tag: '', exclude_archived: '' }); }} className="ml-2 text-sm text-text-muted underline">清除篩選</button>
    </div>
  </div>;
  const collectionPicker = source === 'contributing' && <label className="block text-xs text-text-muted">共用集<select aria-label="選擇可貢獻的共用集" value={collection} onChange={e => patch({ collection_id: e.target.value, topic_id: '', subject_id: '', tag: '', status: '' })} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"><option value="">請選擇一個共用集</option>{sets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>;
  const queryForm = <form className="flex gap-2" onSubmit={e => { e.preventDefault(); patch({ q: draftQuery.trim() }); }}><input value={draftQuery} onChange={e => setDraftQuery(e.target.value)} aria-label="搜尋目前題目來源" placeholder="搜尋題目" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm" /><button type="submit" className="rounded-xl bg-primary/10 px-3 py-2 text-primary text-sm">搜尋</button></form>;
  const searchParams = new URLSearchParams(params);
  searchParams.set('source', source); searchParams.delete('focus'); searchParams.delete('view');
  if (topic) searchParams.set('topic_id', topic);
  if (selectedSubject !== 'all') searchParams.set('subject_id', selectedSubject);
  if (excludeArchived) searchParams.set('exclude_archived', 'yes');
  if (source !== 'contributing') searchParams.delete('collection_id');
  const searchLink = <Link to={'/search?' + searchParams} className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-text-main hover:bg-neutral-100"><Search size={15} />前往搜尋</Link>;
  const asItem = (hit: SearchHit): Item => hit.problem || ({ id: hit.id, user_id: account, type: 'problem', topic_id: hit.topic_id, keywords: hit.keywords, keyword_tokens: null, source: hit.title, image_url: '', draw_data: null, status: hit.status || 'unsolved', review_count: hit.review_count || 0, vector_clock: null, created_at: hit.created_at, updated_at: hit.created_at });
  const topicIds = new Set<string>(); const visit = (nodes: TaxonomyNode[], include = false) => nodes.forEach(n => { const yes = include || n.id === topic; if (yes) topicIds.add(n.id); visit(n.children || [], yes); }); visit(scopeTaxonomies);
  const outlineItems = outline.filter(i => !topic || (topic === 'unclassified' ? !i.topic_id : topicIds.has(i.topic_id || '')));
  // An offset can shift after deleting, archiving or changing a matching record.
  // Rescan once and merge IDs, retaining the open cards and their local work.
  const loadNext = () => void load(data.rebase ? 0 : data.next ?? 0, true);
  const currentHit = (hit: SearchHit): SearchHit => {
    const problem = hit.origin === 'owned' ? problems.find(p => p.id === hit.id && p.user_id === hit.problem?.user_id) : undefined;
    const label = topics(scopeTaxonomies).find(t => t.id === (problem?.topic_id || hit.topic_id))?.label.trim() || hit.topic_label;
    return problem ? { ...hit, problem, title: problem.source, topic_id: problem.topic_id, topic_label: label, keywords: problem.keywords, typed_notes: problem.typed_notes || null, status: problem.status, review_count: problem.review_count } : { ...hit, topic_label: label };
  };
  const notices = <>{setsError && <p role="alert" className="p-3 text-sm text-status-eraser">{setsError}</p>}{dirty && <p role="status" className="rounded-2xl bg-surface p-3 text-xs text-text-muted">資訊已更新，保留目前閱讀位置。<button onClick={refresh} className="ml-2 text-primary underline">重新套用篩選</button></p>}{error && <p role="alert" className="p-3 text-sm text-status-eraser">{error}<button onClick={() => items.length ? loadNext() : void load()} className="ml-3 underline">重試</button></p>}{!items.length && !busy && !error && <p className="p-6 text-sm text-text-muted">{source === 'contributing' && !collection ? '請從側欄選擇共用集。' : '目前範圍沒有題目。'}</p>}{busy && !items.length && <p className="p-6 text-sm text-text-muted">載入題目中…</p>}</>;
  const compactRows = items.reduce<{ id: string; ids: string[]; hits: SearchHit[] }[]>((rows, hit, index) => { if (index % 2 === 0) rows.push({ id: hit.id, ids: [], hits: [] }); rows[rows.length - 1].ids.push(hit.id); rows[rows.length - 1].hits.push(hit); return rows; }, []);
  const stream = search && params.get('view') !== 'full' ? <QuestionStream autoLoad={false} items={compactRows} busy={busy} hasMore={data.key === scopeKey && data.next !== null} loadError={!!error} loadMore={loadNext} focus={params.get('focus') || undefined}
    render={row => <div data-search-grid className="grid gap-4 lg:grid-cols-2">{row.hits.map(hit => <SearchResultCard key={hit.id} hit={currentHit(hit)} full={false} studyUrl={'/study?' + new URLSearchParams({ ...Object.fromEntries(params), focus: hit.id })} />)}</div>} /> :
    <QuestionStream autoLoad={false} items={items} busy={busy} hasMore={data.key === scopeKey && data.next !== null} loadError={!!error} loadMore={loadNext} className={search ? undefined : 'h-full min-h-0 overflow-y-auto overscroll-contain pt-2 pb-28'} focus={params.get('focus') || legacy.problemId || (location.hash.startsWith('#problem-') ? location.hash.slice(9) : undefined)} render={(hit, _index, onNext) => search ? <SearchResultCard hit={currentHit(hit)} full={params.get('view') === 'full'} studyUrl={'/study?' + new URLSearchParams({ ...Object.fromEntries(params), focus: hit.id })} /> :
      hit.origin === 'owned' && hit.problem ? <ProblemCard streamSearch onNext={onNext} problem={problems.find(p => p.id === hit.id) || hit.problem} memberships={memberships[hit.id] || []} onAddToCollection={isGuestUser(currentUser) ? undefined : () => setAdd(hit.id)} onChanged={markChanged} onDeleted={id => { markChanged(); setData(d => ({ ...d, items: d.items.filter(i => i.id !== id) })); }} onEditMetadata={p => { setEditing(p); setEditTopic(p.topic_id || ''); try { setEditTags(JSON.parse(p.keywords || '[]').join(', ')); } catch { setEditTags(''); } }} /> :
        <QuestionWorkCard kind={source === 'saved' ? 'saved' : 'shared'} onNext={onNext} id={hit.id} collectionId={hit.collection_id || collection} onChanged={markChanged} onRemoved={() => { markChanged(); setData(d => ({ ...d, items: d.items.filter(i => i.id !== hit.id) })); }} />} />;
  const needsLogin = isGuestUser(currentUser) && source !== 'owned';
  const login = <LoginNotice description="登入後可存入題目及參與共用。" />;
  const sidebar = <Sidebar scope={{ subject: outlineSubject || selectedSubject, topic: params.get('topic_id') || legacy.topic || null, status: status || 'all', problems: outline.map(asItem), outline: outlineItems.map(asItem), taxonomies: scopeTaxonomies, onSubject: id => patch({ subject_id: id, topic_id: '' }), onTopic: id => patch({ topic_id: id || '' }), onStatus: value => patch({ status: value === 'all' ? '' : value }), loading: outlineBusy, countsAvailable: !!outlineSubject }} onSelectProblemOutline={id => patch({ focus: id })}>
    {collectionPicker}{searchLink}{!outlineSubject && <p className="text-xs text-text-muted">選擇科目後載入題目大綱。</p>}<label className="block text-xs text-text-muted"><span className='block mb-1'>標籤</span><input aria-label="篩選標籤" defaultValue={tag} key={tag} onKeyDown={e => { if (e.key === 'Enter') patch({ tag: e.currentTarget.value.trim() }); }} onBlur={e => { if (e.currentTarget.value.trim() !== tag) patch({ tag: e.currentTarget.value.trim() }); }} className="w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2" /></label>
  </Sidebar>;
  return <>
    {search ? <SearchLibraryLayout query={queryForm} collection={collectionPicker} filters={filterFields} view={params.get('view') || 'compact'} onView={view => patch({ view })} notices={needsLogin ? null : notices}>{needsLogin ? login : stream}</SearchLibraryLayout> :
      <StudyLibraryLayout sidebar={sidebar} notices={needsLogin ? null : notices}>{needsLogin ? login : stream}</StudyLibraryLayout>}
    {add && <AddToCollectionDialog itemIds={[add]} onClose={() => { setAdd(null); setMembershipRevision(v => v + 1); }} />}
    <ProblemMetadataModal isOpen={!!editing} problem={editing} editTopicId={editTopic} editKeywordsStr={editTags} isAnalyzing={analyzing} activeTaxonomies={taxonomies}
      onClose={() => setEditing(null)} onTopicIdChange={setEditTopic} onKeywordsStrChange={setEditTags}
      onSave={() => { if (editing) void saveMetadata(editing, { topic_id: editTopic || null, keywords: editTags.split(',').map(s => s.trim()).filter(Boolean) }).then(() => { markChanged(); setEditing(null); }).catch(e => showToast(e instanceof Error ? e.message : '儲存失敗', 'error')); }}
      onRunAiAnalysis={() => { if (!editing) return; setAnalyzing(true); void analyzeItem(editing).then(r => { if (r?.tagResult) { setEditTopic(r.tagResult.topic_id || ''); setEditTags(r.tagResult.keywords.join(', ')); } }).catch(e => showToast(e instanceof Error ? e.message : '辨識失敗', 'error')).finally(() => setAnalyzing(false)); }} />
  </>;
}
