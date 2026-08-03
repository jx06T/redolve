import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Highlighter, GripVertical, GripHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore';

export const FloatingPenToolbar: React.FC = () => {
  const { tool, setTool, penColor, setPenColor, penWidth, setPenWidth } = useStore();

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize position to top-right on mount / window resize
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

    // Calculate 4-edge distances
    const distLeft = Math.abs(position.x);
    const distRight = Math.abs(window.innerWidth - (position.x + 64));
    const distTop = Math.abs(position.y - 80);
    const distBottom = Math.abs(window.innerHeight - (position.y + 64));

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist === distTop) {
      // Snap to Top Edge -> Horizontal Layout
      setOrientation('horizontal');
      const clampedX = Math.max(24, Math.min(window.innerWidth - 320, position.x));
      setPosition({ x: clampedX, y: 80 });
    } else if (minDist === distBottom) {
      // Snap to Bottom Edge -> Horizontal Layout
      setOrientation('horizontal');
      const clampedX = Math.max(24, Math.min(window.innerWidth - 320, position.x));
      setPosition({ x: clampedX, y: window.innerHeight - 80 });
    } else if (minDist === distLeft) {
      // Snap to Left Edge -> Vertical Layout
      setOrientation('vertical');
      const clampedY = Math.max(80, Math.min(window.innerHeight - 260, position.y));
      setPosition({ x: 24, y: clampedY });
    } else {
      // Snap to Right Edge -> Vertical Layout
      setOrientation('vertical');
      const clampedY = Math.max(80, Math.min(window.innerHeight - 260, position.y));
      setPosition({ x: window.innerWidth - 64, y: clampedY });
    }
  };

  const colorPalette = [
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Rose', hex: '#E11D48' },
    { name: 'Blue', hex: '#3B82F6' },
  ];

  if (!position) return null;

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className={`fixed z-40 bg-white/90 dark:bg-[#202023]/90 backdrop-blur-md border border-[#E5E7EB] dark:border-[#2C2C30] rounded-full shadow-xl select-none touch-none ${
        isHorizontal
          ? 'px-3 py-2 flex flex-row items-center space-x-3'
          : 'px-2 py-3 flex flex-col items-center space-y-3'
      } ${
        isDragging ? 'cursor-grabbing scale-105 shadow-2xl' : 'cursor-grab transition-all duration-200 ease-out'
      }`}
    >
      {/* Drag Grip Handle */}
      <div className="text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] cursor-grab">
        {isHorizontal ? <GripHorizontal className="w-3.5 h-3.5" /> : <GripVertical className="w-3.5 h-3.5" />}
      </div>

      {/* Tool Selector */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1.5 border-r border-stone-200 dark:border-stone-700 pr-2.5'
            : 'flex flex-col items-center space-y-1.5 border-b border-stone-200 dark:border-stone-700 pb-2.5'
        }
      >
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
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-2 border-r border-stone-200 dark:border-stone-700 pr-2.5'
            : 'flex flex-col items-center space-y-2 border-b border-stone-200 dark:border-stone-700 pb-2.5'
        }
      >
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
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1 font-mono text-xs'
            : 'flex flex-col items-center space-y-1 font-mono text-xs'
        }
      >
        {[2, 4].map((w) => (
          <button
            key={w}
            onClick={() => setPenWidth(w)}
            className={`w-7 h-7 rounded-full text-[11px] flex items-center justify-center transition-all ${
              penWidth === w
                ? 'bg-[#6366F1] text-[#FFFFFF] font-bold'
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
