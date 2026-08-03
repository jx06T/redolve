import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Highlighter, GripVertical } from 'lucide-react';
import { useStore } from '../store/useStore';

export const FloatingPenToolbar: React.FC = () => {
  const { tool, setTool, penColor, setPenColor, penWidth, setPenWidth } = useStore();

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize position to top-right on mount / resize
  useEffect(() => {
    const initPos = () => {
      if (!position) {
        setPosition({
          x: window.innerWidth - 64,
          y: 96,
        });
      }
    };
    initPos();
    window.addEventListener('resize', initPos);
    return () => window.removeEventListener('resize', initPos);
  }, [position]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only trigger drag if clicking the drag handle or background, not buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    if (!position) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !position) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }
    setIsDragging(false);

    // Edge snapping logic
    const midX = window.innerWidth / 2;
    const snapX = position.x < midX ? 24 : window.innerWidth - 64;
    const clampedY = Math.max(80, Math.min(window.innerHeight - 260, position.y));

    setPosition({ x: snapX, y: clampedY });
  };

  const colorPalette = [
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Rose', hex: '#E11D48' },
    { name: 'Blue', hex: '#3B82F6' },
  ];

  if (!position) return null;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className={`fixed z-40 bg-white/90 dark:bg-[#202023]/90 backdrop-blur-md border border-[#E5E7EB] dark:border-[#2C2C30] rounded-full px-2 py-3 flex flex-col items-center space-y-3 shadow-xl select-none touch-none ${
        isDragging ? 'cursor-grabbing scale-105 shadow-2xl' : 'cursor-grab transition-all duration-200 ease-out'
      }`}
    >
      {/* Drag Grip Handle */}
      <div className="text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] py-0.5 cursor-grab">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

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
