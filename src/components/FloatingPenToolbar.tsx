import React from 'react';
import { PenTool, Highlighter } from 'lucide-react';
import { useStore } from '../store/useStore';

export const FloatingPenToolbar: React.FC = () => {
  const { tool, setTool, penColor, setPenColor, penWidth, setPenWidth } = useStore();

  const colorPalette = [
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Rose', hex: '#E11D48' },
    { name: 'Blue', hex: '#3B82F6' },
  ];

  return (
    <div className="fixed top-24 right-6 z-40 bg-white/90 dark:bg-[#202023]/90 backdrop-blur-md border border-[#E5E7EB] dark:border-[#2C2C30] rounded-full px-2 py-3 flex flex-col items-center space-y-3 shadow-xl select-none transition-all">
      {/* Tool Selector */}
      <div className="flex flex-col items-center space-y-1.5 border-b border-stone-200 dark:border-stone-700 pb-2.5">
        <button
          onClick={() => setTool('pen')}
          className={`p-2 rounded-full transition-all ${
            tool === 'pen'
              ? 'bg-[#6366F1] text-white shadow-xs'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
          title="鋼筆 (Pen)"
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('highlighter')}
          className={`p-2 rounded-full transition-all ${
            tool === 'highlighter'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
          title="螢光筆 (Highlighter)"
        >
          <Highlighter className="w-4 h-4" />
        </button>
      </div>

      {/* 3 Color Chips */}
      <div className="flex flex-col items-center space-y-2 border-b border-stone-200 dark:border-stone-700 pb-2.5">
        {colorPalette.map((c) => (
          <button
            key={c.hex}
            onClick={() => setPenColor(c.hex)}
            className={`w-5 h-5 rounded-full transition-transform ${
              penColor === c.hex ? 'scale-125 ring-2 ring-[#6366F1] ring-offset-2 dark:ring-offset-[#202023]' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
          />
        ))}
      </div>

      {/* 2 Stroke Width Options */}
      <div className="flex flex-col items-center space-y-1 font-mono text-xs">
        {[2, 4].map((w) => (
          <button
            key={w}
            onClick={() => setPenWidth(w)}
            className={`w-7 h-7 rounded-full text-[11px] flex items-center justify-center transition-all ${
              penWidth === w
                ? 'bg-[#6366F1] text-white font-bold'
                : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {w}p
          </button>
        ))}
      </div>
    </div>
  );
};
