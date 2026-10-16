import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowDownLeft, ArrowUp, CalendarDays, Check, GripVertical, ListTodo, MoreHorizontal, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { SwitchRow } from './SwitchRow';
import { PublicExploreActivity } from './PublicExploreActivity';
import { useListReorder } from '../hooks/useListReorder';
import { useTodoHistory } from '../hooks/useTodoHistory';
import { useTodoInsertPreference } from '../hooks/useTodoInsertPreference';
import { useProgressPlans } from '../hooks/useProgressPlans';
import { ProgressPlansWidget, ProgressPlansVisibility, ProgressPlansConflict } from './ProgressPlans';
import { useHomeWidgets } from '../hooks/useHomeWidgets';
import { countdownDays, GSAT_PRESET, orderedCountdowns, taipeiDay, validTargetDate } from '../types/homeWidgets';
import { orderedCurrentTodos, organizeTodoOrder, todoInsertionTargets } from '../types/todoOrder';
import type { TodoInsertDirection } from '../types/todoOrder';
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
  const orderText = (ids: unknown) => Array.isArray(ids) && ids.length ? ids.map(id => state.snapshot.items.find(i => i.id === id)?.text || '已移除項目').join(' → ') : '預設順序';
  const orderField = Object.hasOwn(conflict.operation.patch, 'todo_order') ? 'todo_order' : Object.hasOwn(conflict.operation.patch, 'countdown_order') ? 'countdown_order' : null;
  return <AppDialog title="小組件修改需要確認" onClose={() => { /* Keep unresolved work available. */ }}>
    <p className="text-sm text-text-muted">相同內容已在其他地方修改。請選擇保留的版本；其他項目不受影響。</p>
    <div className="mt-4 space-y-3 text-sm">
      <div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">本機修改</p><p className="mt-1 whitespace-pre-wrap break-words">{orderField ? orderText(conflict.operation.patch[orderField]) : typeof localText === 'string' ? localText : conflict.operation.action === 'delete' ? '移除此項目' : JSON.stringify(conflict.operation.patch)}</p></div>
      <div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">雲端版本</p><p className="mt-1 whitespace-pre-wrap break-words">{orderField && conflict.current && orderField in conflict.current ? orderText((conflict.current as Record<string, unknown>)[orderField]) : cloudText ?? (conflict.current ? '設定已更新' : '項目已移除或超過保留期限')}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={button} onClick={() => service.resolve(channel, false)}>採用雲端版本</button>
      {conflict.current && <button className={button} onClick={() => service.resolve(channel, true)}>保留本機修改</button>}</div>
  </AppDialog>;
}
function WidgetHeader({ kind, state, management = false, historyAction, actions, menuDisabled, status, help }: { kind: WidgetKind; state: Widgets; management?: boolean; historyAction?: { label: string; onSelect: () => void }; actions?: ReactNode; menuDisabled?: boolean; status?: ReactNode; help?: ReactNode }) {
  const [menu, setMenu] = useState(false), [showHelp, setShowHelp] = useState(false), name = kind === 'todo' ? '待辦事項' : '事件倒數';
  const Icon = kind === 'todo' ? ListTodo : CalendarDays;
  return <>
    <div data-widget-header className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="flex min-w-0 items-center gap-2 font-semibold"><Icon size={18} className="shrink-0 text-text-muted" /><span className="truncate">{name}</span></h2><div className="mt-1">{status ?? <WidgetStatus state={state} />}</div></div>
      <div className="flex shrink-0 items-center gap-1">{actions}{(!management || help) && <button className="rounded-xl p-2 hover:bg-neutral-100" aria-label={name + '選單'} onClick={() => { setShowHelp(false); setMenu(true); }}><MoreHorizontal size={20} /></button>}</div>
    </div>
    {menu && <AppDialog title={showHelp ? '待辦整理說明' : name + '選單'} onClose={() => setMenu(false)}>
      {showHelp ? <><div className="space-y-3 text-sm leading-relaxed text-text-muted">{help}</div><div className="mt-5 flex justify-end"><button className={button} onClick={() => setShowHelp(false)}>返回選單</button></div></>
        : <div className="flex flex-col gap-2 text-center">{!menuDisabled && <Link className={button} to={settingsUrl(kind)} onClick={() => setMenu(false)}>前往設定管理組件</Link>}
          {help && <button className={button} onClick={() => setShowHelp(true)}>查看整理說明</button>}
          {!menuDisabled && historyAction && <button className={button} onClick={() => { setMenu(false); historyAction.onSelect(); }}>{historyAction.label}</button>}
          {!menuDisabled && <button className={button} onClick={() => { setMenu(false); void state.service.refresh(state.channel, true); }}>重新同步</button>}</div>}
    </AppDialog>}
  </>;
}
function TodoRow({ item, state, onEditing, organize }: { item: WidgetItem; state: Widgets; onEditing: (id: string | null) => void; organize?: { position: number | null; onSelect: () => void; choosing: boolean } }) {
  const [text, setText] = useState(item.text), [focused, setFocused] = useState(false), [remove, setRemove] = useState(false), [restore, setRestore] = useState(false);
  const historical = item.completed_at !== null && taipeiDay(item.completed_at) < taipeiDay();
  const editor = useRef<HTMLInputElement>(null);
  const base = useRef(item.text), cancelled = useRef(false);
  useEffect(() => { if (!focused) setText(item.text); }, [item.text, focused]);
  const save = () => {
    setFocused(false); onEditing(null); if (cancelled.current) { cancelled.current = false; setText(item.text); return; } const next = text.trim(); if (!next) { setText(item.text); return; }
    state.service.update(state.channel, item.id, { text: next }, { text: base.current });
  };
  return <div className="flex min-w-0 items-center gap-2 py-0.5" data-todo-row={item.id}
    onClick={event => { if (!organize && !focused && event.target instanceof Element && event.currentTarget.contains(event.target) && !event.target.closest('button')) editor.current?.focus(); }}>
    <button className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm tabular-nums ' + (organize?.position ? 'border-[#A8C5BD] bg-[#A8C5BD]/30 font-semibold text-text-main' : item.completed_at !== null ? 'border-[#A8C5BD] bg-[#A8C5BD]/20 text-text-main' : 'border-border-subtle')}
      type="button" role={organize ? undefined : 'checkbox'} aria-checked={organize ? undefined : item.completed_at !== null} aria-pressed={organize && item.completed_at === null ? organize.position !== null : undefined}
      aria-label={organize ? item.completed_at !== null ? '已完成：' + item.text : '排序選取：' + item.text : '完成：' + item.text}
      disabled={historical || !!organize && (item.completed_at !== null || organize.choosing)}
      onClick={() => { if (organize) organize.onSelect(); else if (!historical) state.service.update(state.channel, item.id, { completed_at: item.completed_at === null ? Date.now() : null }, { completed_at: item.completed_at }); }}>
      {organize?.position ?? (item.completed_at !== null ? <Check size={17} /> : null)}</button>
    {/* Readable rows pass swipes to the panel; tapping enters the normal text editor. */}
    <input ref={editor} style={{ pointerEvents: focused ? 'auto' : 'none' }} aria-label="待辦內容" readOnly={!!organize} tabIndex={organize ? -1 : 0} maxLength={500} value={text} onChange={e => setText(e.target.value)}
      onFocus={() => { base.current = item.text; setFocused(true); onEditing(item.id); }} onBlur={save}
      onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur(); } }}
      className={'min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-sm focus:bg-page-bg ' + (organize?.choosing && organize.position ? 'opacity-60 ' : '') + (item.completed_at !== null ? 'text-text-muted line-through' : '')} />
    {historical && <button type="button" className="shrink-0 rounded-xl p-1.5 text-text-muted hover:bg-neutral-100" aria-label={`恢復待辦：${item.text}`} title="恢復為未完成" disabled={!!organize} onClick={() => setRestore(true)}><RotateCcw size={15} /></button>}
    <button type="button" className="shrink-0 rounded-xl p-1.5 text-text-muted hover:bg-neutral-100" aria-label={`刪除待辦：${item.text}`} disabled={!!organize} onClick={() => setRemove(true)}><Trash2 size={15} /></button>
    {remove && <AppDialog title="刪除待辦？" onClose={() => setRemove(false)}><p className="break-words text-sm">{item.text}</p><div className="mt-5 flex justify-end gap-2"><button className={button} onClick={() => setRemove(false)}>取消</button><button className={button} onClick={() => { state.service.remove(state.channel, item.id); setRemove(false); }}>刪除</button></div></AppDialog>}
    {restore && <AppDialog title="恢復為未完成？" onClose={() => setRestore(false)}><p className="break-words text-sm">{item.text}</p><p className="mt-2 text-sm text-text-muted">此事項將移回目前待辦清單。</p><div className="mt-5 flex justify-end gap-2"><button className={button} onClick={() => setRestore(false)}>取消</button><button className={button} onClick={() => { state.service.update(state.channel, item.id, { completed_at: null }, { completed_at: item.completed_at }); setRestore(false); }}>恢復待辦</button></div></AppDialog>}
  </div>;
}
function TodoInsertPoint({ beforeId, index, onInsert }: { beforeId: string | null; index: number; onInsert: (beforeId: string | null) => void }) {
  const gesture = useRef<{ x: number; y: number; moved: boolean; scroll: HTMLElement | null; top: number; pager: HTMLElement | null; left: number } | null>(null);
  return <div className="relative z-10 h-0"><button type="button" data-todo-insert-before={beforeId ?? ''} data-todo-insert-index={index} aria-label={'插入位置 ' + (index + 1)}
    className="absolute inset-x-0 -top-4 flex h-8 w-full touch-manipulation items-center gap-2 rounded-xl px-2 text-[#7E9F94] hover:bg-[#A8C5BD]/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    onPointerDown={event => { const scroll = event.currentTarget.closest<HTMLElement>('[data-todo-scroll]'), pager = event.currentTarget.closest<HTMLElement>('[data-dashboard-carousel]'); gesture.current = { x: event.clientX, y: event.clientY, moved: false, scroll, top: scroll?.scrollTop || 0, pager, left: pager?.scrollLeft || 0 }; }}
    onPointerMove={event => { const g = gesture.current; if (g && Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8) g.moved = true; }}
    onPointerLeave={() => { if (gesture.current) gesture.current.moved = true; }}
    onPointerCancel={() => { if (gesture.current) gesture.current.moved = true; }}
    onClick={event => { const g = gesture.current; gesture.current = null; if (event.detail !== 0 && g && (g.moved || Math.abs((g.scroll?.scrollTop || 0) - g.top) > 1 || Math.abs((g.pager?.scrollLeft || 0) - g.left) > 1)) return; onInsert(beforeId); }}>
    <span aria-hidden="true" className="h-px flex-1 bg-[#A8C5BD]/60" /><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-[#A8C5BD]/70 bg-surface"><ArrowDownLeft size={12} /></span><span aria-hidden="true" className="h-px flex-1 bg-[#A8C5BD]/60" />
  </button></div>;
}
function TodoComposer({ state, disabled }: { state: Widgets; disabled: boolean }) {
  const preference = useTodoInsertPreference(state.channel.account);
  const [draft, setDraft] = useState(''), [focused, setFocused] = useState(false), [error, setError] = useState('');
  const [direction, setDirection] = useState<TodoInsertDirection>(preference.direction);
  const editor = useRef<HTMLTextAreaElement>(null), pointerChoice = useRef<TodoInsertDirection | null>(null);
  const description = useId(), choosing = !draft && !focused, currentDirection = choosing ? preference.direction : direction;
  const label = currentDirection === 'top' ? '新增至上' : '新增至下', Icon = currentDirection === 'top' ? ArrowUp : ArrowDown;
  const choose = (next: TodoInsertDirection) => { setDirection(next); preference.remember(next); };
  const add = () => {
    if (disabled || !draft.trim()) return;
    try { state.service.addTodos(state.channel, draft.split(/\r?\n/), currentDirection); setDraft(''); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '新增失敗，請重試'); }
  };
  return <div className="mt-3 border-t border-border-subtle pt-3" data-todo-composer data-todo-insert-direction={currentDirection}>
    <div className="flex items-end gap-2">
      <div className="relative min-w-0 flex-1">
        <textarea ref={editor} disabled={disabled} aria-label="新增待辦" aria-describedby={description} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" placeholder={choosing ? '' : '新增待辦；每行一件事'} rows={2} value={draft}
          onPointerDown={event => {
            pointerChoice.current = null;
            if (!draft && document.activeElement !== event.currentTarget && event.isPrimary && event.button === 0) {
              const rect = event.currentTarget.getBoundingClientRect();
              pointerChoice.current = event.clientX < rect.left + rect.width / 2 ? 'bottom' : 'top';
            }
          }}
          onPointerCancel={() => { pointerChoice.current = null; }}
          onFocus={() => { if (!draft) choose(pointerChoice.current || preference.direction); pointerChoice.current = null; setFocused(true); }}
          onBlur={() => { pointerChoice.current = null; setFocused(false); }}
          onChange={event => { setDraft(event.target.value); setError(''); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); choose(event.key === 'ArrowUp' ? 'top' : 'bottom'); }
            else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); add(); }
          }} className={input.replace(' text-sm', '') + ' block resize-none text-base sm:text-sm'} />
        {choosing && <div aria-hidden="true" data-todo-input-hints className={'pointer-events-none absolute inset-0 flex items-center text-xs text-text-muted ' + (disabled ? 'opacity-40' : '')}>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1"><ArrowDown size={14} />新增至下</span>
          <span className="h-6 w-px bg-border-subtle" />
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1"><ArrowUp size={14} />新增至上</span>
        </div>}
      </div>
      <button type="button" aria-label="新增待辦事項" aria-describedby={description} title={label} disabled={disabled || !draft.trim()} className="flex w-11 shrink-0 self-stretch items-center justify-center rounded-xl border border-border-subtle hover:bg-neutral-100 disabled:opacity-40"
        onMouseDown={event => { if (document.activeElement === editor.current) event.preventDefault(); }}
        onClick={() => { add(); editor.current?.focus({ preventScroll: true }); }}><Icon size={18} aria-hidden="true" /></button>
    </div>
    <span id={description} className="sr-only" aria-live="polite">{label}；Enter 新增，Shift+Enter 換行；Alt+向上或向下鍵切換新增方向。</span>
    {error && <p role="alert" className="mt-2 text-xs text-text-muted">{error}</p>}
  </div>;
}
export function TodoWidget({ state, management = false, fit = false }: { state: Widgets; management?: boolean; fit?: boolean }) {
  const [error, setError] = useState(''), [editing, setEditing] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState<{ ids: string[]; selected: string[]; base: string[]; choosing: boolean } | null>(null);
  const organizeButton = useRef<HTMLButtonElement>(null), sortToButton = useRef<HTMLButtonElement>(null);
  const scrollAnchor = useRef<{ id: string; offset: number } | null>(null);
  const todos = state.snapshot.items.filter(i => i.kind === 'todo'), today = taipeiDay();
  const history = todos.filter(i => i.completed_at !== null && taipeiDay(i.completed_at) < today)
    .sort((a, b) => a.completed_at! - b.completed_at! || a.created_at - b.created_at);
  const normal = orderedCurrentTodos(todos, state.snapshot.preferences.todo_order || [], today);
  const ranks = new Map(organizing?.ids.map((id, index) => [id, index]));
  const current = organizing ? [...normal].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)) : normal;
  const eligible = new Set(current.filter(i => i.completed_at === null).map(i => i.id));
  const selected = organizing?.selected.filter(id => eligible.has(id)) || [];
  const targets = todoInsertionTargets(current, selected), targetIndexes = new Map(targets.map((id, index) => [id, index]));
  const firstUnfinished = current.find(i => i.completed_at === null)?.id;
  useEffect(() => {
    if (organizing && selected.length !== organizing.selected.length) setOrganizing(previous => previous ? { ...previous, selected: previous.selected.filter(id => eligible.has(id)), choosing: previous.choosing && selected.length > 0 } : null);
  }, [selected.join('|'), organizing?.selected.length]);
  const exitOrganizing = () => { setOrganizing(null); requestAnimationFrame(() => organizeButton.current?.focus({ preventScroll: true })); };
  const select = (id: string) => setOrganizing(previous => !previous ? null : { ...previous, selected: previous.selected.includes(id) ? previous.selected.filter(value => value !== id) : [...previous.selected, id] });
  const setDestinationStep = (choosing: boolean) => {
    const viewport = historyView.viewport.current;
    if (viewport) {
      const top = viewport.getBoundingClientRect().top;
      const row = [...viewport.querySelectorAll<HTMLElement>('[data-todo-current] [data-todo-row]')].find(node => node.getBoundingClientRect().bottom > top + 1);
      scrollAnchor.current = row ? { id: row.dataset.todoRow!, offset: row.getBoundingClientRect().top - top } : null;
    }
    setOrganizing(previous => previous ? { ...previous, choosing } : null);
    requestAnimationFrame(() => {
      if (!choosing) { sortToButton.current?.focus({ preventScroll: true }); return; }
      const viewport = historyView.viewport.current; if (!viewport) return;
      const bounds = viewport.getBoundingClientRect(), points = [...viewport.querySelectorAll<HTMLButtonElement>('[data-todo-insert-index]')];
      const visible = points.find(point => { const rect = point.getBoundingClientRect(); return rect.top >= bounds.top && rect.bottom <= bounds.bottom; });
      (visible || points[0])?.focus({ preventScroll: !!visible });
    });
  };
  const applyOrder = (beforeId: string | null) => {
    if (!organizing?.choosing || !selected.length) return;
    const order = organizeTodoOrder(current, selected, beforeId);
    if (!order) { setError('清單已更新，請重新選擇插入位置。'); return; }
    state.service.preferences(state.channel, { todo_order: order }, { todo_order: organizing.base });
    exitOrganizing();
  };
  const groups = new Map<number, WidgetItem[]>();
  history.forEach(i => { const day = taipeiDay(i.completed_at!); groups.set(day, [...groups.get(day) || [], i]); });
  const historyView = useTodoHistory(state.channel.account, today + ':' + history.map(i => i.id + ':' + i.completed_at).join('|'), !organizing && history.length > 0, history.some(i => i.id === editing));
  useLayoutEffect(() => {
    const anchor = scrollAnchor.current, viewport = historyView.viewport.current; scrollAnchor.current = null;
    if (!anchor || !viewport) return;
    const row = [...viewport.querySelectorAll<HTMLElement>('[data-todo-current] [data-todo-row]')].find(node => node.dataset.todoRow === anchor.id);
    if (row) viewport.scrollTop += row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
  }, [organizing?.choosing]);
  useLayoutEffect(() => {
    if (organizing) historyView.viewport.current?.querySelector<HTMLButtonElement>('[data-todo-current] button:not(:disabled)')?.focus({ preventScroll: true });
  }, [!!organizing]);
  return <section aria-label="待辦事項小組件" data-todo-organizing={!!organizing} data-todo-organize-step={organizing ? organizing.choosing ? 'destination' : 'selection' : undefined} onKeyDown={event => { if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return; if (organizing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (organizing.choosing) setDestinationStep(false); else exitOrganizing(); } }} className={'flex min-w-0 flex-col rounded-3xl border p-5 transition-colors ' + (organizing ? 'border-[#A8C5BD] bg-[#A8C5BD]/10 ' : 'border-border-subtle bg-surface ') + (management ? '' : fit ? 'h-full min-h-0' : 'h-[34rem]')}>
    <WidgetHeader kind="todo" state={state} management={management} menuDisabled={!!organizing}
      status={organizing ? <span className="block whitespace-nowrap text-xs text-text-muted" aria-live="polite">已選 {selected.length} 項</span> : undefined}
      actions={organizing ? <div className="flex items-center gap-1" role="group" aria-label="待辦整理操作">
        {organizing.choosing ? <button type="button" className="h-8 rounded-xl border border-border-subtle px-2 text-xs hover:bg-neutral-100" onClick={() => setDestinationStep(false)}>返回選取</button>
          : <button ref={sortToButton} type="button" className="h-8 rounded-xl border border-border-subtle px-2 text-xs hover:bg-neutral-100 disabled:opacity-40" disabled={!selected.length} onClick={() => setDestinationStep(true)}>Sort to…</button>}
        <button type="button" className="h-8 rounded-xl border border-border-subtle px-2 text-xs hover:bg-neutral-100" onClick={exitOrganizing}>取消</button>
      </div> : <button ref={organizeButton} type="button" aria-pressed={false} disabled={!eligible.size || !!state.snapshot.conflict} className={button + ' px-2 text-xs disabled:opacity-40'} onClick={() => { historyView.close(); setOrganizing({ ids: current.map(i => i.id), selected: [], base: [...state.snapshot.preferences.todo_order || []], choosing: false }); }}>整理</button>}
      help={<><p>按「整理」，依希望的順序點選未完成事項的左框。再次點選可取消，其他編號會依序遞補。</p><p>按「Sort to…」，點清單中的插入線移動整組事項；第一條放到最前，最後一條放到最末。沒有選取的事項保留原有順序。</p><p>「返回選取」保留編號；「取消」不變更清單。今日勾選或取消勾選不會移動事項；只有套用整理時才將今日完成事項集中到上方，過去完成事項不參與排序。</p><p>整理時仍可捲動清單或左右滑頁。鍵盤可用 Tab／空白選取、Enter 選擇插入位置；Escape 返回選取，再按一次取消。</p></>}
      historyAction={!organizing && history.length ? { label: historyView.expanded ? '收起過去事項' : '查看過去事項', onSelect: () => historyView.expanded ? historyView.close() : historyView.open(180) } : undefined} />
    <div className={'relative min-h-0 ' + (management ? 'h-64' : 'flex-1')}>
      <div ref={historyView.hint} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 rounded-xl bg-surface/95 px-3 py-2 text-center text-xs text-text-muted transition-opacity duration-150 motion-reduce:transition-none" style={{ opacity: 0 }}>
        <span>繼續滾動以查看過去事項</span><div className="mt-1 h-0.5 origin-left rounded-full bg-primary/20" style={{ transform: 'scaleX(var(--todo-pull, 0))' }} />
      </div>
      <div ref={historyView.viewport} data-todo-scroll data-history-open={historyView.expanded} tabIndex={0} aria-label={organizing ? "待辦清單；整理中" : "待辦清單；在頂端按 Page Up 查看過去事項"} className="relative h-full overflow-y-auto overscroll-y-contain [overflow-anchor:none]">
        <div ref={historyView.history} data-todo-history hidden={!historyView.expanded}>
          {[...groups.entries()].map(([day, rows]) => <div key={day} className="pb-3"><p className="text-xs text-text-muted">{new Date(day * 86400000).toISOString().slice(5, 10)} 已完成</p>{rows.map(i => <TodoRow key={i.id} item={i} state={state} onEditing={setEditing} organize={organizing ? { position: selected.includes(i.id) ? selected.indexOf(i.id) + 1 : null, onSelect: () => select(i.id), choosing: organizing.choosing } : undefined} />)}</div>)}
          <p className="mb-2 border-t border-dashed border-border-subtle py-2 text-center text-xs text-text-muted">目前待辦</p>
        </div>
        <div ref={historyView.current} data-todo-current className="overflow-clip py-2.5">{current.map(i => <Fragment key={i.id}>
          {organizing?.choosing && targets.length > 0 && (i.id === firstUnfinished || targetIndexes.has(i.id) && targetIndexes.get(i.id)! > 0) && <TodoInsertPoint beforeId={i.id === firstUnfinished ? targets[0] : i.id} index={i.id === firstUnfinished ? 0 : targetIndexes.get(i.id)!} onInsert={applyOrder} />}
          <TodoRow item={i} state={state} onEditing={setEditing} organize={organizing ? { position: selected.includes(i.id) ? selected.indexOf(i.id) + 1 : null, onSelect: () => select(i.id), choosing: organizing.choosing } : undefined} />
        </Fragment>)}{organizing?.choosing && targets.length > 1 && <TodoInsertPoint beforeId={null} index={targets.length - 1} onInsert={applyOrder} />}
        {!current.length && <p className="py-4 text-sm text-text-muted">目前沒有待辦，從下方新增。</p>}</div>
        <div ref={historyView.tail} aria-hidden="true" />
      </div>
    </div>
    <TodoComposer state={state} disabled={!!organizing} />
    {error && <p role="alert" className="mt-2 text-xs text-status-eraser">{error}</p>}
  </section>;
}
function CountdownTile({ item, compact = false, onEdit }: { item: WidgetItem; compact?: boolean; onEdit?: (item: WidgetItem) => void }) {
  const days = countdownDays(item.target_date!);
  const content = <><div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-accent-300/20 via-accent-100/15 to-transparent" />
    <div className={'relative z-10 min-w-0 ' + (compact ? '' : 'flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5')}><p className={'min-w-0 max-w-full break-words font-medium ' + (compact ? 'text-xs sm:text-sm' : 'text-base sm:text-lg')}>{item.text}</p>{!compact && <time dateTime={item.target_date!} className="shrink-0 text-[11px] text-text-muted">{item.target_date}</time>}</div>
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
