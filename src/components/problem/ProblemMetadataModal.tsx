import React from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { Item, TaxonomyNode } from '../../types';

interface ProblemMetadataModalProps {
  isOpen: boolean;
  problem: Item | null;
  editTopicId: string;
  editKeywordsStr: string;
  isAnalyzing: boolean;
  activeTaxonomies: TaxonomyNode[];
  onClose: () => void;
  onTopicIdChange: (topicId: string) => void;
  onKeywordsStrChange: (keywords: string) => void;
  onRunAiAnalysis: () => void;
  onSave: () => void;
}

export const ProblemMetadataModal: React.FC<ProblemMetadataModalProps> = ({
  isOpen,
  problem,
  editTopicId,
  editKeywordsStr,
  isAnalyzing,
  activeTaxonomies,
  onClose,
  onTopicIdChange,
  onKeywordsStrChange,
  onRunAiAnalysis,
  onSave,
}) => {
  if (!isOpen || !problem) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
            手動修正課綱單元與關鍵字
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[#9CA3AF] mb-1 font-medium">選擇學測/分科課綱單元</label>
            <select
              value={editTopicId}
              onChange={(e) => onTopicIdChange(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
            >
              <option value="">未指定單元</option>
              {activeTaxonomies.map((subject) => (
                <optgroup key={subject.id} label={subject.label}>
                  {subject.children?.map((unit) => (
                    <React.Fragment key={unit.id}>
                      <option value={unit.id}>{unit.label}</option>
                      {unit.children?.map((point) => (
                        <option key={point.id} value={point.id}>
                          {`\u00a0\u00a0${point.label}`}
                        </option>
                      ))}
                    </React.Fragment>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[#9CA3AF] mb-1 font-medium">自訂關鍵字 (以逗號分隔)</label>
            <input
              type="text"
              value={editKeywordsStr}
              onChange={(e) => onKeywordsStrChange(e.target.value)}
              placeholder="例如: 貝氏定理, 條件機率"
              className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onRunAiAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI 辨識中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI 自動重新分析</span>
              </>
            )}
          </button>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-2 rounded-xl text-xs bg-[#6366F1] text-white font-medium hover:bg-[#4F46E5]"
            >
              儲存變更
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
