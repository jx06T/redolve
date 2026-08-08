import React from 'react';
import {
  FileText,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Minus,
  Plus,
} from 'lucide-react';

interface ProblemCardScratchpadControlsProps {
  calcSpaceHeight: number;
  isSavingNotes: boolean;
  onUpdateCalcHeight: (newHeight: number | ((prev: number) => number)) => void;
}

export const ProblemCardScratchpadControls: React.FC<ProblemCardScratchpadControlsProps> = ({
  calcSpaceHeight,
  isSavingNotes,
  onUpdateCalcHeight,
}) => {
  return (
    <div className="mt-2 flex items-center justify-between px-1">
      <div className="flex items-center space-x-1 pt-3">
        <FileText className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-[11px] text-[#9CA3AF]">
          {isSavingNotes ? '正在同步存檔...' : '支援即時打字'}
        </span>
      </div>

      <div className="flex items-center space-x-1.5">
        {calcSpaceHeight > 0 ? (
          <button
            type="button"
            onClick={() => onUpdateCalcHeight(0)}
            className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
            title="完全收合推導區 (0px)"
          >
            <ChevronUp className="w-3 h-3" />
            <span className="hidden sm:inline">收合</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUpdateCalcHeight(140)}
            className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all flex items-center space-x-1 active:scale-95"
            title="展開推導區 (預設 140px)"
          >
            <ChevronDown className="w-3 h-3 text-indigo-500" />
            <span className="hidden sm:inline">展開</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onUpdateCalcHeight(140)}
          disabled={calcSpaceHeight === 140}
          className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
          title="重設草稿高度至預設值 (140px)"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">重設</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateCalcHeight((h) => Math.max(0, h - 80))}
          disabled={calcSpaceHeight <= 0}
          className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
          title="縮小草稿空間 (-80px)"
        >
          <Minus className="w-3 h-3" />
          <span className="hidden sm:inline">縮減</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateCalcHeight((h) => Math.min(3000, h === 0 ? 140 : h + 80))}
          className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 transition-all font-medium flex items-center space-x-1 active:scale-95 shadow-2xs"
          title="擴增草稿空間 (+80px)"
        >
          <Plus className="w-3 h-3 text-indigo-500" />
          <span className="hidden sm:inline">延伸</span>
        </button>
      </div>
    </div>
  );
};
