import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  isOpen,
  onClose,
  title = '題目放大檢視',
}) => {
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

  // Reset zoom & pan when opening a new image
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, imageUrl]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(s + 0.25, 5));
      } else if (e.key === '-') {
        setScale((s) => {
          const next = Math.max(1, s - 0.25);
          if (next === 1) setPosition({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Double tap to toggle zoom between 1x and 2.5x
  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    const newScale = Math.min(Math.max(1, scale + delta), 5);
    setScale(newScale);
    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  // Pointer dragging (mouse or stylus)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || scale <= 1) return;
    e.stopPropagation();
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
  };

  // Mobile pinch zoom
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      if (lastTouchDistRef.current !== null) {
        const delta = (dist - lastTouchDistRef.current) * 0.01;
        const newScale = Math.min(Math.max(1, scale + delta), 5);
        setScale(newScale);
        if (newScale === 1) setPosition({ x: 0, y: 0 });
      }
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistRef.current = null;
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => Math.min(s + 0.5, 5));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => {
      const next = Math.max(1, s - 0.5);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center select-none overflow-hidden animate-in fade-in duration-200"
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        // Only close if clicking directly on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        className="fixed top-5 right-5 z-[10000] flex items-center gap-1.5 bg-stone-900/80 backdrop-blur-xl p-1.5 rounded-2xl border border-white/15 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] font-mono text-stone-400 px-2 select-none">
          {Math.round(scale * 100)}%
        </span>

        <div className="w-px h-4 bg-white/20 my-auto" />

        <button
          type="button"
          onClick={handleZoomIn}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/90 hover:text-white hover:bg-white/15 active:scale-95 transition-all"
          title="放大 (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/90 hover:text-white hover:bg-white/15 active:scale-95 transition-all"
          title="縮小 (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/90 hover:text-white hover:bg-white/15 active:scale-95 transition-all"
          title="還原 100% (0)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-white/20 my-auto mx-0.5" />

        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white active:scale-95 transition-all shadow-md"
          title="關閉檢視器 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image Stage */}
      <div
        className={`relative w-full h-full flex items-center justify-center p-4 md:p-8 ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleDoubleTap}
      >
        <img
          src={imageUrl}
          alt={title}
          draggable={false}
          className="max-w-[92vw] max-h-[88vh] object-contain select-none shadow-2xl rounded-lg transition-transform duration-75 ease-out will-change-transform"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
};
