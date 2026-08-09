import React from 'react';
import {
  FileText,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Minus,
  Plus,
} from 'lucide-react';
import { DEFAULT_CALC_SPACE_HEIGHT, CALC_SPACE_STEP } from '../../config/constants';

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
        <FileText className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] text-text-muted">
          {isSavingNotes ? '正在同步存檔...' : '支援即時打字'}
        </span>
      </div>

      <div className="flex items-center space-x-1.5">
        {calcSpaceHeight > 0 ? (
          <button
            type="button"
            onClick={() => onUpdateCalcHeight(0)}
            className="px-2 py-1 text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 text-text-main transition-all flex items-center space-x-1 active:scale-95"
            title="完全收合推導區 (0px)"
          >
            <ChevronUp className="w-3 h-3" />
            <span className="hidden sm:inline">收合</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUpdateCalcHeight(DEFAULT_CALC_SPACE_HEIGHT)}
            className="px-2 py-1 text-xs rounded-lg bg-primary-50 border border-primary-200/50 text-primary hover:bg-primary-100 transition-all flex items-center space-x-1 active:scale-95"
            title={`展開推導區 (預設 ${DEFAULT_CALC_SPACE_HEIGHT}px)`}
          >
            <ChevronDown className="w-3 h-3 text-primary" />
            <span className="hidden sm:inline">展開</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onUpdateCalcHeight(DEFAULT_CALC_SPACE_HEIGHT)}
          disabled={calcSpaceHeight === DEFAULT_CALC_SPACE_HEIGHT}
          className="px-2 py-1 text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-text-main transition-all flex items-center space-x-1 active:scale-95"
          title={`重設草稿高度至預設值 (${DEFAULT_CALC_SPACE_HEIGHT}px)`}
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">重設</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateCalcHeight((h) => Math.max(0, h - CALC_SPACE_STEP))}
          disabled={calcSpaceHeight <= 0}
          className="px-2 py-1 text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-text-main transition-all flex items-center space-x-1 active:scale-95"
          title={`縮小草稿空間 (-${CALC_SPACE_STEP}px)`}
        >
          <Minus className="w-3 h-3" />
          <span className="hidden sm:inline">縮減</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateCalcHeight((h) => Math.min(3000, h === 0 ? DEFAULT_CALC_SPACE_HEIGHT : h + CALC_SPACE_STEP))}
          className="px-2.5 py-1 text-xs rounded-lg bg-primary-50 border border-primary-200/50 hover:bg-primary-100 text-primary transition-all font-medium flex items-center space-x-1 active:scale-95 shadow-2xs"
          title={`擴增草稿空間 (+${CALC_SPACE_STEP}px)`}
        >
          <Plus className="w-3 h-3 text-primary" />
          <span className="hidden sm:inline">延伸</span>
        </button>
      </div>
    </div>
  );
};
