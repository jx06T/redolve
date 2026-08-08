import React from 'react';
import { Eraser } from 'lucide-react';
import { useStore } from '../store/useStore';

export const EraserFAB: React.FC = () => {
  const { eraserActive, setEraserActive, sidebarCollapsed } = useStore();

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }

    // 【修改】：按下時，立刻切換為橡皮擦
    setEraserActive(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { }

    // 【修改】：鬆開時，立刻取消橡皮擦（無論按了多久）
    setEraserActive(false);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { }

    // 【修改】：如果手勢意外中斷（例如滑出畫面外或被系統攔截），也取消橡皮擦
    setEraserActive(false);
  };

  return (
    <div
      className={`fixed bottom-6 z-40 transition-all duration-300 ${sidebarCollapsed ? 'left-6' : 'left-6 lg:left-[308px]'
        }`}
    >
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all duration-150 active:scale-95 touch-none select-none ${eraserActive
          ? 'bg-rose-500 scale-110 ring-4 ring-rose-500/40'
          : 'bg-rose-500/90 hover:bg-rose-500 ring-2 ring-white/50 dark:ring-neutral-700'
          }`}
        title="按住啟用橡皮擦，鬆開恢復"
      >
        <Eraser className="w-4 h-4" />
        <span className="text-[8px] font-bold uppercase tracking-tighter mt-0.5">
          {eraserActive ? 'ERASING' : 'ERASER'}
        </span>
      </button>
    </div>
  );
};