import React, { useState, useEffect, useRef } from 'react';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
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
  const [scaleDisplay, setScaleDisplay] = useState<number>(100);
  const imgRef = useRef<HTMLImageElement>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);

  // Initialize Panzoom on open
  useEffect(() => {
    if (!isOpen || !imgRef.current) return;

    const elem = imgRef.current;
    const parent = elem.parentElement;

    const panzoom = Panzoom(elem, {
      maxScale: 5,
      minScale: 1,
      contain: 'outside',
      duration: 150,
      easing: 'ease-out',
    });

    panzoomRef.current = panzoom;
    setScaleDisplay(Math.round(panzoom.getScale() * 100));

    const handlePanzoomChange = (e: any) => {
      if (e.detail?.scale) {
        setScaleDisplay(Math.round(e.detail.scale * 100));
      }
    };

    elem.addEventListener('panzoomchange', handlePanzoomChange);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      panzoom.zoomWithWheel(e);
    };

    if (parent) {
      parent.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      elem.removeEventListener('panzoomchange', handlePanzoomChange);
      if (parent) {
        parent.removeEventListener('wheel', handleWheel);
      }
      panzoom.destroy();
      panzoomRef.current = null;
    };
  }, [isOpen, imageUrl]);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        panzoomRef.current?.zoomIn();
      } else if (e.key === '-') {
        panzoomRef.current?.zoomOut();
      } else if (e.key === '0') {
        panzoomRef.current?.reset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!panzoomRef.current) return;
    const currentScale = panzoomRef.current.getScale();
    if (currentScale > 1.2) {
      panzoomRef.current.reset();
    } else {
      panzoomRef.current.zoom(2.5, { animate: true });
    }
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    panzoomRef.current?.zoomIn();
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    panzoomRef.current?.zoomOut();
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    panzoomRef.current?.reset();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center select-none overflow-hidden animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        className="fixed top-5 right-5 z-[10000] flex items-center gap-1.5 bg-neutral-900/90 p-1.5 rounded-2xl border border-white/15 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] font-mono text-stone-400 px-2 select-none">
          {scaleDisplay}%
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
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-status-eraser hover:bg-status-eraser/90 text-white active:scale-95 transition-all shadow-md"
          title="關閉檢視器 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image Stage Container */}
      <div
        className="relative w-full h-full flex items-center justify-center p-4 md:p-8 cursor-grab active:cursor-grabbing"
        onDoubleClick={handleDoubleTap}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={title}
          draggable={false}
          className="max-w-[92vw] max-h-[88vh] object-contain select-none shadow-2xl rounded-lg cursor-grab active:cursor-grabbing"
        />
      </div>
    </div>
  );
};
