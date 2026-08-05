import React from 'react';
import { Eraser } from 'lucide-react';
import { useStore } from '../store/useStore';

export const EraserFAB: React.FC = () => {
  const { eraserActive, setEraserActive, sidebarCollapsed } = useStore();

  return (
    <div
      className={`fixed bottom-6 z-40 transition-all duration-300 ${
        sidebarCollapsed ? 'left-6' : 'left-6 lg:left-[308px]'
      }`}
    >
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          setEraserActive(true);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          setEraserActive(false);
        }}
        onPointerLeave={() => setEraserActive(false)}
        className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all duration-150 active:scale-95 touch-none select-none ${
          eraserActive
            ? 'bg-[#E11D48] scale-110 ring-4 ring-[#E11D48]/40'
            : 'bg-[#E11D48]/90 hover:bg-[#E11D48] ring-2 ring-white/50 dark:ring-stone-700'
        }`}
        title="按住啟用左手彈簧橡皮擦 (Spring Eraser)"
      >
        <Eraser className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tighter mt-0.5">Eraser</span>
      </button>
    </div>
  );
};
