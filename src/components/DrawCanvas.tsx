import React, { useRef, useEffect, useState, useCallback } from 'react';
import getStroke from 'perfect-freehand';
import { DrawData, Stroke, EraserMask } from '../types';
import { useStore } from '../store/useStore';

interface DrawCanvasProps {
  initialDrawData?: DrawData | string | null;
  readOnly?: boolean;
  inkVisible?: boolean;
  calcSpaceHeight?: number;
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

function parseDrawData(raw: DrawData | string | null | undefined): {
  strokes: Stroke[];
  eraserMasks: EraserMask[];
  calcSpaceHeight?: number;
  baseWidth?: number;
  baseHeight?: number;
} {
  if (!raw) return { strokes: [], eraserMasks: [] };
  try {
    const parsed: DrawData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      strokes: Array.isArray(parsed?.strokes) ? parsed.strokes : [],
      eraserMasks: Array.isArray(parsed?.eraserMasks) ? parsed.eraserMasks : [],
      calcSpaceHeight: typeof parsed?.calcSpaceHeight === 'number' ? parsed.calcSpaceHeight : undefined,
      baseWidth: typeof parsed?.baseWidth === 'number' ? parsed.baseWidth : undefined,
      baseHeight: typeof parsed?.baseHeight === 'number' ? parsed.baseHeight : undefined,
    };
  } catch {
    return { strokes: [], eraserMasks: [] };
  }
}

function getStrokeOptions(tool: 'pen' | 'highlighter' | 'eraser', width: number) {
  if (tool === 'highlighter') {
    // Highlighter: broad, translucent, consistent band
    const size = width <= 1 ? 16 : width <= 2 ? 24 : 36;
    return {
      size,
      thinning: 0.02,
      smoothing: 0.6,
      streamline: 0.6,
      opacity: 0.32,
    };
  }
  // Pen: natural pressure-sensitive ink
  const size = width <= 1 ? 2.5 : width <= 2 ? 4.5 : 7.5;
  return {
    size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    opacity: 1.0,
  };
}

function computeScale(strokesList: Stroke[], currentWidth: number, storedBaseWidth?: number): number {
  if (storedBaseWidth && storedBaseWidth > 0 && currentWidth > 0) {
    return currentWidth / storedBaseWidth;
  }
  // Check if legacy strokes exceed current canvas width (e.g. drawn on iPad 1024 / desktop)
  if (currentWidth > 0 && strokesList.length > 0) {
    let maxX = 0;
    for (const s of strokesList) {
      if (s.points) {
        for (const pt of s.points) {
          if (pt && pt[0] > maxX) maxX = pt[0];
        }
      }
    }
    if (maxX > currentWidth) {
      const inferred = maxX > 900 ? 1024 : maxX > 700 ? 800 : maxX + 20;
      return currentWidth / inferred;
    }
  }
  return 1.0;
}

