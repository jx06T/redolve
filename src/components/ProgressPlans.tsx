import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, MoreHorizontal, Plus, TrendingUp } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { AnchoredPopover, popoverActionClass } from './AnchoredPopover';
import { SwitchRow } from './SwitchRow';
import { useProgressPlans } from '../hooks/useProgressPlans';
import { useListReorder } from '../hooks/useListReorder';
import { useStore } from '../store/useStore';
import { validProgressMetadata } from '../types/studyProgress';
import type { ProgressPlan, ProgressPreferences } from '../types/studyProgress';

export type ProgressState = ReturnType<typeof useProgressPlans>;
const settingsUrl = '/settings?widget=progress#profile';
const button = 'rounded-xl border border-border-subtle px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40';
const input = 'min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm';
const safe = (action: () => void) => { try { action(); } catch (e) { useStore.getState().showToast((e as Error).message, 'error'); } };
function ProgressStatus({ state }: { state: ProgressState }) {
  const s = state.snapshot;
  return <div className="mt-1 text-xs text-text-muted" aria-live="polite">{s.storageError ? <span role="alert">瀏覽器無法保存，請勿關閉頁面</span> : s.conflict ? '有修改需要確認' : s.error ? <><span>{s.error}；草稿仍保留。</span><button className="ml-2 underline" onClick={() => void state.service.retry(state.channel)}>重試同步</button></> : s.syncing ? '同步中…' : state.channel.account === 'guest' ? '本機保存' : s.pending ? '等待同步' : '已同步'}{s.notice && <p>{s.notice}</p>}</div>;
}
function ProgressTapZone({ plan, state, delta }: { plan: ProgressPlan; state: ProgressState; delta: 1 | -1 }) {
  const gesture = useRef<{ x: number; y: number; moved: boolean; scroll: number } | null>(null);
  const carousel = useRef<HTMLElement | null>(null);
  const disabled = delta === -1 ? plan.completed_count === 0 : plan.completed_count >= plan.target_count;
  return <button type="button" aria-label={(delta === 1 ? '增加進度：' : '減少進度：') + plan.name} disabled={disabled}
    className={'absolute inset-y-0 w-1/4 rounded-2xl bg-transparent focus-visible:outline-2 focus-visible:outline-primary/40 ' + (delta === -1 ? 'left-0' : 'right-0')}
    onPointerDown={e => {
      carousel.current = e.currentTarget.closest('[data-dashboard-carousel]');
      gesture.current = { x: e.clientX, y: e.clientY, moved: !e.isPrimary || e.button !== 0, scroll: carousel.current?.scrollLeft || 0 };
    }}
    onPointerMove={e => { const g = gesture.current; if (g && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.moved = true; }}
    onPointerCancel={() => { if (gesture.current) gesture.current.moved = true; }}
    onClick={e => {
      const g = gesture.current;
      // Native pan usually cancels click; this also guards browsers that emit a
      // click after a swipe. Keyboard activation remains a real button action.
      if (e.detail !== 0 && (!g || g.moved || Math.abs((carousel.current?.scrollLeft || 0) - g.scroll) > 4)) return;
      gesture.current = null; safe(() => state.service.step(state.channel, plan.id, delta));
    }}><span className="sr-only">{delta === 1 ? '加一' : '減一'}</span></button>;
}
function PlanContent({ plan }: { plan: ProgressPlan }) {
  const complete = plan.completed_count >= plan.target_count, percentage = Math.min(100, Math.round(plan.completed_count / plan.target_count * 100));
  return <div className="pointer-events-none min-w-0 space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="min-w-0 break-words text-sm font-semibold">{plan.name}</p><span className="shrink-0 text-xs text-text-muted tabular-nums">{plan.completed_count}／{plan.target_count} {plan.unit} · {complete ? '已完成' : percentage + '%'}</span></div>
    <div role="progressbar" aria-label={plan.name} aria-valuemin={0} aria-valuemax={plan.target_count} aria-valuenow={Math.min(plan.completed_count, plan.target_count)} aria-valuetext={`${plan.completed_count}／${plan.target_count} ${plan.unit}`} className="h-2 overflow-hidden rounded-full bg-neutral-200">
      <div className="h-full rounded-full bg-linear-to-r from-accent-peach to-accent-sage transition-[width] duration-200 motion-reduce:transition-none" style={{ width: percentage + '%' }} />
    </div>
  </div>;
}
function PlanEditor({ state, plan, onClose }: { state: ProgressState; plan: ProgressPlan | null; onClose: () => void }) {
  const [name, setName] = useState(plan?.name || ''), [target, setTarget] = useState(String(plan?.target_count || 12));
  const presets = ['章', '回', '頁', '題', '單元'];
  const [unitChoice, setUnitChoice] = useState(plan && !presets.includes(plan.unit) ? '自訂' : plan?.unit || '章'), [customUnit, setCustomUnit] = useState(plan?.unit || '');
  const [error, setError] = useState(''), [remove, setRemove] = useState(false);
  const save = () => {
    const metadata = { name: name.trim(), target_count: Number(target), unit: (unitChoice === '自訂' ? customUnit : unitChoice).trim() };
    if (!validProgressMetadata(metadata)) { setError('名稱最多 100 字、單位最多 12 字；目標須為 1–1,000,000 的整數。'); return; }
    try { if (plan) state.service.updateMetadata(state.channel, plan.id, metadata, plan); else state.service.create(state.channel, metadata); onClose(); }
    catch (e) { setError((e as Error).message); }
  };
  return <AppDialog title={plan ? '編輯學習計畫' : '新增學習計畫'} onClose={onClose}>
    <div className="space-y-4"><label className="block text-sm">名稱<input autoFocus className={input + ' mt-2'} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="grid min-w-0 grid-cols-2 gap-3"><label className="min-w-0 text-sm">目標<input type="number" inputMode="numeric" min={1} max={1000000} step={1} className={input + ' mt-2'} value={target} onChange={e => setTarget(e.target.value)} /></label>
        <label className="min-w-0 text-sm">單位<select className={input + ' mt-2'} value={unitChoice} onChange={e => setUnitChoice(e.target.value)}>{[...presets, '自訂'].map(unit => <option key={unit}>{unit}</option>)}</select></label></div>
      {unitChoice === '自訂' && <label className="block text-sm">自訂單位<input className={input + ' mt-2'} maxLength={12} value={customUnit} onChange={e => setCustomUnit(e.target.value)} /></label>}
      <p className="text-xs text-text-muted">{plan ? `目前已完成 ${plan.completed_count} ${plan.unit}，修改目標不會重置進度。` : '從零開始；在首頁點左側減一、右側加一。'}</p>
      {error && <p role="alert" className="text-sm text-status-eraser">{error}</p>}
      {remove && <p className="text-sm">移除此計畫及其進度？其他計畫不受影響。</p>}
      <div className="flex flex-wrap justify-end gap-2">{plan && <button className={button + ' mr-auto'} onClick={() => { if (!remove) setRemove(true); else { try { state.service.remove(state.channel, plan); onClose(); } catch (e) { setError((e as Error).message); } } }}>{remove ? '確認移除' : '移除'}</button>}<button className={button} onClick={onClose}>取消</button><button className={button} onClick={save}>儲存</button></div>
    </div>
  </AppDialog>;
}
function PlanManager({ state, onEdit }: { state: ProgressState; onEdit: (p: ProgressPlan) => void }) {
  const root = useRef<HTMLDivElement>(null), base = useRef<ProgressPreferences>(state.snapshot.preferences), plans = state.snapshot.plans;
  const sorting = useListReorder(plans.map(p => p.id), root, root, () => { base.current = state.snapshot.preferences; }, ids => safe(() => state.service.preferences(state.channel, { order: ids }, base.current)));
  const byId = new Map(plans.map(p => [p.id, p]));
  return <div ref={root} {...sorting.surface} className="space-y-2">{sorting.order.map(id => {
    const plan = byId.get(id); if (!plan) return null;
    return <div key={id} data-reorder-id={id} data-reordering={sorting.active === id ? 'true' : undefined} className={'widget-reorder-row flex min-w-0 items-center gap-1 rounded-2xl ' + (sorting.active === id ? 'bg-neutral-100' : '')}>
      <button type="button" className="min-w-0 flex-1 rounded-2xl border border-border-subtle bg-neutral-50 p-3 text-left hover:bg-neutral-100" aria-label={'編輯學習計畫：' + plan.name} onClick={() => onEdit(plan)}><PlanContent plan={plan} /></button>
      <button type="button" aria-label={'拖曳排序計畫：' + plan.name} aria-pressed={sorting.active === id} title="拖曳排序；也可用上下鍵、Home／End 調整" className="flex h-11 w-8 shrink-0 touch-none select-none items-center justify-center rounded-xl text-text-muted cursor-grab active:cursor-grabbing" {...sorting.handle(id)}><GripVertical size={16} /></button>
    </div>;
  })}</div>;
}
export function ProgressPlansWidget({ state, management = false }: { state: ProgressState; management?: boolean }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null), [editing, setEditing] = useState<ProgressPlan | null | undefined>();
  return <section aria-label="學習計畫小組件" className={'flex min-w-0 flex-col rounded-3xl border border-border-subtle bg-surface p-5 ' + (management ? '' : 'h-full min-h-0')}>
    <header className="mb-3 flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><TrendingUp size={18} className="text-text-muted" />學習計畫</h2><ProgressStatus state={state} /></div>{!management && <button className="rounded-xl p-2 hover:bg-neutral-100" aria-label="學習計畫選單" aria-haspopup="dialog" aria-expanded={!!menu} onClick={event => setMenu(menu ? null : event.currentTarget)}><MoreHorizontal size={20} /></button>}</header>
    {management && <p className="mb-3 text-xs text-text-muted">點計畫修改名稱、目標或單位；拖曳把手調整首頁順序。</p>}
    <div className={management ? '' : 'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain'}>
      {management ? <PlanManager state={state} onEdit={setEditing} /> : state.snapshot.plans.map(plan => <div key={plan.id} data-progress-plan={plan.id} className="relative rounded-2xl border border-border-subtle bg-neutral-50 p-3 md:p-3.5"><PlanContent plan={plan} /><ProgressTapZone plan={plan} state={state} delta={-1} /><ProgressTapZone plan={plan} state={state} delta={1} /></div>)}
      {!state.snapshot.plans.length && <p className="py-4 text-sm text-text-muted">尚未建立學習計畫。{!management && <Link to={settingsUrl} className="ml-2 underline">前往設定新增</Link>}</p>}
    </div>
    {management && <button className={button + ' mt-4 flex self-start items-center gap-2'} onClick={() => setEditing(null)}><Plus size={16} />新增計畫</button>}
    {editing !== undefined && management && <PlanEditor state={state} plan={editing} onClose={() => setEditing(undefined)} />}
    {menu && <AnchoredPopover anchor={menu} title="學習計畫選單" onClose={() => setMenu(null)}><div className="space-y-1"><Link className={popoverActionClass} to={settingsUrl} onClick={() => setMenu(null)}>前往設定管理組件</Link><button className={popoverActionClass} onClick={() => { setMenu(null); void state.service.refresh(state.channel, true); }}>重新同步</button></div></AnchoredPopover>}
  </section>;
}
export function ProgressPlansVisibility({ state }: { state: ProgressState }) {
  return <SwitchRow label="顯示學習計畫" checked={state.snapshot.preferences.visible} onChange={visible => safe(() => state.service.preferences(state.channel, { visible }))} />;
}
export function ProgressPlansConflict({ state }: { state: ProgressState }) {
  const conflict = state.snapshot.conflict;
  if (!conflict?.current) return null;
  const describe = (data: Record<string, unknown>) => Object.entries(data).map(([field, value]) => field === 'order' ? '順序：' + (value as string[]).map(id => state.snapshot.plans.find(p => p.id === id)?.name || '已移除計畫').join(' → ') : `${({ name: '名稱', unit: '單位', target_count: '目標', completed_count: '已完成', visible: '顯示' } as Record<string, string>)[field] || field}：${String(value)}`).join('\n');
  const cloud = conflict.current as unknown as Record<string, unknown>, op = conflict.operation;
  return <AppDialog title="學習計畫修改需要確認" onClose={() => { /* Keep unresolved drafts. */ }}>
    <p className="text-sm text-text-muted">相同內容已在其他地方修改。進度加減會分別同步。</p>
    <div className="mt-4 space-y-3 text-sm"><div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">本機修改</p><p className="mt-1 whitespace-pre-wrap break-words">{op.action === 'delete' ? '移除此計畫' : describe(op.patch)}</p></div><div className="rounded-2xl bg-page-bg p-3"><p className="font-medium">雲端版本</p><p className="mt-1 whitespace-pre-wrap break-words">{describe(Object.fromEntries(Object.keys(op.action === 'delete' ? op.base : op.patch).map(k => [k, cloud[k]])))}</p></div></div>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={button} onClick={() => state.service.resolve(state.channel, false)}>採用雲端版本</button><button className={button} onClick={() => state.service.resolve(state.channel, true)}>保留本機修改</button></div>
  </AppDialog>;
}
