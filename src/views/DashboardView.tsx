import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, HelpCircle, Loader2, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import { fetchDashboard } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { DashboardData } from '../types';

export const DashboardView: React.FC = () => {
  useSEO({
    title: '進度儀表板',
    description: '查看高中學測・分科錯題複習進度、已訂正比率與最需加強的弱點單元 Top 3。',
  });

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDashboard()
      .then((res) => setData(res))
      .catch((err) => console.error('Dashboard fetch failed:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  const summary = data?.summary || { total: 0, resolved: 0, unsolved: 0, processing: 0 };
  const subjects = data?.subjects || [];
  const topUnsolved = data?.top_unsolved_topics || [];

  const completionRate = summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 relative overflow-hidden">
        <div className="max-w-2xl relative z-10 space-y-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>錯題複習進度 Dashboard</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[#374151] dark:text-[#D1D5DB]">
            保持心流，完成今日訂正
          </h1>
          <p className="text-xs text-[#9CA3AF]">
            目前系統累積收錄 {summary.total} 張錯題，已解決 {summary.resolved} 題 ({completionRate}% 訂正率)。
          </p>
        </div>

        {/* Decorative Wave Gradient */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-[#F4A0A0]/20 via-[#F5C6A0]/15 to-transparent pointer-events-none" />
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#374151] dark:text-[#D1D5DB]">{summary.total}</div>
            <div className="text-xs text-[#9CA3AF]">總錯題張數</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-[#10B981] rounded-2xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#374151] dark:text-[#D1D5DB]">{summary.resolved}</div>
            <div className="text-xs text-[#9CA3AF]">已完成訂正</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 flex items-center space-x-4">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-2xl">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#374151] dark:text-[#D1D5DB]">{summary.unsolved}</div>
            <div className="text-xs text-[#9CA3AF]">待解決題目</div>
          </div>
        </div>
      </div>

      {/* Grid Content: Subjects Progress & Top Review Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Progress Cards */}
        <div className="lg:col-span-2 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#374151] dark:text-[#D1D5DB] flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#6366F1]" />
              <span>各科目錯題訂正率</span>
            </h2>
            <Link
              to="/study/math"
              className="text-xs text-[#6366F1] font-medium flex items-center space-x-1 hover:underline"
            >
              <span>進入刷題</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {subjects.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#9CA3AF]">
              尚無科目統計資料。點擊右上角「上傳錯題」開始使用！
            </div>
          ) : (
            <div className="space-y-4">
              {subjects.map((sub) => {
                const pct = sub.total > 0 ? Math.round((sub.resolved / sub.total) * 100) : 0;
                return (
                  <div key={sub.subject_id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-[#374151] dark:text-[#D1D5DB]">{sub.subject_label}</span>
                      <span className="text-[#9CA3AF]">
                        {sub.resolved} / {sub.total} 題 ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#6366F1] to-[#10B981] rounded-full transition-all duration-300"
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
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#374151] dark:text-[#D1D5DB]">
            最需複習單元 Top 3
          </h2>

          {topUnsolved.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#9CA3AF]">
              太棒了！目前沒有積壓未訂正的單元。
            </div>
          ) : (
            <div className="space-y-3">
              {topUnsolved.map((topic, idx) => {
                const subjectCode = topic.topic_id ? topic.topic_id.split('-')[0] : 'math';
                return (
                  <div
                    key={topic.topic_id}
                    className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]">
                          {topic.topic_label}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          {topic.unsolved_count} 題未訂正
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/study/${subjectCode}/${topic.topic_id}`}
                      aria-label={`前往 ${topic.topic_label} 錯題列表`}
                      className="p-2 rounded-xl bg-stone-100 dark:bg-stone-700 text-[#6366F1] dark:text-indigo-300 hover:bg-stone-200 dark:hover:bg-stone-600 active:scale-95 transition-all"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Link>
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
