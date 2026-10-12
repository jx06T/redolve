import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  TrendingUp,
  AlertCircle,
  FolderSync,
} from 'lucide-react';
import { fetchDashboard } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { DashboardData, TaxonomyNode } from '../types';
import { useStore } from '../store/useStore';
import { getRootSubjectId } from '../components/StatusBadge';
import { GuestNoticeBanner } from '../components/GuestNoticeBanner';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { isGuestUser } from '../utils/guest';
import { SharingActivity } from '../components/SharingActivity';
import { resolveDashboardStudyUrl } from '../services/dashboardStudyService';
import { studyResumeUrl } from '../services/navigationState';
import { TodoWidget, CountdownWidget, WidgetConflict } from '../components/HomeWidgets';
import { PublicExploreActivity } from '../components/PublicExploreActivity';
import { DashboardPager } from '../components/DashboardPager';
import { useHomeWidgets } from '../hooks/useHomeWidgets';

export const DashboardView: React.FC = () => {
  useSEO({
    title: '進度儀表板',
    description: '查看高中學測・分科錯題複習進度、已訂正比率與最需加強的弱點單元 Top 5。',
  });

  const navigate = useNavigate();
  const { taxonomies, setUploadModalOpen, currentUser, showToast } = useStore();
  const isGuest = isGuestUser(currentUser);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [opening,setOpening]=useState(false);
  const widgets=useHomeWidgets();const [revision,setRevision]=useState(0);
  const entryRequest=useRef<AbortController>();
  useEffect(()=>()=>entryRequest.current?.abort(),[currentUser?.id]);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(true);
    setLoadError(false);
    const loadDashboard = async () => {
      if (!isGuest) return fetchDashboard();
      const offlineItems = await OfflineSyncManager.getOfflineProblemsAsItems();
      const subjects = new Map<string, DashboardData['subjects'][number]>();
      const topicCounts = new Map<string, number>();
      const topicLabels = new Map<string, string>();
      const collectLabels = (nodes: TaxonomyNode[]) => {
        for (const node of nodes) {
          topicLabels.set(node.id, node.label);
          if (node.children) collectLabels(node.children);
        }
      };
      collectLabels(taxonomies);
      for (const item of offlineItems) {
        if (!item.topic_id) continue;
        const root = getRootSubjectId(item.topic_id, taxonomies);
        const label = topicLabels.get(root) || root;
        const subject = subjects.get(root) || { subject_id: root, subject_label: label, total: 0, resolved: 0 };
        subject.total += 1;
        if (item.status === 'resolved' || item.status === 'archived') subject.resolved += 1;
        subjects.set(root, subject);
        if (item.status === 'unsolved') topicCounts.set(item.topic_id, (topicCounts.get(item.topic_id) || 0) + 1);
      }
      return {
        summary: {
          total: offlineItems.length,
          resolved: offlineItems.filter((item) => item.status === 'resolved' || item.status === 'archived').length,
          unsolved: offlineItems.filter((item) => item.status === 'unsolved').length,
          processing: offlineItems.filter((item) => item.status === 'processing').length,
          unclassified: offlineItems.filter((item) => !item.topic_id).length,
        },
        subjects: [...subjects.values()],
        top_unsolved_topics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([topicId, count]) => ({
          topic_id: topicId,
          topic_label: topicLabels.get(topicId) || topicId,
          unsolved_count: count,
        })),
      } satisfies DashboardData;
    };
    loadDashboard()
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) { setLoadError(true); console.error('Dashboard fetch failed:', err); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isGuest, currentUser?.id, taxonomies,revision]);

  const summary = data?.summary || { total: 0, resolved: 0, unsolved: 0, processing: 0, unclassified: 0 };
  const subjects = data?.subjects || [];
  const topUnsolved = data?.top_unsolved_topics || [];

  const completionRate = summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0;
  const unclassifiedCount = summary.unclassified ?? 0;

  const openStudy = async (scope:Parameters<typeof resolveDashboardStudyUrl>[0]) => {
    entryRequest.current?.abort();const abort=new AbortController();entryRequest.current=abort;setOpening(true);
    try {
      const url=await resolveDashboardStudyUrl(scope,{guest:isGuest,tree:taxonomies,signal:abort.signal});
      if(!abort.signal.aborted&&useStore.getState().currentUser?.id===currentUser?.id)navigate(url);
    } catch(error) {
      if(!abort.signal.aborted)showToast(error instanceof Error?error.message:'無法進入刷題，請稍後重試','error');
    } finally { if(entryRequest.current===abort)setOpening(false); }
  };


  const summaryCards=[{Icon:BookOpen,value:summary.total,label:'總錯題張數',tone:'bg-primary-50 text-primary',wash:'from-primary/10 via-primary/4 to-transparent'},
    {Icon:CheckCircle2,value:summary.resolved,label:'已完成訂正',tone:'bg-status-resolved/10 text-status-resolved',wash:'from-status-resolved/10 via-status-resolved/4 to-transparent'},
    {Icon:HelpCircle,value:summary.unsolved,label:'待解決題目',tone:'bg-status-warning/10 text-status-warning',wash:'from-status-warning/10 via-status-warning/4 to-transparent'}];
  const metrics=<div className="space-y-2 md:space-y-3">
    <div data-dashboard-stats className="grid grid-cols-3 gap-2 md:gap-4">{summaryCards.map(({Icon,value,label,tone,wash})=><div key={label} className={'flex items-center gap-3 rounded-3xl border border-border-subtle bg-surface bg-linear-to-l p-3 py-2 md:p-5 '+wash}>
      <div className={'hidden shrink-0 rounded-2xl p-3 md:block '+tone}><Icon size={24}/></div>
      <div className="min-w-0"><div className="text-xl font-bold tabular-nums md:text-2xl">{loading||loadError?'—':value}</div><div className="mt-0.5 whitespace-nowrap text-[10px] text-text-muted md:text-xs">{label}</div></div>
    </div>)}</div>
    {loadError&&<p role="alert" className="rounded-2xl border border-border-subtle bg-surface px-3 py-2 text-xs text-text-muted">進度暫時無法載入；小組件仍可使用。<button className="ml-2 underline" onClick={()=>setRevision(v=>v+1)}>重新讀取進度</button></p>}
    {unclassifiedCount>0&&<div className="flex items-center justify-between gap-3 rounded-2xl border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs">
      <p className="flex min-w-0 items-center gap-2 text-status-warning"><AlertCircle size={16} className="shrink-0"/>發現 {unclassifiedCount} 題尚未指派課綱章節</p>
      <button disabled={opening} onClick={()=>void openStudy({topicId:'unclassified',status:'all'})} className="flex shrink-0 items-center gap-1 rounded-xl bg-status-warning/10 px-2 py-2 text-status-warning disabled:opacity-40"><FolderSync size={14}/>立即指派章節</button>
    </div>}
    {(isGuest||!loading&&!loadError&&summary.total===0)&&<details className="rounded-2xl border border-border-subtle bg-surface text-xs">
      <summary className="cursor-pointer px-3 py-2 text-text-muted">{isGuest?'訪客模式與使用說明':'開始整理第一題'}</summary>
      <div className="max-h-40 space-y-3 overflow-y-auto overscroll-y-contain px-3 pb-3"><GuestNoticeBanner/>
        {summary.total===0&&<section aria-label="開始使用 Redolve"><h2 className="font-semibold">三步開始整理錯題</h2><p className="mt-2 leading-relaxed text-text-muted">上傳題圖、手寫或輸入訂正，再按科目與單元複習。</p><button className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-primary" onClick={()=>setUploadModalOpen(true)}>上傳第一張錯題</button></section>}
      </div>
    </details>}
  </div>;
  const subjectCard=<section aria-label="各科目錯題訂正率" className="flex h-full min-h-0 flex-col gap-3 rounded-3xl border border-border-subtle bg-surface p-4 md:p-5">
    <div className="flex shrink-0 items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><TrendingUp size={16} className="text-primary"/>各科目錯題訂正率</h2>
      <button disabled={opening||loading||loadError} onClick={()=>void openStudy({})} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary disabled:opacity-40"><span>{opening?'準備題目…':'進入刷題'}</span><ArrowRight size={12}/></button></div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain">
      {!subjects.length&&<p className="py-6 text-center text-xs text-text-muted">{loading?'正在讀取科目進度…':loadError?'請重新讀取進度。':'尚無科目統計資料。點擊右上角「上傳錯題」開始使用！'}</p>}
      {subjects.map(sub=>{const pct=sub.total>0?Math.round(sub.resolved/sub.total*100):0,unsolvedSub=sub.total-sub.resolved;return <button type="button" key={sub.subject_id} disabled={opening} onClick={()=>void openStudy({subjectId:sub.subject_id})}
        className="group w-full space-y-2 rounded-2xl border border-border-subtle bg-neutral-50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-neutral-100 md:p-3.5">
        <div className="flex items-center justify-between gap-2 text-xs font-medium"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-semibold group-hover:text-primary">{sub.subject_label}</span>{unsolvedSub>0&&<span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-semibold text-status-warning">{unsolvedSub} 題待複習</span>}</div>
          <span className="shrink-0 font-mono text-[11px] text-text-muted">{sub.resolved} / {sub.total} 題 ({pct}%)</span></div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full bg-linear-to-r from-accent-peach to-accent-sage transition-all duration-300" style={{width:pct+'%'}}/></div>
      </button>;})}
    </div>
  </section>;
  const topicCard=<section aria-label="最需複習單元 Top 5" className="flex h-full min-h-0 flex-col gap-3 rounded-3xl border border-border-subtle bg-surface p-4 md:p-5">
    <h2 className="shrink-0 text-base font-semibold">最需複習單元 Top 5</h2>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain">
      {!topUnsolved.length&&<p className="py-6 text-center text-xs text-text-muted">{loading?'正在讀取複習重點…':loadError?'請重新讀取進度。':'太棒了！目前沒有積壓未訂正的單元。'}</p>}
      {topUnsolved.slice(0,5).map((topic,index)=><button type="button" key={topic.topic_id} disabled={opening} onClick={()=>void openStudy({topicId:topic.topic_id})}
        className="group flex w-full items-center justify-between gap-2 rounded-2xl border border-border-subtle bg-neutral-50 p-2.5 text-left transition-colors hover:border-primary/40 md:p-3">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-warning/10 text-xs font-bold text-status-warning">#{index+1}</span><div className="min-w-0"><p className="text-xs font-semibold group-hover:text-primary">{topic.topic_label}</p><p className="text-[10px] text-text-muted">{topic.unsolved_count} 題未訂正</p></div></div><ArrowRight size={14} className="shrink-0 text-primary"/>
      </button>)}
    </div>
  </section>;
  const resume=studyResumeUrl(widgets.channel.account);
  const hero=<header data-dashboard-hero className="relative shrink-0 overflow-hidden rounded-3xl border border-border-subtle bg-surface p-4 md:p-5">
      <div className="relative z-10 flex items-center justify-between gap-3"><div className="min-w-0 flex-1 space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary-50 px-2.5 py-1 text-[10px] font-semibold text-primary md:text-xs"><Sparkles size={13}/>Overview</span>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">保持心流，完成今日訂正</h1>
        <p className="text-xs text-text-muted">{loading?<span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin"/>正在讀取進度…</span>:loadError?'進度暫時無法載入。':<>目前系統累積收錄 {summary.total} 張錯題，已解決 {summary.resolved} 題 ({completionRate}% 訂正率)。</>}</p>
      </div>{resume&&<button type="button" aria-label="接續上次刷題" title="接續上次刷題" onClick={()=>navigate(resume)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-primary-50 text-primary transition-colors hover:bg-primary/10"><ArrowRight size={20} aria-hidden="true"/></button>}</div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-accent-300/20 via-accent-100/15 to-transparent"/>
    </header>;
  return <div data-dashboard className="flex h-full min-h-0 flex-col gap-3">
    <DashboardPager account={widgets.channel.account} showTodo={widgets.snapshot.preferences.todos_visible} hero={hero} metrics={metrics} subjects={subjectCard} topics={topicCard}
      todos={<TodoWidget key={widgets.channel.account+':todo'} state={widgets} fit/>}
      tools={<div className="flex h-full min-h-0 flex-col gap-3"><div data-home-widgets-secondary className={'grid min-h-0 flex-1 gap-3 '+(widgets.snapshot.preferences.countdowns_visible?'grid-rows-[minmax(0,2fr)_minmax(0,1fr)]':'grid-rows-1')}>
        {widgets.snapshot.preferences.countdowns_visible&&<CountdownWidget key={widgets.channel.account+':countdown'} state={widgets}/>}<PublicExploreActivity compact/>
      </div><SharingActivity compact/></div>}/>
    <WidgetConflict state={widgets}/>
  </div>;
};
