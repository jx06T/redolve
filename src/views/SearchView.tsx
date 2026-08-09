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
  const { taxonomies, setActiveProblemId, setSelectedSubjectId, setSelectedTopicId } = useStore();

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
    setSelectedSubjectId(targetSubject);
    setSelectedTopicId(item.topic_id || null);
    navigate(`/study/${targetSubject}#problem-${item.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search Header Bar */}
      <div className="bg-surface border border-border-subtle rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center space-x-3 text-text-main">
            <div className="p-2.5 bg-primary-50 text-primary rounded-2xl">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">全域 FTS5 中文檢索</h1>
              <p className="text-xs text-text-muted mt-0.5">
                關鍵字：<span className="font-semibold text-primary">"{query}"</span> · 共找到 {results.length} 題
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-neutral-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${viewMode === 'compact'
              ? 'bg-surface text-text-main shadow-2xs font-semibold'
              : 'text-text-muted hover:text-text-main'
              }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>精簡預覽</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${viewMode === 'full'
              ? 'bg-surface text-text-main shadow-2xs font-semibold'
              : 'text-text-muted hover:text-text-main'
              }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>完整題目</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : results.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-3xl p-12 text-center text-xs text-text-muted shadow-xs">
          沒有找到符合 "{query}" 的錯題。請嘗試關鍵字拆解或簡化搜尋詞。
        </div>
      ) : viewMode === 'compact' ? (
        /* Compact Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((item) => {
            const problemCode = formatProblemCode(item, taxonomies);
            const keywordsArray = item.keywords
              ? typeof item.keywords === 'string'
                ? item.keywords.slice(1, -1).split(',').map((s) => s.trim().slice(1, -1)).filter(Boolean)
                : item.keywords
              : [];

            return (
              <div
                key={item.id}
                className="bg-surface border border-border-subtle rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-primary/60 transition-all shadow-xs"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-primary-50 text-primary border border-primary-200/50">
                        {problemCode}
                      </span>
                      <StatusBadge
                        status={item.status}
                        topicId={item.topic_id}
                      />
                    </div>
                    {item.status === 'resolved' && (
                      <span className="text-[11px] font-medium text-status-resolved flex items-center space-x-1 bg-status-resolved/10 border border-status-resolved/20 px-2 py-0.5 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>已完成</span>
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Image */}
                  <div className="w-full h-44 rounded-2xl overflow-hidden bg-neutral-50 border border-border-subtle relative group cursor-pointer"
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
                    <div className="p-2.5 rounded-xl bg-neutral-50 border border-border-subtle text-[11px] text-text-main flex items-start space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="line-clamp-2 leading-relaxed">{item.typed_notes}</p>
                    </div>
                  )}

                  {/* Keywords */}
                  {keywordsArray.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {keywordsArray.slice(0, 4).map((kw, kIdx) => (
                        <span
                          key={kIdx}
                          className="px-2 py-0.5 text-[10px] rounded-lg bg-neutral-100 text-text-muted"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Navigation Button */}
                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">
                    複習次數: {item.review_count} 次
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNavigateToProblem(item)}
                    className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-2xs"
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
