import React, { useRef, useEffect, useState, useCallback } from 'react';
import getStroke from 'perfect-freehand';
import { DrawData, Stroke, EraserMask } from '../types';

interface DrawCanvasProps {
  initialDrawData?: DrawData | string | null;
  readOnly?: boolean;
  inkVisible?: boolean;
  onSaveDrawData?: (drawData: DrawData) => void;
  onExpandSpace?: (addedHeight: number) => void;
  activeTool?: 'pen' | 'highlighter' | 'eraser';
  activeColor?: string;
  activeWidth?: number;
  isEraserActive?: boolean;
}

function getSvgPathFromStroke(strokePoints: number[][]): string {
  if (!strokePoints || strokePoints.length === 0) return '';
  const d = strokePoints.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === 0) return `M ${x0},${y0}`;
      const [x1, y1] = arr[i - 1];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      return `${acc} Q ${x1},${y1} ${mx},${my}`;
    },
    ''
  );
  return d;
}

function parseDrawData(raw: DrawData | string | null | undefined): { strokes: Stroke[]; eraserMasks: EraserMask[] } {
  if (!raw) return { strokes: [], eraserMasks: [] };
  try {
    const parsed: DrawData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      strokes: Array.isArray(parsed?.strokes) ? parsed.strokes : [],
      eraserMasks: Array.isArray(parsed?.eraserMasks) ? parsed.eraserMasks : [],
    };
  } catch {
    return { strokes: [], eraserMasks: [] };
  }
}

