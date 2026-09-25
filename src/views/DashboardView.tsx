import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export const DashboardView: React.FC = () => {
  useSEO({
    title: '進度儀表板',
    description: '查看高中學測・分科錯題複習進度、已訂正比率與最需加強的弱點單元 Top 3。',
  });

  const navigate = useNavigate();
  const { taxonomies, setSelectedSubjectId, setSelectedTopicId, setUploadModalOpen, currentUser } = useStore();
  const isGuest = !currentUser;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);

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
        top_unsolved_topics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topicId, count]) => ({
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
  }, [isGuest, currentUser?.id, taxonomies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return <div className="rounded-3xl border border-border-subtle bg-surface p-8 text-sm text-text-muted">進度暫時無法載入，請確認連線後重新整理。</div>;
  }

  const summary = data?.summary || { total: 0, resolved: 0, unsolved: 0, processing: 0, unclassified: 0 };
  const subjects = data?.subjects || [];
  const topUnsolved = data?.top_unsolved_topics || [];

  const completionRate = summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0;
  const unclassifiedCount = summary.unclassified ?? 0;

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedTopicId(null);
    navigate(`/study/${subjectId}`);
  };

  const handleTopicClick = (topicId: string) => {
    const rootSub = getRootSubjectId(topicId, taxonomies);
    setSelectedSubjectId(rootSub);
    setSelectedTopicId(topicId);
    navigate(`/study/${rootSub}/${topicId}`);
  };

  const handleUnclassifiedClick = () => {
    setSelectedSubjectId('all');
    setSelectedTopicId('unclassified');
    navigate('/study/all');
  };

  return (
    <div className="space-y-6">
      <GuestNoticeBanner />

      {summary.total === 0 && (
        <section className="rounded-3xl border border-primary-200/60 bg-primary-50/60 p-5 sm:p-6" aria-label="開始使用 Redolve">
          <h2 className="text-base font-semibold text-text-main">三步開始整理錯題</h2>
          <ol className="mt-3 grid gap-3 text-xs text-text-main sm:grid-cols-3">
            <li><strong className="text-primary">1. 收題</strong><p className="mt-1 text-text-muted">上傳或拍攝考題，訪客也能先存到此瀏覽器。</p></li>
            <li><strong className="text-primary">2. 訂正</strong><p className="mt-1 text-text-muted">在題目上手寫、加筆記，完成後標記已解決。</p></li>
            <li><strong className="text-primary">3. 複習</strong><p className="mt-1 text-text-muted">依科目與單元找回錯題，登入後可跨裝置同步。</p></li>
          </ol>
          <button type="button" onClick={() => setUploadModalOpen(true)} className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">上傳第一張錯題</button>
        </section>
      )}

      {/* Header Banner */}
      <div className="bg-surface border border-border-subtle rounded-3xl p-6 relative overflow-hidden">
        <div className="max-w-2xl relative z-10 space-y-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-primary-50 text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>錯題複習進度 Dashboard</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">
            保持心流，完成今日訂正
          </h1>
          <p className="text-xs text-text-muted">
            目前系統累積收錄 {summary.total} 張錯題，已解決 {summary.resolved} 題 ({completionRate}% 訂正率)。
          </p>
        </div>

        {/* Decorative Wave Gradient */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-linear-to-l from-accent-300/20 via-accent-100/15 to-transparent pointer-events-none" />
      </div>

      {/* Unclassified Alert Banner (if any unclassified problems exist) */}
      {unclassifiedCount > 0 && (
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-3xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-status-warning/20 text-status-warning shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-status-warning">
                發現 {unclassifiedCount} 題尚未指派課綱章節
              </div>
              <div className="text-xs text-status-warning/80">
                將題目指派至具體單元，可讓進度追蹤與弱點分析更為精確。
              </div>
            </div>
          </div>
          <button
            onClick={handleUnclassifiedClick}
            className="px-4 py-2 rounded-xl bg-status-warning text-white text-xs font-semibold hover:bg-status-warning/90 active:scale-95 transition-all shadow-xs flex items-center space-x-1.5 shrink-0"
          >
            <FolderSync className="w-3.5 h-3.5" />
            <span>立即指派章節</span>
          </button>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border-subtle rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-primary-50 text-primary rounded-2xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main">{summary.total}</div>
            <div className="text-xs text-text-muted">總錯題張數</div>
          </div>
        </div>

        <div className="bg-surface border border-border-subtle rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-status-resolved/10 text-status-resolved rounded-2xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main">{summary.resolved}</div>
            <div className="text-xs text-text-muted">已完成訂正</div>
          </div>
        </div>

        <div className="bg-surface border border-border-subtle rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-status-warning/10 text-status-warning rounded-2xl">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main">{summary.unsolved}</div>
            <div className="text-xs text-text-muted">待解決題目</div>
          </div>
        </div>
      </div>

      {/* Grid Content: Subjects Progress & Top Review Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Progress Cards */}
        <div className="lg:col-span-2 bg-surface border border-border-subtle rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-main flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span>各科目錯題訂正率</span>
            </h2>
            <Link
              to="/study/math"
              onClick={() => {
                setSelectedSubjectId('math');
                setSelectedTopicId(null);
              }}
              className="text-xs text-primary font-medium flex items-center space-x-1 hover:underline"
            >
              <span>進入刷題</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {subjects.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              尚無科目統計資料。點擊右上角「上傳錯題」開始使用！
            </div>
          ) : (
            <div className="space-y-3.5">
              {subjects.map((sub) => {
                const pct = sub.total > 0 ? Math.round((sub.resolved / sub.total) * 100) : 0;
                const unsolvedSub = sub.total - sub.resolved;
                return (
                  <div
                    key={sub.subject_id}
                    onClick={() => handleSubjectClick(sub.subject_id)}
                    className="p-3.5 rounded-2xl bg-neutral-50 border border-border-subtle hover:border-primary/40 hover:bg-neutral-100 cursor-pointer transition-all duration-150 space-y-2 group"
                  >
                    <div className="flex justify-between items-center text-xs font-medium">
                      <div className="flex items-center space-x-2">
                        <span className="text-text-main font-semibold group-hover:text-primary transition-colors">
                          {sub.subject_label}
                        </span>
                        {unsolvedSub > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-warning/10 text-status-warning font-semibold">
                            {unsolvedSub} 題待複習
                          </span>
                        )}
                      </div>
                      <span className="text-text-muted text-[11px] font-mono">
                        {sub.resolved} / {sub.total} 題 ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-accent-peach to-accent-sage rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top 3 Weakest Units */}
        <div className="bg-surface border border-border-subtle rounded-3xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-text-main">
            最需複習單元 Top 3
          </h2>

          {topUnsolved.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              太棒了！目前沒有積壓未訂正的單元。
            </div>
          ) : (
            <div className="space-y-3">
              {topUnsolved.map((topic, idx) => {
                return (
                  <div
                    key={topic.topic_id}
                    onClick={() => handleTopicClick(topic.topic_id)}
                    className="p-3.5 rounded-2xl bg-neutral-50 border border-border-subtle flex items-center justify-between hover:border-primary/40 cursor-pointer transition-all duration-150 group"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="w-6 h-6 rounded-full bg-status-warning/10 text-status-warning font-bold text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-text-main group-hover:text-primary transition-colors">
                          {topic.topic_label}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {topic.unsolved_count} 題未訂正
                        </div>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-neutral-100 text-primary group-hover:bg-primary-50 active:scale-95 transition-all">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
