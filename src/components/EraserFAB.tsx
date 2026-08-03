import React from 'react';
import { Eraser } from 'lucide-react';
import { useStore } from '../store/useStore';

export const EraserFAB: React.FC = () => {
  const { eraserActive, setEraserActive } = useStore();

  return (
    <div className="fixed bottom-8 left-6 z-40">
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
        className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white shadow-lg transition-all duration-150 active:scale-95 touch-none select-none ${
          eraserActive ? 'bg-[#E11D48] scale-110 ring-4 ring-[#E11D48]/30' : 'bg-[#E11D48]/80 hover:bg-[#E11D48]'
        }`}
        title="按住啟用左手彈簧橡皮擦"
      >
        <Eraser className="w-6 h-6" />
        <span className="text-[9px] font-bold uppercase tracking-tighter mt-0.5">Eraser</span>
      </button>
    </div>
  );
};
