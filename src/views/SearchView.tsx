import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { searchProblems } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { ProblemCard } from '../components/ProblemCard';
import { Item } from '../types';

export const SearchView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  useSEO({
    title: query ? `搜尋「${query}」` : '全域錯題搜尋',
    description: query ? `搜尋關鍵字「${query}」的錯題與解析。` : '透過 FTS5 中文全文檢索快速找到錯題。',
  });

  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (query) {
      setLoading(true);
      searchProblems(query)
        .then((res) => setResults(res.items))
        .catch((err) => console.error('Search failed:', err))
        .finally(() => setLoading(false));
    }
  }, [query]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6">
        <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
          <Search className="w-5 h-5 text-[#6366F1]" />
          <h1 className="text-lg font-bold">全域 FTS5 中文搜尋結果</h1>
        </div>
        <p className="text-xs text-[#9CA3AF] mt-1">
          搜尋關鍵字：<span className="font-semibold text-[#6366F1]">"{query}"</span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-12 text-center text-xs text-[#9CA3AF]">
          沒有找到符合 "{query}" 的錯題。請嘗試關鍵字拆解或簡化搜尋詞。
        </div>
      ) : (
        <div className="space-y-6">
          {results.map((item) => (
            <ProblemCard key={item.id} problem={item} />
          ))}
        </div>
      )}
    </div>
  );
};