export const DrawCanvas: React.FC<DrawCanvasProps> = ({
  initialDrawData,
  readOnly = false,
  inkVisible = true,
  onSaveDrawData,
  activeTool = 'pen',
  activeColor = '#6366F1',
  activeWidth = 2,
  isEraserActive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [canvasHeight, setCanvasHeight] = useState<number>(400);
  const [canvasWidth, setCanvasWidth] = useState<number>(800);

  const initialParsed = parseDrawData(initialDrawData);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initialParsed.strokes);
  const [eraserMasks, setEraserMasks] = useState<EraserMask[]>(() => initialParsed.eraserMasks);
  const [currentPoints, setCurrentPoints] = useState<[number, number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const strokesRef = useRef<Stroke[]>(strokes);
  strokesRef.current = strokes;
  const eraserMasksRef = useRef<EraserMask[]>(eraserMasks);
  eraserMasksRef.current = eraserMasks;
  const canvasHeightRef = useRef<number>(canvasHeight);
  canvasHeightRef.current = canvasHeight;

  const lastSavedDataJsonRef = useRef<string>(
    typeof initialDrawData === 'string' ? initialDrawData : JSON.stringify(initialDrawData || {})
  );

  // Sync Initial Draw Data from parent (only if changed from external source)
  useEffect(() => {
    const currentJson = typeof initialDrawData === 'string' ? initialDrawData : JSON.stringify(initialDrawData || {});
    if (currentJson && currentJson !== lastSavedDataJsonRef.current) {
      lastSavedDataJsonRef.current = currentJson;
      const parsed = parseDrawData(initialDrawData);
      setStrokes(parsed.strokes);
      setEraserMasks(parsed.eraserMasks);
    }
  }, [initialDrawData]);

  // Sync canvas pixel dimensions to container dimensions dynamically
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || 800;
        const h = containerRef.current.clientHeight || 400;
        setCanvasWidth(w);
        setCanvasHeight(h);
      }
    };
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Viewport-Only Canvas Mount (IntersectionObserver)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.05 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Save Emitter Helper
  const emitSave = useCallback(
    (updatedStrokes: Stroke[], updatedErasers: EraserMask[] = eraserMasksRef.current, currentHeight: number = canvasHeightRef.current) => {
      const payload: DrawData = {
        strokes: updatedStrokes,
        eraserMasks: updatedErasers,
        expansions: [{ addedHeight: Math.max(0, currentHeight - 400), atY: currentHeight }],
      };
      lastSavedDataJsonRef.current = JSON.stringify(payload);
      if (onSaveDrawData) {
        onSaveDrawData(payload);
      }
    },
    [onSaveDrawData]
  );

  // Two-Finger Undo Listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const next = strokesRef.current.slice(0, strokesRef.current.length - 1);
        setStrokes(next);
        emitSave(next, eraserMasksRef.current, canvasHeightRef.current);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => container.removeEventListener('touchstart', handleTouchStart);
  }, [readOnly, emitSave]);

  // Pointer Event Handlers (PointerType Separation)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !inkVisible) return;

    // Palm rejection guard for secondary touch points
    if (e.pointerType === 'touch' && !e.isPrimary) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    const effectiveTool = isEraserActive ? 'eraser' : activeTool;

    if (effectiveTool === 'eraser') {
      // Vector Segment Clipping (Geometric Erase against stored strokes)
      const eraserRadius = 18;
      const nextStrokes = strokesRef.current.filter((stroke) => {
        return !stroke.points.some(([px, py]) => {
          const dist = Math.hypot(px - x, py - y);
          return dist < eraserRadius;
        });
      });
      setStrokes(nextStrokes);
      emitSave(nextStrokes, eraserMasksRef.current, canvasHeightRef.current);
    } else {
      setIsDrawing(true);
      setCurrentPoints([[x, y, pressure]]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly || !inkVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    setCurrentPoints((prev) => [...prev, [x, y, pressure]]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.length > 0) {
      const newStroke: Stroke = {
        color: activeColor,
        width: activeWidth,
        points: currentPoints,
        tool: activeTool === 'highlighter' ? 'highlighter' : 'pen',
        opacity: activeTool === 'highlighter' ? 0.35 : 1.0,
      };

      const nextStrokes = [...strokesRef.current, newStroke];
      setStrokes(nextStrokes);
      setCurrentPoints([]);
      emitSave(nextStrokes, eraserMasksRef.current, canvasHeightRef.current);
    }
  };

  // Render Canvas Context
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!inkVisible) return; // Hide Ink Toggle for US 3.1

    // Render Completed Strokes
    strokes.forEach((stroke) => {
      const strokePoints = getStroke(stroke.points, {
        size: stroke.width * 2,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });

      const pathData = getSvgPathFromStroke(strokePoints);
      if (pathData) {
        ctx.save();
        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = stroke.opacity ?? 1.0;
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.restore();
      }
    });

    // Render Live In-progress Stroke
    if (currentPoints.length > 0) {
      const liveStrokePoints = getStroke(currentPoints, {
        size: activeWidth * 2,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });
      const pathData = getSvgPathFromStroke(liveStrokePoints);
      if (pathData) {
        ctx.save();
        ctx.fillStyle = activeColor;
        ctx.globalAlpha = activeTool === 'highlighter' ? 0.35 : 1.0;
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.restore();
      }
    }
  }, [isVisible, inkVisible, strokes, currentPoints, activeColor, activeWidth, activeTool, canvasHeight, canvasWidth]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
    >
      {isVisible ? (
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={`w-full h-full touch-none select-none ${
            readOnly || !inkVisible ? 'pointer-events-none' : 'cursor-crosshair'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ) : (
        /* Static SVG Snapshot fallback for unmounted canvas */
        <svg className="w-full h-full pointer-events-none">
          {inkVisible &&
            strokes.map((stroke, i) => {
              const strokePoints = getStroke(stroke.points, {
                size: stroke.width * 2,
                thinning: 0.5,
                smoothing: 0.5,
                streamline: 0.5,
              });
              const d = getSvgPathFromStroke(strokePoints);
              return <path key={i} d={d} fill={stroke.color} opacity={stroke.opacity ?? 1.0} />;
            })}
        </svg>
      )}
    </div>
  );
};
