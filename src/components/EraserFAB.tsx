import React, { useRef } from 'react';
import { Eraser } from 'lucide-react';
import { useStore } from '../store/useStore';

export const EraserFAB: React.FC = () => {
  const { eraserActive, setEraserActive, sidebarCollapsed } = useStore();
  const pressStartTimeRef = useRef<number>(0);
  const wasActiveBeforeDownRef = useRef<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pressStartTimeRef.current = Date.now();
    wasActiveBeforeDownRef.current = eraserActive;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setEraserActive(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    const duration = Date.now() - pressStartTimeRef.current;
    if (duration >= 250) {
      // Spring-loaded hold release
      setEraserActive(false);
    } else {
      // Quick tap toggle
      if (wasActiveBeforeDownRef.current) {
        setEraserActive(false);
      } else {
        setEraserActive(true);
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const duration = Date.now() - pressStartTimeRef.current;
    if (duration >= 250) {
      setEraserActive(false);
    }
  };

  return (
    <div
      className={`fixed bottom-6 z-40 transition-all duration-300 ${
        sidebarCollapsed ? 'left-6' : 'left-6 lg:left-[308px]'
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
        className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all duration-150 active:scale-95 touch-none select-none ${
          eraserActive
            ? 'bg-[#E11D48] scale-110 ring-4 ring-[#E11D48]/40'
            : 'bg-[#E11D48]/90 hover:bg-[#E11D48] ring-2 ring-white/50 dark:ring-stone-700'
        }`}
        title="按住啟用彈簧橡皮擦（或點擊切換局部擦除）"
      >
        <Eraser className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter mt-0.5">
          {eraserActive ? 'ERASING' : 'ERASER'}
        </span>
      </button>
    </div>
  );
};
