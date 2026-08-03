import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Highlighter, GripVertical, GripHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore';
import { COLOR_PALETTE, STROKE_WIDTHS } from '../config/constants';

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
        touchAction: 'none',
      }}
      className={`fixed z-40 bg-white/90 dark:bg-[#202023]/90 backdrop-blur-md border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-2 shadow-xl select-none transition-all duration-200 ${
        isHorizontal ? 'flex flex-row items-center space-x-2' : 'flex flex-col items-center space-y-2'
      } ${isDragging ? 'scale-105 shadow-2xl opacity-90 cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* Drag Handle Indicator */}
      <div className="text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]">
        {isHorizontal ? <GripHorizontal className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </div>

      {/* Tool Selector: Pen vs Highlighter */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1 border-r border-stone-200 dark:border-stone-800 pr-2'
            : 'flex flex-col items-center space-y-1 border-b border-stone-200 dark:border-stone-800 pb-2'
        }
      >
        <button
          onClick={() => setTool('pen')}
          aria-label="鋼筆書寫工具"
          className={`p-2.5 rounded-2xl active:scale-95 transition-all ${
            tool === 'pen'
              ? 'bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400 font-bold ring-1 ring-[#6366F1]/30'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
          title="鋼筆"
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('highlighter')}
          aria-label="螢光筆標記工具"
          className={`p-2.5 rounded-2xl active:scale-95 transition-all ${
            tool === 'highlighter'
              ? 'bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400 font-bold ring-1 ring-[#6366F1]/30'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
          title="螢光筆"
        >
          <Highlighter className="w-4 h-4" />
        </button>
      </div>

      {/* Color Palette Chips */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1.5 border-r border-stone-200 dark:border-stone-800 pr-2'
            : 'flex flex-col items-center space-y-1.5 border-b border-stone-200 dark:border-stone-800 pb-2'
        }
      >
        {COLOR_PALETTE.map((c) => (
          <button
            key={c.hex}
            onClick={() => {
              setPenColor(c.hex);
              if (tool === 'eraser') setTool('pen');
            }}
            aria-label={`選取顏色: ${c.name}`}
            className={`w-6 h-6 rounded-full transition-transform border border-black/10 dark:border-white/10 active:scale-95 ${
              penColor === c.hex ? 'scale-125 ring-2 ring-[#6366F1] shadow-xs' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
          />
        ))}
      </div>

      {/* Stroke Width Selector */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1 font-mono text-xs'
            : 'flex flex-col items-center space-y-1 font-mono text-xs'
        }
      >
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setPenWidth(w)}
            aria-label={`選取筆觸粗細 ${w} pt`}
            className={`w-7 h-7 rounded-full text-[11px] flex items-center justify-center active:scale-95 transition-all ${
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