export const DrawCanvas: React.FC<DrawCanvasProps> = ({
  initialDrawData,
  readOnly = false,
  inkVisible = true,
  calcSpaceHeight = 240,
  onSaveDrawData,
  activeTool = 'pen',
  activeColor = '#6366F1',
  activeWidth = 2,
  isEraserActive = false,
}) => {
  const { pencilDetected, setPencilDetected, allowTouchDrawing } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [canvasHeight, setCanvasHeight] = useState<number>(400);
  const [canvasWidth, setCanvasWidth] = useState<number>(800);

  const initialParsed = parseDrawData(initialDrawData);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initialParsed.strokes);
  const [eraserMasks, setEraserMasks] = useState<EraserMask[]>(() => initialParsed.eraserMasks);
  const [baseWidth, setBaseWidth] = useState<number | undefined>(initialParsed.baseWidth);
  const [baseHeight, setBaseHeight] = useState<number | undefined>(initialParsed.baseHeight);
  const [currentPoints, setCurrentPoints] = useState<[number, number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const strokesRef = useRef<Stroke[]>(strokes);
  strokesRef.current = strokes;
  const eraserMasksRef = useRef<EraserMask[]>(eraserMasks);
  eraserMasksRef.current = eraserMasks;
  const canvasHeightRef = useRef<number>(canvasHeight);
  canvasHeightRef.current = canvasHeight;
  const canvasWidthRef = useRef<number>(canvasWidth);
  canvasWidthRef.current = canvasWidth;
  const baseWidthRef = useRef<number | undefined>(baseWidth);
  baseWidthRef.current = baseWidth;
  const baseHeightRef = useRef<number | undefined>(baseHeight);
  baseHeightRef.current = baseHeight;

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
      if (parsed.baseWidth) setBaseWidth(parsed.baseWidth);
      if (parsed.baseHeight) setBaseHeight(parsed.baseHeight);
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

  // Compute current responsive scale factor
  const scale = computeScale(strokes, canvasWidth, baseWidth);

  // Save Emitter Helper
  const emitSave = useCallback(
    (
      updatedStrokes: Stroke[],
      updatedErasers: EraserMask[] = eraserMasksRef.current,
      currentHeight: number = canvasHeightRef.current,
      currentWidth: number = canvasWidthRef.current
    ) => {
      const activeBaseW = baseWidthRef.current || currentWidth || 800;
      const activeBaseH = baseHeightRef.current || currentHeight || 600;
      const payload: DrawData = {
        strokes: updatedStrokes,
        eraserMasks: updatedErasers,
        baseWidth: activeBaseW,
        baseHeight: activeBaseH,
        calcSpaceHeight: typeof calcSpaceHeight === 'number' ? calcSpaceHeight : 240,
        expansions: [{ addedHeight: typeof calcSpaceHeight === 'number' ? calcSpaceHeight : 240, atY: currentHeight }],
      };
      lastSavedDataJsonRef.current = JSON.stringify(payload);
      if (onSaveDrawData) {
        onSaveDrawData(payload);
      }
    },
    [onSaveDrawData, calcSpaceHeight]
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
        emitSave(next, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => container.removeEventListener('touchstart', handleTouchStart);
  }, [readOnly, emitSave]);

  // Pointer Event Handlers (PointerType Separation)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !inkVisible) return;

    // Detect Apple Pencil / Stylus input
    if (e.pointerType === 'pen') {
      if (!pencilDetected) {
        setPencilDetected(true);
      }
    } else if (e.pointerType === 'touch') {
      // If touch drawing is disabled (Pencil mode), prevent touch from initiating strokes
      if (!allowTouchDrawing) {
        return;
      }
      // Palm rejection guard for secondary touch points
      if (!e.isPrimary) return;
    }

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

    // Initialize baseWidth if first time drawing
    if (!baseWidthRef.current) {
      setBaseWidth(canvasWidth);
      setBaseHeight(canvasHeight);
    }

    const currentScale = computeScale(strokesRef.current, canvasWidth, baseWidthRef.current);
    const effectiveTool = isEraserActive ? 'eraser' : activeTool;

    if (effectiveTool === 'eraser') {
      // Vector Segment Clipping in base coordinate space
      const eraserRadius = (activeWidth <= 1 ? 16 : activeWidth <= 2 ? 26 : 40) / currentScale;
      const baseX = x / currentScale;
      const baseY = y / currentScale;

      const nextStrokes = strokesRef.current.filter((stroke) => {
        return !stroke.points.some(([px, py]) => {
          const dist = Math.hypot(px - baseX, py - baseY);
          return dist < eraserRadius;
        });
      });
      setStrokes(nextStrokes);
      emitSave(nextStrokes, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
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
      const currentScale = computeScale(strokesRef.current, canvasWidth, baseWidthRef.current);
      const opts = getStrokeOptions(activeTool, activeWidth);

      // Convert captured screen points to base coordinate space
      const basePoints: [number, number, number][] = currentScale === 1.0
        ? currentPoints
        : currentPoints.map(([px, py, pr]) => [px / currentScale, py / currentScale, pr]);

      const newStroke: Stroke = {
        color: activeColor,
        width: activeWidth,
        points: basePoints,
        tool: activeTool === 'highlighter' ? 'highlighter' : 'pen',
        opacity: opts.opacity,
      };

      const nextStrokes = [...strokesRef.current, newStroke];
      setStrokes(nextStrokes);
      setCurrentPoints([]);
      emitSave(nextStrokes, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
    }
  };

  // Render Canvas Context
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!inkVisible) return; // Hide Ink Toggle

    const currentScale = computeScale(strokes, canvasWidth, baseWidth);

    // Render Completed Strokes with dynamic scale factor
    strokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      const toolType = stroke.tool === 'highlighter' ? 'highlighter' : 'pen';
      const opts = getStrokeOptions(toolType, stroke.width);

      const scaledPoints = currentScale === 1.0
        ? stroke.points
        : stroke.points.map(([px, py, pr]) => [px * currentScale, py * currentScale, pr] as [number, number, number]);

      const strokePoints = getStroke(scaledPoints, {
        size: opts.size * currentScale,
        thinning: opts.thinning,
        smoothing: opts.smoothing,
        streamline: opts.streamline,
      });

      const pathData = getSvgPathFromStroke(strokePoints);
      if (pathData) {
        ctx.save();
        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = stroke.opacity ?? opts.opacity;
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.restore();
      }
    });

    // Render Live In-progress Stroke
    if (currentPoints.length > 0) {
      const effectiveTool = isEraserActive ? 'eraser' : activeTool;
      const opts = getStrokeOptions(effectiveTool, activeWidth);
      const liveStrokePoints = getStroke(currentPoints, {
        size: opts.size,
        thinning: opts.thinning,
        smoothing: opts.smoothing,
        streamline: opts.streamline,
      });
      const pathData = getSvgPathFromStroke(liveStrokePoints);
      if (pathData) {
        ctx.save();
        ctx.fillStyle = activeColor;
        ctx.globalAlpha = opts.opacity;
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.restore();
      }
    }
  }, [isVisible, inkVisible, strokes, currentPoints, activeColor, activeWidth, activeTool, isEraserActive, canvasHeight, canvasWidth, baseWidth]);

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
          style={{ touchAction: allowTouchDrawing ? 'none' : 'pan-y' }}
          className={`w-full h-full select-none ${
            allowTouchDrawing ? 'touch-none' : ''
          } ${
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
              if (!stroke.points || stroke.points.length === 0) return null;
              const toolType = stroke.tool === 'highlighter' ? 'highlighter' : 'pen';
              const opts = getStrokeOptions(toolType, stroke.width);
              const scaledPoints = scale === 1.0
                ? stroke.points
                : stroke.points.map(([px, py, pr]) => [px * scale, py * scale, pr] as [number, number, number]);

              const strokePoints = getStroke(scaledPoints, {
                size: opts.size * scale,
                thinning: opts.thinning,
                smoothing: opts.smoothing,
                streamline: opts.streamline,
              });
              const d = getSvgPathFromStroke(strokePoints);
              return <path key={i} d={d} fill={stroke.color} opacity={stroke.opacity ?? opts.opacity} />;
            })}
        </svg>
      )}
    </div>
  );
};
