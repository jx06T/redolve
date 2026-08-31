import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fetchProblemById } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { ProblemCard } from '../components/ProblemCard';
import { ProblemMetadataModal } from '../components/problem/ProblemMetadataModal';
import { useProblemActions, isOfflineProblemId } from '../hooks/useProblemActions';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { useStore } from '../store/useStore';
import { getRootSubjectId } from '../components/StatusBadge';
import { Item } from '../types';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export const ProblemDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { problems, taxonomies, showToast } = useStore();
  const { saveMetadata, analyzeItem } = useProblemActions();

  useSEO({
    title: id ? `錯題詳情 #${id.slice(0, 8)}` : '錯題詳情',
    description: '查看錯題詳細手寫筆記、AI 解析與知識點標籤。',
    ogType: 'article',
  });

  const [problem, setProblem] = useState<Item | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Metadata Edit Modal State
  const [editingProblem, setEditingProblem] = useState<Item | null>(null);
  const [editTopicId, setEditTopicId] = useState<string>('');
  const [editKeywordsStr, setEditKeywordsStr] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const activeTaxonomies = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    // Check store first
    const existingInStore = problems.find((p) => p.id === id);
    if (existingInStore) {
      setProblem(existingInStore);
      setLoading(false);
    }

    if (isOfflineProblemId(id)) {
      // Offline problem
      OfflineSyncManager.getOfflineProblemsAsItems()
        .then((items) => {
          const matched = items.find((p) => p.id === id);
          if (matched) {
            setProblem(matched);
          }
        })
        .catch((err) => console.error('Failed to load offline problem:', err))
        .finally(() => setLoading(false));
    } else {
      // Cloud problem
      fetchProblemById(id)
        .then((res) => {
          setProblem(res);
        })
        .catch((err) => console.error('Failed to fetch problem:', err))
        .finally(() => setLoading(false));
    }
  }, [id]);

  // Synchronize with store updates (e.g. status toggled, notes saved)
  const storeItem = problems.find((p) => p.id === id);
  const activeProblem = storeItem || problem;

  const handleOpenEditModal = (target: Item) => {
    setEditingProblem(target);
    setEditTopicId(target.topic_id || '');
    let kw: string[] = [];
    try {
      kw = typeof target.keywords === 'string' ? JSON.parse(target.keywords) : target.keywords || [];
    } catch {
      kw = [];
    }
    setEditKeywordsStr(kw.join(', '));
  };

  const handleSaveMetadata = async () => {
    if (!editingProblem) return;
    const keywordsArray = editKeywordsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await saveMetadata(editingProblem, {
        topic_id: editTopicId || null,
        keywords: keywordsArray,
      });
      setProblem((prev) =>
        prev ? { ...prev, topic_id: editTopicId || null, keywords: JSON.stringify(keywordsArray) } : null
      );
      setEditingProblem(null);
    } catch (err) {
      console.error('Failed to save metadata:', err);
      showToast('儲存失敗，請稍後重試', 'error');
    }
  };

  const handleRunAiAnalysis = async () => {
    if (!editingProblem) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeItem(editingProblem);
      if (res && res.tagResult) {
        setEditTopicId(res.tagResult.topic_id ?? '');
        const kwList = Array.isArray(res.tagResult.keywords) ? res.tagResult.keywords : [];
        setEditKeywordsStr(kwList.join(', '));

        await saveMetadata(editingProblem, {
          topic_id: res.tagResult.topic_id,
          keywords: kwList,
        });
        setProblem((prev) =>
          prev
            ? {
                ...prev,
                topic_id: res.tagResult.topic_id,
                keywords: JSON.stringify(kwList),
              }
            : null
        );
        showToast('AI 課綱辨識完成！已自動套用標籤');
      }
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      showToast(err.message || 'AI 辨識失敗，請確認 API 金鑰', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!activeProblem) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-xs text-text-muted">找不到此題目或已經刪除。</p>
        <Link to="/study/math" className="inline-flex items-center space-x-2 text-xs text-primary font-medium hover:underline">
          <ArrowLeft className="w-4 h-4" />
          <span>返回刷題頁面</span>
        </Link>
      </div>
    );
  }

  const subjectCode = getRootSubjectId(activeProblem.topic_id, activeTaxonomies);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to={`/study/${subjectCode}#problem-${activeProblem.id}`}
          className="inline-flex items-center space-x-2 text-xs text-text-muted hover:text-text-main transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回錯題列表</span>
        </Link>
        <h1 className="text-xs font-semibold text-text-muted">錯題詳情 #{activeProblem.id.slice(0, 8)}</h1>
      </div>

      <ProblemCard
        problem={activeProblem}
        onEditMetadata={handleOpenEditModal}
      />

      <ProblemMetadataModal
        isOpen={Boolean(editingProblem)}
        problem={editingProblem}
        editTopicId={editTopicId}
        editKeywordsStr={editKeywordsStr}
        isAnalyzing={isAnalyzing}
        activeTaxonomies={activeTaxonomies}
        onClose={() => setEditingProblem(null)}
        onTopicIdChange={setEditTopicId}
        onKeywordsStrChange={setEditKeywordsStr}
        onRunAiAnalysis={handleRunAiAnalysis}
        onSave={handleSaveMetadata}
      />
    </div>
  );
};
