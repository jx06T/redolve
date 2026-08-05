import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Loader2, LayoutGrid, List, ArrowUpRight, CheckCircle2, FileText } from 'lucide-react';
import { searchProblems, getProblemImageUrl } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { ProblemCard } from '../components/ProblemCard';
import { StatusBadge, formatProblemCode, getRootSubjectId } from '../components/StatusBadge';
import { useStore } from '../store/useStore';
import { Item } from '../types';

export const SearchView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const { taxonomies, setActiveProblemId } = useStore();

  useSEO({
    title: query ? `搜尋「${query}」` : '全域錯題搜尋',
    description: query ? `搜尋關鍵字「${query}」的錯題與解析。` : '透過 FTS5 中文全文檢索快速找到錯題。',
  });

  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('compact');

  useEffect(() => {
    if (query) {
      setLoading(true);
      searchProblems(query)
        .then((res) => setResults(res.items))
        .catch((err) => console.error('Search failed:', err))
        .finally(() => setLoading(false));
    }
  }, [query]);

  const handleNavigateToProblem = (item: Item) => {
    setActiveProblemId(item.id);
    const targetSubject = getRootSubjectId(item.topic_id, taxonomies);
    navigate(`/study/${targetSubject}#problem-${item.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search Header Bar */}
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
            <div className="p-2.5 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">全域 FTS5 中文檢索</h1>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                關鍵字：<span className="font-semibold text-[#6366F1]">"{query}"</span> · 共找到 {results.length} 題
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              viewMode === 'compact'
                ? 'bg-white dark:bg-[#202023] text-[#374151] dark:text-[#E5E7EB] shadow-2xs font-semibold'
                : 'text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>精簡預覽</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              viewMode === 'full'
                ? 'bg-white dark:bg-[#202023] text-[#374151] dark:text-[#E5E7EB] shadow-2xs font-semibold'
                : 'text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>完整題目</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-12 text-center text-xs text-[#9CA3AF] shadow-xs">
          沒有找到符合 "{query}" 的錯題。請嘗試關鍵字拆解或簡化搜尋詞。
        </div>
      ) : viewMode === 'compact' ? (
        /* Compact Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((item) => {
            const problemCode = formatProblemCode(item, taxonomies);
            const keywordsArray = item.keywords
              ? typeof item.keywords === 'string'
                ? item.keywords.split(',').map((s) => s.trim()).filter(Boolean)
                : item.keywords
              : [];

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all shadow-xs"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
                        {problemCode}
                      </span>
                      <StatusBadge
                        status={item.status}
                        topicId={item.topic_id}
                      />
                    </div>
                    {item.status === 'resolved' && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>已完成</span>
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Image */}
                  <div className="w-full h-44 rounded-2xl overflow-hidden bg-stone-50 dark:bg-[#161618] border border-stone-200/60 dark:border-stone-800 relative group cursor-pointer"
                    onClick={() => handleNavigateToProblem(item)}
                  >
                    <img
                      src={getProblemImageUrl(item.id)}
                      alt="題目預覽"
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200 select-none"
                    />
                  </div>

                  {/* Typed Notes Snippet */}
                  {item.typed_notes && (
                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/50 dark:border-stone-700/50 text-[11px] text-[#4B5563] dark:text-[#D1D5DB] flex items-start space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <p className="line-clamp-2 leading-relaxed">{item.typed_notes}</p>
                    </div>
                  )}

                  {/* Keywords */}
                  {keywordsArray.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {keywordsArray.slice(0, 4).map((kw, kIdx) => (
                        <span
                          key={kIdx}
                          className="px-2 py-0.5 text-[10px] rounded-lg bg-stone-100 dark:bg-stone-800 text-[#6B7280] dark:text-[#9CA3AF]"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Navigation Button */}
                <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF]">
                    複習次數: {item.review_count} 次
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNavigateToProblem(item)}
                    className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-95 transition-all shadow-2xs"
                  >
                    <span>前往此題目</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Full Interactive Mode */
        <div className="space-y-6">
          {results.map((item, idx) => (
            <ProblemCard key={item.id} problem={item} problemIndex={idx} />
          ))}
        </div>
      )}
    </div>
  );
};
