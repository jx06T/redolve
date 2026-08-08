import React from 'react';
import { ZoomIn, PenLine } from 'lucide-react';
import { DrawData } from '../../types';
import { DrawCanvas } from '../DrawCanvas';

interface ProblemCardWorkspaceProps {
  imageUrl: string;
  drawData?: DrawData | string | null;
  calcSpaceHeight: number;
  renderedCalcSpaceHeight: number;
  workspaceRef?: React.Ref<HTMLDivElement>;
  tool: 'pen' | 'highlighter' | 'eraser';
  penColor: string;
  penWidth: number;
  eraserActive: boolean;
  readOnly?: boolean;
  inkVisible: boolean;
  onSaveDraw: (drawData: DrawData, explicitHeight?: number) => void;
  onOpenLightbox: () => void;
}

export const ProblemCardWorkspace: React.FC<ProblemCardWorkspaceProps> = ({
  imageUrl,
  drawData,
  calcSpaceHeight,
  renderedCalcSpaceHeight,
  workspaceRef,
  tool,
  penColor,
  penWidth,
  eraserActive,
  readOnly = false,
  inkVisible,
  onSaveDraw,
  onOpenLightbox,
}) => {
  return (
    <div
      ref={workspaceRef}
      className="mt-3 relative rounded-2xl overflow-hidden bg-neutral-50 dark:bg-neutral-900/60 border border-border-subtle flex flex-col"
    >
      {/* Main Question Image */}
      <div className="w-full relative select-none">
        <img
          src={imageUrl}
          alt="題目"
          className="exam-paper-image w-full h-auto object-contain block select-none pointer-events-none"
        />
        <button
          type="button"
          onClick={onOpenLightbox}
          className="absolute top-3 right-3 z-20 p-2 rounded-xl bg-surface/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm border border-border-subtle text-text-main hover:scale-110 active:scale-95 transition-all"
          title="放大檢視原題"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Extended Calculation Workspace Area */}
      <div
        style={{ height: `${renderedCalcSpaceHeight}px` }}
        className={`w-full relative border-border-subtle bg-neutral-50/50 dark:bg-neutral-900/40 transition-[height] duration-200 ease-out select-none overflow-hidden ${
          renderedCalcSpaceHeight > 0 ? 'border-t border-dashed' : ''
        }`}
      >
        {renderedCalcSpaceHeight > 0 && (
          <>
            <div className="absolute inset-0 opacity-35 dark:opacity-20 pointer-events-none bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px]" />
            <div className="absolute top-2 left-3 z-10 flex items-center space-x-1.5 text-[11px] text-text-muted select-none pointer-events-none bg-surface/80 dark:bg-neutral-900/80 px-2 py-0.5 rounded-md backdrop-blur-2xs border border-border-subtle">
              <PenLine className="w-3 h-3 text-primary" />
              <span>延伸推導草稿區</span>
            </div>
          </>
        )}
      </div>

      {/* Full Interactive Canvas Overlay */}
      <div className="absolute inset-0 pointer-events-auto">
        <DrawCanvas
          initialDrawData={drawData}
          onSaveDrawData={onSaveDraw}
          calcSpaceHeight={calcSpaceHeight}
          activeTool={tool}
          activeColor={penColor}
          activeWidth={penWidth}
          isEraserActive={eraserActive}
          readOnly={readOnly || !inkVisible}
        />
      </div>
    </div>
  );
};
