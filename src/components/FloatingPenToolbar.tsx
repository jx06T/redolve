import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Highlighter, Eraser, Plus, Hand, Maximize2, Minimize2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { STROKE_WIDTHS } from '../config/constants';

export const FloatingPenToolbar: React.FC = () => {
  const {
    tool,
    setTool,
    penColor,
    setPenColor,
    paletteColors,
    penWidth,
    setPenWidth,
    allowTouchDrawing,
    toggleAllowTouchDrawing,
    toolbarPosition,
    toolbarOrientation,
    setToolbarPosition,
    setToolbarOrientation,
  } = useStore();

  const toolbarRef = useRef<HTMLDivElement>(null);

  const [lastCustomColor, setLastCustomColor] = useState<string | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>(toolbarOrientation || 'vertical');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize position from store or default to top-right
  useEffect(() => {
    const initPos = () => {
      if (toolbarPosition && typeof toolbarPosition.x === 'number' && typeof toolbarPosition.y === 'number') {
        const clampedX = Math.max(12, Math.min(window.innerWidth - 62, toolbarPosition.x));
        const clampedY = Math.max(64, Math.min(window.innerHeight - 64, toolbarPosition.y));
        setPosition({ x: clampedX, y: clampedY });
        if (toolbarOrientation) {
          setOrientation(toolbarOrientation);
        }
      } else {
        const defaultX = window.innerWidth - 64;
        const defaultY = 96;
        setPosition({ x: defaultX, y: defaultY });
        setToolbarPosition({ x: defaultX, y: defaultY });
      }

      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    initPos();
    window.addEventListener('resize', initPos);
    return () => window.removeEventListener('resize', initPos);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

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

    let finalPos = { x: position.x, y: position.y };
    let finalOrientation: 'vertical' | 'horizontal' = 'vertical';

    if (minDist === distTop) {
      // Snap to Top Edge -> Horizontal Layout
      finalOrientation = 'horizontal';
      const clampedX = Math.max(24, Math.min(window.innerWidth - 320, position.x));
      finalPos = { x: clampedX, y: 70 };
    } else if (minDist === distBottom) {
      // Snap to Bottom Edge -> Horizontal Layout
      finalOrientation = 'horizontal';
      const clampedX = Math.max(24, Math.min(window.innerWidth - 320, position.x));
      finalPos = { x: clampedX, y: window.innerHeight - 80 };
    } else if (minDist === distLeft) {
      // Snap to Left Edge -> Vertical Layout
      finalOrientation = 'vertical';
      const clampedY = Math.max(80, Math.min(window.innerHeight - 260, position.y));
      finalPos = { x: 12, y: clampedY };
    } else {
      // Snap to Right Edge -> Vertical Layout
      finalOrientation = 'vertical';
      const clampedY = Math.max(80, Math.min(window.innerHeight - 260, position.y));
      finalPos = { x: window.innerWidth - 62, y: clampedY };
    }

    setPosition(finalPos);
    setOrientation(finalOrientation);
    setToolbarPosition(finalPos);
    setToolbarOrientation(finalOrientation);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHex = e.target.value;
    if (newHex) {
      setPenColor(newHex); // 更新畫筆為新顏色
      setLastCustomColor(newHex); // 記憶這個顏色
      if (tool === 'eraser') setTool('pen');
    }
  };

  if (!position) return null;

  const isHorizontal = orientation === 'horizontal';

  if (isCollapsed) {
    return (
      <div
        ref={toolbarRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          touchAction: 'none',
        }}
        className={`fixed top-0 left-0 z-50 bg-surface border border-border-subtle shadow-lg rounded-full p-2 flex select-none transition-shadow ${isDragging ? 'cursor-grabbing shadow-xl ring-2 ring-primary/50' : 'cursor-grab'
          }`}
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1 rounded-full hover:bg-neutral-100 text-text-main transition-all"
          title="展開工具列"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={toolbarRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
      }}
      className={`fixed top-0 left-0 z-30 bg-surface border border-border-subtle shadow-lg rounded-3xl p-1.5 flex select-none transition-shadow ${isDragging ? 'cursor-grabbing shadow-xl ring-2 ring-primary/50' : 'cursor-grab'
        } ${isHorizontal
          ? 'flex-row items-center space-x-2'
          : 'flex-col items-center space-y-2'
        }`}
    >
      {/* Collapse Button */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center border-r border-border-subtle pr-2'
            : 'flex flex-col items-center border-b border-border-subtle pb-2'
        }
      >
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-full hover:bg-neutral-100 text-text-muted transition-all"
          title="收合工具列"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Tool Selector */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1 border-r border-border-subtle pr-2'
            : 'flex flex-col items-center space-y-1 border-b border-border-subtle pb-2'
        }
      >
        <button
          onClick={() => setTool('pen')}
          aria-label="鋼筆書寫工具"
          className={`p-2.5 rounded-2xl active:scale-95 transition-all ${tool === 'pen'
            ? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/30'
            : 'text-text-main hover:bg-neutral-100 '
            }`}
          title="鋼筆"
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('highlighter')}
          aria-label="螢光筆標記工具"
          className={`p-2.5 rounded-2xl active:scale-95 transition-all ${tool === 'highlighter'
            ? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/30'
            : 'text-text-main hover:bg-neutral-100 '
            }`}
          title="螢光筆"
        >
          <Highlighter className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('eraser')}
          aria-label="橡皮擦工具"
          className={`p-2.5 rounded-2xl active:scale-95 transition-all ${tool === 'eraser'
            ? 'bg-status-eraser/10 text-status-eraser font-bold ring-1 ring-status-eraser/30'
            : 'text-text-main hover:bg-neutral-100 '
            }`}
          title="橡皮擦 (局部向量擦除)"
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>

      {/* Unified Color Palette Chips */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1.5 border-r border-border-subtle pr-2'
            : 'flex flex-col items-center space-y-1.5 border-b border-border-subtle pb-2'
        }
      >
        {/* 前 5 個固定顏色 */}
        {paletteColors.slice(0, 5).map((c) => (
          <button
            key={c.hex}
            onClick={() => {
              setPenColor(c.hex);
              if (tool === 'eraser') setTool('pen');
            }}
            aria-label={`選取顏色: ${c.name || c.hex}`}
            className={`w-6 h-6 rounded-full transition-transform border border-border-subtle active:scale-95 ${penColor.toUpperCase() === c.hex.toUpperCase()
              ? 'scale-105 ring-1 ring-primary shadow-xs'
              : 'hover:scale-110'
              }`}
            style={{ backgroundColor: c.hex }}
            title={c.name || c.hex}
          />
        ))}

        {/* 第 6 個按鈕：自訂色歷史插槽 */}
        <div className="relative w-6 h-6">
          <button
            type="button"
            onClick={() => {
              if (lastCustomColor && penColor.toUpperCase() !== lastCustomColor.toUpperCase()) {
                setPenColor(lastCustomColor);
                if (tool === 'eraser') setTool('pen');
              }
            }}
            aria-label="自訂色插槽"
            title={lastCustomColor ? "點擊選取自訂色 / 再次點擊開啟調色盤" : "新增自訂色"}
            className={`absolute inset-0 w-full h-full rounded-full flex items-center justify-center transition-all border ${lastCustomColor && penColor.toUpperCase() === lastCustomColor.toUpperCase()
              ? 'scale-105 ring-1 ring-primary shadow-xs border-border-subtle'
              : lastCustomColor
                ? 'border-border-subtle hover:scale-110'
                : 'bg-neutral-100 hover:bg-neutral-200 border-border-subtle hover:scale-110'
              }`}
            style={{
              backgroundColor: lastCustomColor || undefined,
            }}
          >
            {!lastCustomColor && (
              <Plus className="w-3.5 h-3.5 text-text-main" />
            )}
          </button>

          <input
            type="color"
            value={lastCustomColor || penColor}
            onChange={handleCustomColorChange}
            className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${(lastCustomColor && penColor.toUpperCase() !== lastCustomColor.toUpperCase())
              ? 'pointer-events-none'
              : 'pointer-events-auto'
              }`}
            title="選擇自訂顏色"
          />
        </div>
      </div>

      {/* Stroke Width Selector */}
      <div
        className={
          isHorizontal
            ? 'flex flex-row items-center space-x-1 font-mono text-xs border-r border-border-subtle pr-2'
            : 'flex flex-col items-center space-y-1 font-mono text-xs border-b border-border-subtle pb-2'
        }
      >
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setPenWidth(w)}
            aria-label={`選取筆觸粗細 ${w} pt`}
            className={`w-7 h-7 rounded-full text-[11px] flex items-center justify-center active:scale-95 transition-all ${penWidth === w
              ? 'bg-primary text-white font-bold'
              : 'text-text-main hover:bg-neutral-100 '
              }`}
          >
            {w}p
          </button>
        ))}
      </div>

      {/* Touch / Pencil Mode Toggle Button */}
      <div>
        <button
          onClick={toggleAllowTouchDrawing}
          aria-label={allowTouchDrawing ? '切換為僅限 Pencil 繪圖（防手掌誤觸）' : '開啟手指繪圖'}
          title={
            allowTouchDrawing
              ? '手指繪圖：已開啟 (點擊切換為僅限 Pencil 防誤觸)'
              : '手指繪圖：已鎖定 (僅限 Pencil，點擊以允許手指繪圖)'
          }
          className={`p-2 rounded-2xl active:scale-95 transition-all flex items-center justify-center relative ${allowTouchDrawing
            ? 'bg-status-resolved/15 text-status-resolved font-bold ring-1 ring-status-resolved/30'
            : 'bg-neutral-100 text-text-muted hover:bg-neutral-200 '
            }`}
        >
          <Hand className="w-4 h-4" />
          {!allowTouchDrawing && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-warning ring-1 ring-white " />
          )}
        </button>
      </div>
    </div>
  );
};
