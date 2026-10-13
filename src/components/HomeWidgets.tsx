import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Check, GripVertical, ListTodo, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { SwitchRow } from './SwitchRow';
import { PublicExploreActivity } from './PublicExploreActivity';
import { useListReorder } from '../hooks/useListReorder';
import { useProgressPlans } from '../hooks/useProgressPlans';
import { ProgressPlansWidget, ProgressPlansVisibility, ProgressPlansConflict } from './ProgressPlans';
import { useHomeWidgets } from '../hooks/useHomeWidgets';
import { countdownDays, GSAT_PRESET, orderedCountdowns, taipeiDay, validTargetDate } from '../types/homeWidgets';
import type { WidgetItem, WidgetKind } from '../types/homeWidgets';

const button = 'h-full rounded-xl border border-border-subtle px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40';
const input = 'min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm';
const settingsUrl = (kind: WidgetKind) => `/settings?widget=${kind === 'todo' ? 'todos' : 'countdowns'}#profile`;
export type Widgets = ReturnType<typeof useHomeWidgets>;

function WidgetStatus({ state }: { state: Widgets }) {
  const { snapshot: s, channel, service } = state;
  return <div className="text-xs text-text-muted" aria-live="polite">
    {s.storageError ? <span role="alert">瀏覽器無法保存，請勿關閉頁面</span> : s.conflict ? '有修改需要確認' : s.error ? <><span>{s.error}；草稿仍保留。</span><button className="ml-2 underline" onClick={() => service.retry(channel)}>重試同步</button></> : s.loading ? '同步中…' : channel.account === 'guest' ? '本機保存' : s.pending ? '等待同步' : '已同步'}
  </div>;
}
export function WidgetConflict({ state }: { state: Widgets }) {
  const { snapshot: s, channel, service } = state, conflict = s.conflict;
  if (!conflict) return null;
  const localText = conflict.operation.patch.text ?? conflict.operation.item?.text;
  const cloudText = conflict.current && 'text' in conflict.current ? conflict.current.text : null;
  const orderText = (ids: unknown) => Array.isArray(ids) && ids.length ? ids.map(id => state.snapshot.items.find(i => i.id === id)?.text || '已移除事件').join(' → ') : '依日期排列';
  const orderConflict = Object.hasOwn(conflict.operation.patch, 'countdown_order');
  return <AppDialog title="小組件修改需要確認" onClose={() => { /* Keep unresolved work available. */ }}>
    <p className="text-sm text-text-muted">相同內容已在其他地方修改。請選擇保留的版本；其他項目不受影響。</p>
    <div className="mt-4 space-y-3 text-sm">
      <div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">本機修改</p><p className="mt-1 whitespace-pre-wrap break-words">{orderConflict ? orderText(conflict.operation.patch.countdown_order) : typeof localText === 'string' ? localText : conflict.operation.action === 'delete' ? '移除此項目' : JSON.stringify(conflict.operation.patch)}</p></div>
      <div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">雲端版本</p><p className="mt-1 whitespace-pre-wrap break-words">{orderConflict && conflict.current && 'countdown_order' in conflict.current ? orderText(conflict.current.countdown_order) : cloudText ?? (conflict.current ? '設定已更新' : '項目已移除或超過保留期限')}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={button} onClick={() => service.resolve(channel, false)}>採用雲端版本</button>
      {conflict.current && <button className={button} onClick={() => service.resolve(channel, true)}>保留本機修改</button>}</div>
  </AppDialog>;
}
function WidgetHeader({ kind, state, management = false }: { kind: WidgetKind; state: Widgets; management?: boolean }) {
  const [menu, setMenu] = useState(false), name = kind === 'todo' ? '待辦事項' : '事件倒數';
  const Icon = kind === 'todo' ? ListTodo : CalendarDays;
  return <>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Icon size={18} className="text-text-muted" />{name}</h2><div className="mt-1"><WidgetStatus state={state} /></div></div>
      {!management && <button className="rounded-xl p-2 hover:bg-neutral-100" aria-label={`${name}選單`} onClick={() => setMenu(true)}><MoreHorizontal size={20} /></button>}
    </div>
    {menu && <AppDialog title={`${name}選單`} onClose={() => setMenu(false)}>
      <div className="flex flex-col gap-2 text-center"><Link className={button} to={settingsUrl(kind)} onClick={() => setMenu(false)}>前往設定管理組件</Link>
        <button className={button} onClick={() => { setMenu(false); void state.service.refresh(state.channel, true); }}>重新同步</button></div>
    </AppDialog>}
  </>;
}
function TodoRow({ item, state, onEditing }: { item: WidgetItem; state: Widgets; onEditing: (id: string | null) => void }) {
  const [text, setText] = useState(item.text), [focused, setFocused] = useState(false), [remove, setRemove] = useState(false);
  const editor = useRef<HTMLInputElement>(null);
  const base = useRef(item.text), cancelled = useRef(false);
  useEffect(() => { if (!focused) setText(item.text); }, [item.text, focused]);
  const save = () => {
    setFocused(false); onEditing(null); if (cancelled.current) { cancelled.current = false; setText(item.text); return; } const next = text.trim(); if (!next) { setText(item.text); return; }
    state.service.update(state.channel, item.id, { text: next }, { text: base.current });
  };
  return <div className="flex min-w-0 items-center gap-2 py-0.5" data-todo-row={item.id}
    onClick={event => { if (!focused && event.target instanceof Element && event.currentTarget.contains(event.target) && !event.target.closest('button')) editor.current?.focus(); }}>
    <button className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ' + (item.completed_at !== null ? 'border-[#A8C5BD] bg-[#A8C5BD]/20 text-text-main' : 'border-border-subtle')}
      role="checkbox" aria-checked={item.completed_at !== null} aria-label={`完成：${item.text}`} onClick={() => state.service.update(state.channel, item.id, { completed_at: item.completed_at === null ? Date.now() : null })}>
      {item.completed_at !== null && <Check size={17} />}</button>
    {/* Readable rows pass swipes to the panel; tapping enters the normal text editor. */}
    <input ref={editor} style={{ pointerEvents: focused ? 'auto' : 'none' }} aria-label="待辦內容" maxLength={500} value={text} onChange={e => setText(e.target.value)}
      onFocus={() => { base.current = item.text; setFocused(true); onEditing(item.id); }} onBlur={save}
      onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur(); } }}
      className={'min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-sm focus:bg-page-bg ' + (item.completed_at !== null ? 'text-text-muted line-through' : '')} />
    <button className="shrink-0 rounded-xl p-1.5 text-text-muted hover:bg-neutral-100" aria-label={`刪除待辦：${item.text}`} onClick={() => setRemove(true)}><Trash2 size={15} /></button>
    {remove && <AppDialog title="刪除待辦？" onClose={() => setRemove(false)}><p className="break-words text-sm">{item.text}</p><div className="mt-5 flex justify-end gap-2"><button className={button} onClick={() => setRemove(false)}>取消</button><button className={button} onClick={() => { state.service.remove(state.channel, item.id); setRemove(false); }}>刪除</button></div></AppDialog>}
  </div>;
}
export function TodoWidget({ state, management = false, fit = false }: { state: Widgets; management?: boolean; fit?: boolean }) {
  const [draft, setDraft] = useState(''), [error, setError] = useState(''), [editing, setEditing] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), anchor = useRef<HTMLDivElement>(null), tail = useRef<HTMLDivElement>(null);
  const position = useRef<{ account: string; offset: number; initialized: boolean }>({ account: '', offset: 0, initialized: false });
  const todos = state.snapshot.items.filter(i => i.kind === 'todo'), today = taipeiDay();
  const history = todos.filter(i => i.id !== editing && i.completed_at !== null && taipeiDay(i.completed_at) < today)
    .sort((a, b) => a.completed_at! - b.completed_at! || a.created_at - b.created_at);
  const current = todos.filter(i => !history.some(h => h.id === i.id));
  const groups = new Map<number, WidgetItem[]>();
  history.forEach(i => { const day = taipeiDay(i.completed_at!); groups.set(day, [...groups.get(day) || [], i]); });
  // Only reserve the space needed to start at current tasks. Never scroll into an empty tail on add.
  useLayoutEffect(() => {
    const el = viewport.current, start = anchor.current, end = tail.current; if (!el || !start || !end) return;
    const resize = () => { end.style.height = history.length ? `${Math.max(0, el.clientHeight - start.getBoundingClientRect().height - 36)}px` : '0px'; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(el); observer.observe(start);
    return () => observer.disconnect();
  }, [history.length, management]);
  useLayoutEffect(() => {
    const el = viewport.current, start = anchor.current; if (!el || !start) return;
    const offset = start.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop, previous = position.current;
    if (previous.account !== state.channel.account || !previous.initialized) {
      el.scrollTop = Math.max(0, offset - 36); position.current = { account: state.channel.account, offset, initialized: true };
    } else { el.scrollTop += offset - previous.offset; previous.offset = offset; }
  }, [state.channel.account, state.snapshot.loading, history.length, today]);
  const add = () => {
    const lines = draft.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (lines.some(l => l.length > 500) || todos.length + lines.length > 500) { setError('每行最多 500 字，未完成待辦最多 500 件。'); return; }
    lines.forEach(l => state.service.add(state.channel, 'todo', l)); setDraft(''); setError('');
  };
  return <section aria-label="待辦事項小組件" className={'flex min-w-0 flex-col rounded-3xl border border-border-subtle bg-surface p-5 ' + (management ? '' : fit ? 'h-full min-h-0' : 'h-[34rem]')}>
    <WidgetHeader kind="todo" state={state} management={management} />
    {history.length > 0 && <div className="mb-2 flex justify-end gap-3 text-xs text-text-muted"><button className="underline" onClick={() => viewport.current?.scrollTo({ top: Math.max(0, (anchor.current?.offsetTop || 0) - 180), behavior: 'smooth' })}>查看已完成</button><button className="underline" onClick={() => viewport.current?.scrollTo({ top: Math.max(0, (anchor.current?.offsetTop || 0) - 36), behavior: 'smooth' })}>回到待辦</button></div>}
    <div ref={viewport} data-todo-scroll className={'relative overflow-y-auto overscroll-y-contain [overflow-anchor:none] ' + (management ? 'h-64' : 'min-h-0 flex-1')}>
      {[...groups.entries()].map(([day, rows]) => <div key={day} className="pb-3"><p className="text-xs text-text-muted">{new Date(day * 86400000).toISOString().slice(5, 10)} 已完成</p>{rows.map(i => <TodoRow key={i.id} item={i} state={state} onEditing={setEditing} />)}</div>)}
      {history.length > 0 && <div className="flex h-24 items-center justify-center border-t border-dashed border-border-subtle text-xs text-text-muted">向上滑動查看近七天已完成事項</div>}
      <div ref={anchor} data-todo-current>{current.map(i => <TodoRow key={i.id} item={i} state={state} onEditing={setEditing} />)}{!current.length && <p className="py-4 text-sm text-text-muted">目前沒有待辦，從下方新增。</p>}</div>
      <div ref={tail} aria-hidden="true" />
    </div>
    <div className="mt-3 flex items-end gap-2 border-t border-border-subtle pt-3"><textarea aria-label="新增待辦" placeholder="新增待辦；每行一件事" rows={2} value={draft} onChange={e => setDraft(e.target.value)} className={input + ' resize-none'}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} /><button className={button + ' shrink-0'} disabled={!draft.trim()} onClick={add}><Plus size={18} aria-label="新增待辦事項" /></button></div>
    {error && <p role="alert" className="mt-2 text-xs text-status-eraser">{error}</p>}
  </section>;
}
function CountdownTile({ item, compact = false, onEdit }: { item: WidgetItem; compact?: boolean; onEdit?: (item: WidgetItem) => void }) {
  const days = countdownDays(item.target_date!);
  const content = <><div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-accent-300/20 via-accent-100/15 to-transparent" />
    <div className={'relative z-10 min-w-0 ' + (compact ? '' : 'flex flex-1 items-baseline gap-2')}><p className={'min-w-0 break-words font-medium ' + (compact ? 'text-xs sm:text-sm' : 'text-base sm:text-lg')}>{item.text}</p>{!compact && <time dateTime={item.target_date!} className="shrink-0 text-[11px] text-text-muted">{item.target_date}</time>}</div>
    <p className={'relative z-10 shrink-0 whitespace-nowrap tabular-nums ' + (compact ? 'text-[10px] sm:text-xs' : 'text-sm')}>{days > 0 ? <><strong className={compact ? 'text-lg font-semibold sm:text-xl' : 'text-2xl font-semibold sm:text-3xl'}>{days}</strong> 天</> : days === 0 ? '就是今天' : '已結束'}</p></>;
  const rowClass = 'relative min-w-0 overflow-hidden rounded-2xl bg-page-bg ' + (compact ? 'flex flex-col items-start justify-between gap-1 p-2.5 pb-2' : 'flex items-center justify-between gap-3 p-3 py-2.5');
  return onEdit ? <button className={rowClass + ' w-full text-left hover:brightness-95'} onClick={() => onEdit(item)} aria-label={`編輯倒數：${item.text}`}>{content}</button>
    : <div data-countdown-item={item.id} data-countdown-size={compact ? 'compact' : 'large'} title={`${item.text} · ${item.target_date}`} className={rowClass}>{content}</div>;
}
function CountdownRows({ items }: { items: WidgetItem[] }) {
  return <div className="space-y-2.5"><div className="space-y-2">{items.slice(0, 3).map(item => <CountdownTile key={item.id} item={item} />)}</div>
    {items.length > 3 && <div className="grid min-w-0 grid-cols-3 gap-2">{items.slice(3).map(item => <CountdownTile key={item.id} item={item} compact />)}</div>}</div>;
}
function CountdownManager({ items, state, onEdit }: { items: WidgetItem[]; state: Widgets; onEdit: (item: WidgetItem) => void }) {
  const root = useRef<HTMLDivElement>(null), base = useRef<string[]>([]);
  const sorting = useListReorder(items.map(item => item.id), root, root,
    () => { base.current = [...state.snapshot.preferences.countdown_order || []]; },
    ids => state.service.preferences(state.channel, { countdown_order: ids }, { countdown_order: base.current }));
  const byId = new Map(items.map(item => [item.id, item]));
  return <div ref={root} {...sorting.surface} className="space-y-2" aria-label="倒數排序清單">{sorting.order.map(id => {
    const item = byId.get(id); if (!item) return null;
    return <div key={id} data-reorder-id={id} data-reordering={sorting.active === id ? 'true' : undefined} className={'widget-reorder-row flex min-w-0 items-center gap-1 rounded-2xl ' + (sorting.active === id ? 'bg-neutral-100' : '')}>
      <CountdownTile item={item} onEdit={onEdit} />
      <button type="button" aria-label={'拖曳排序倒數：' + item.text} aria-pressed={sorting.active === id} title="拖曳排序；也可用上下鍵、Home／End 調整" className="flex h-11 w-8 shrink-0 touch-none select-none items-center justify-center rounded-xl text-text-muted hover:bg-neutral-100 cursor-grab active:cursor-grabbing" {...sorting.handle(id)}><GripVertical size={16} /></button>
    </div>;
  })}</div>;
}
function CountdownEditor({ item, state, onClose }: { item: WidgetItem | null; state: Widgets; onClose: () => void }) {
  const [text, setText] = useState(item?.text || ''), [date, setDate] = useState(item?.target_date || ''), [error, setError] = useState(''), [remove, setRemove] = useState(false);
  const save = () => {
    if (!text.trim() || text.length > 500 || !validTargetDate(date)) { setError('請輸入名稱與有效日期（2000–2199 年）。'); return; }
    try {
      if (item) state.service.update(state.channel, item.id, { text: text.trim(), target_date: date }, { text: item.text, target_date: item.target_date });
      else state.service.add(state.channel, 'countdown', text, date); onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return <AppDialog title={item ? '編輯倒數' : '新增倒數'} onClose={onClose}>
    <div className="space-y-4"><label className="block text-sm">事件名稱<input autoFocus className={input + ' mt-2'} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label>
      <label className="block text-sm">日期<input type="date" min="2000-01-01" max="2199-12-31" className={input + ' mt-2'} value={date} onChange={e => setDate(e.target.value)} /></label>
      <button type="button" className="text-xs text-text-muted underline underline-offset-4" onClick={() => { setText(GSAT_PRESET.text); setDate(GSAT_PRESET.target_date); }}>套用 116 學測 · 2027-01-22</button><p className="text-xs text-text-muted">預設日期依大考中心暫定日程，日程變更時請自行調整。倒數以臺灣日期計算。</p>
      {error && <p role="alert" className="text-sm text-status-eraser">{error}</p>}
      {remove && <p className="text-sm">確定刪除此倒數？</p>}
      <div className="flex flex-wrap justify-end gap-2">{item && <button className={button + ' mr-auto'} onClick={() => remove ? (state.service.remove(state.channel, item.id), onClose()) : setRemove(true)}>{remove ? '確認刪除' : '刪除'}</button>}<button className={button} onClick={onClose}>取消</button><button className={button} onClick={save}>儲存</button></div>
    </div>
  </AppDialog>;
}
export function CountdownWidget({ state, management = false }: { state: Widgets; management?: boolean }) {
  const [editing, setEditing] = useState<WidgetItem | null | undefined>();
  const items = orderedCountdowns(state.snapshot.items, state.snapshot.preferences.countdown_order);
  return <section aria-label="事件倒數小組件" className={'flex min-w-0 flex-col rounded-3xl border border-border-subtle bg-surface p-5 ' + (management ? '' : 'min-h-0')}>
    <WidgetHeader kind="countdown" state={state} management={management} />
    <div className={management ? '' : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain'}>
      {management && items.length > 1 && <p className="mb-3 text-xs text-text-muted">拖曳右側把手調整首頁順序；自訂後前三個放大顯示，新事件加入末尾。</p>}
      <>{management ? <CountdownManager items={items} state={state} onEdit={setEditing} /> : <CountdownRows items={items} />}</>
      {!items.length && <p className="py-4 text-sm text-text-muted">尚未設定倒數。{!management && <Link to={settingsUrl('countdown')} className="ml-2 text-text-muted underline">前往設定新增</Link>}</p>}
    </div>
    {management && <button className={button + ' mt-4 flex items-center gap-2'} onClick={() => setEditing(null)}><Plus size={16} />新增倒數</button>}
    {management && editing !== undefined && <CountdownEditor item={editing} state={state} onClose={() => setEditing(undefined)} />}
  </section>;
}
export function HomeWidgets() {
  const state = useHomeWidgets();
  return <><div data-home-widgets className={'grid min-w-0 grid-cols-1 items-stretch gap-5 ' + (state.snapshot.preferences.todos_visible ? 'md:grid-cols-2' : '')}>
    {state.snapshot.preferences.todos_visible && <TodoWidget key={state.channel.account + ':todo'} state={state} />}
    <div data-home-widgets-secondary className={'grid h-[34rem] min-w-0 gap-5 ' + (state.snapshot.preferences.countdowns_visible ? 'grid-rows-[minmax(0,2fr)_minmax(0,1fr)]' : 'grid-rows-1')}>
      {state.snapshot.preferences.countdowns_visible && <CountdownWidget key={state.channel.account + ':countdown'} state={state} />}
      <PublicExploreActivity compact />
    </div>
  </div><WidgetConflict state={state} /></>;
}
export function HomeWidgetSettings() {
  const progress = useProgressPlans();
  const state = useHomeWidgets(), location = useLocation(), root = useRef<HTMLDivElement>(null);
  const selected = new URLSearchParams(location.search).get('widget');
  useEffect(() => { if (selected) root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [selected]);
  return <div ref={root} id="home-widgets" className="scroll-mt-24 space-y-5">
    <section className="rounded-3xl border border-border-subtle bg-surface p-5"><h2 className="mb-4 font-semibold">首頁小組件</h2>
      <div className="space-y-3"><SwitchRow label="顯示待辦事項" checked={state.snapshot.preferences.todos_visible} onChange={todos_visible => state.service.preferences(state.channel, { todos_visible })} />
        <SwitchRow label="顯示事件倒數" checked={state.snapshot.preferences.countdowns_visible} onChange={countdowns_visible => state.service.preferences(state.channel, { countdowns_visible })} /><ProgressPlansVisibility state={progress} /></div>
      <p className="mt-4 text-xs leading-relaxed text-text-muted">首頁可新增、編輯與勾選待辦、登記學習進度；倒數只供檢視，計畫內容與倒數於此管理。</p>
    </section>
    {selected === 'progress' && <ProgressPlansWidget key={progress.channel.account} state={progress} management />}
    {selected === 'countdowns' ? <><CountdownWidget key={state.channel.account + ':countdown'} state={state} management /><TodoWidget key={state.channel.account + ':todo'} state={state} management /></> : <><TodoWidget key={state.channel.account + ':todo'} state={state} management /><CountdownWidget key={state.channel.account + ':countdown'} state={state} management /></>}
    {selected !== 'progress' && <ProgressPlansWidget key={progress.channel.account} state={progress} management />}
    <ProgressPlansConflict state={progress} /><WidgetConflict state={state} />
  </div>;
}
