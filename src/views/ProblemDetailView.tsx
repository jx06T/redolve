import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fetchProblemById } from '../services/api';
import { ProblemCard } from '../components/ProblemCard';
import { EraserFAB } from '../components/EraserFAB';
import { Item } from '../types';

export const ProblemDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<Item | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (id) {
      fetchProblemById(id)
        .then((res) => setProblem(res))
        .catch((err) => console.error('Failed to fetch problem:', err))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-xs text-[#9CA3AF]">找不到此題目或已經刪除。</p>
        <Link to="/study/all" className="inline-flex items-center space-x-2 text-xs text-[#6366F1] font-medium">
          <ArrowLeft className="w-4 h-4" />
          <span>返回刷題頁面</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link
        to="/study/all"
        className="inline-flex items-center space-x-2 text-xs text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>返回列表</span>
      </Link>

      <ProblemCard problem={problem} />
      <EraserFAB />
    </div>
  );
};
