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

function getEraserRadius(width: number): number {
  return width <= 1 ? 7 : width <= 2 ? 14 : 24;
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
  const [eraserCursorPos, setEraserCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringEraser, setIsHoveringEraser] = useState<boolean>(false);
  const [isErasingLive, setIsErasingLive] = useState<boolean>(false);

  const redoStackRef = useRef<Stroke[]>([]);
  const gestureTimerRef = useRef<number | null>(null);
  const pendingTouchCountRef = useRef<number>(0);

  const isErasingRef = useRef<boolean>(false);
  const hasErasedChangeRef = useRef<boolean>(false);
  const isMultiTouchGestureRef = useRef<boolean>(false);
  const lastUndoTimestampRef = useRef<number>(0);
  const calcSpaceHeightRef = useRef<number>(calcSpaceHeight);
  calcSpaceHeightRef.current = calcSpaceHeight;

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
        calcSpaceHeight: typeof calcSpaceHeightRef.current === 'number' ? calcSpaceHeightRef.current : 240,
        expansions: [{ addedHeight: typeof calcSpaceHeightRef.current === 'number' ? calcSpaceHeightRef.current : 240, atY: currentHeight }],
      };
      lastSavedDataJsonRef.current = JSON.stringify(payload);
      if (onSaveDrawData) {
        onSaveDrawData(payload);
      }
    },
    [onSaveDrawData]
  );

  // Two-Finger Undo Listener (Bimanual Spring Eraser & Stylus Safe)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touchList = Array.from(e.touches);
      const targetTouchList = Array.from(e.targetTouches);
      const hasStylus = touchList.some((t: any) => t.touchType === 'stylus');
      if (hasStylus || isEraserActive) {
        if (hasStylus) e.preventDefault();
        return;
      }

      const count = Math.max(targetTouchList.length, touchList.length);

      if (count >= 2 && count <= 3) {
        e.preventDefault();
        isMultiTouchGestureRef.current = true;
        setIsDrawing(false);
        setCurrentPoints([]);
        isErasingRef.current = false;
        setIsErasingLive(false);
        hasErasedChangeRef.current = false;

        pendingTouchCountRef.current = count;

        // 每次有新手指落下就重新計時,等手指數穩定下來才動作
        if (gestureTimerRef.current) {
          window.clearTimeout(gestureTimerRef.current);
        }
        gestureTimerRef.current = window.setTimeout(() => {
          gestureTimerRef.current = null;
          const finalCount = pendingTouchCountRef.current;
          const now = Date.now();
          if (now - lastUndoTimestampRef.current <= 350) return;
          lastUndoTimestampRef.current = now;

          if (finalCount === 2) {
            // 復原
            if (strokesRef.current.length > 0) {
              const popped = strokesRef.current[strokesRef.current.length - 1];
              const next = strokesRef.current.slice(0, -1);
              redoStackRef.current = [...redoStackRef.current, popped];
              setStrokes(next);
              strokesRef.current = next;
              emitSave(next, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
            }
          } else if (finalCount === 3) {
            // 重做
            if (redoStackRef.current.length > 0) {
              const restored = redoStackRef.current[redoStackRef.current.length - 1];
              redoStackRef.current = redoStackRef.current.slice(0, -1);
              const next = [...strokesRef.current, restored];
              setStrokes(next);
              strokesRef.current = next;
              emitSave(next, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
            }
          }
        }, 50);
      } else if (count > 3) {
        isMultiTouchGestureRef.current = true;
        setIsDrawing(false);
        setCurrentPoints([]);
        if (gestureTimerRef.current) {
          window.clearTimeout(gestureTimerRef.current);
          gestureTimerRef.current = null;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.targetTouches.length === 0) {
        // Reset multi-touch gesture lock once all fingers leave canvas
        setTimeout(() => {
          isMultiTouchGestureRef.current = false;
        }, 80);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      if (gestureTimerRef.current) {
        window.clearTimeout(gestureTimerRef.current);
      }
    };
  }, [readOnly, isEraserActive, emitSave]);

  // Partial Vector Stroke Eraser: splits stroke into sub-strokes around the eraser circle
  const lastErasePosRef = useRef<{ x: number; y: number } | null>(null);

  const eraseAt = useCallback((screenX: number, screenY: number) => {
    const currentScale = computeScale(strokesRef.current, canvasWidthRef.current, baseWidthRef.current);
    const baseX = screenX / currentScale;
    const baseY = screenY / currentScale;
    const baseEraserRadius = getEraserRadius(activeWidth);
    const eraserRadius = baseEraserRadius / currentScale;
    const eraserRadiusSq = eraserRadius * eraserRadius;

    const prevList = strokesRef.current;
    if (prevList.length === 0) return;

    let hasAnyChange = false;
    const nextStrokes: Stroke[] = [];

    for (let sIdx = 0; sIdx < prevList.length; sIdx++) {
      const stroke = prevList[sIdx];
      if (!stroke.points || stroke.points.length === 0) {
        hasAnyChange = true;
        continue;
      }

      // 1. Quick bounding box rejection
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }

      if (
        baseX < minX - eraserRadius ||
        baseX > maxX + eraserRadius ||
        baseY < minY - eraserRadius ||
        baseY > maxY + eraserRadius
      ) {
        nextStrokes.push(stroke);
        continue;
      }

      // 2. Check if any point or segment is touched by eraser
      let isTouched = false;
      for (let i = 0; i < stroke.points.length; i++) {
        const [px, py] = stroke.points[i];
        const dx = px - baseX;
        const dy = py - baseY;
        if (dx * dx + dy * dy <= eraserRadiusSq) {
          isTouched = true;
          break;
        }
      }

      if (!isTouched) {
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const [x1, y1] = stroke.points[i];
          const [x2, y2] = stroke.points[i + 1];
          const lineLenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
          if (lineLenSq === 0) continue;
          const t = Math.max(0, Math.min(1, ((baseX - x1) * (x2 - x1) + (baseY - y1) * (y2 - y1)) / lineLenSq));
          const projX = x1 + t * (x2 - x1);
          const projY = y1 + t * (y2 - y1);
          const distSq = (baseX - projX) * (baseX - projX) + (baseY - projY) * (baseY - projY);
          if (distSq <= eraserRadiusSq) {
            isTouched = true;
            break;
          }
        }
      }

      if (!isTouched) {
        nextStrokes.push(stroke);
        continue;
      }

      // 3. Stroke was touched: densify points along line segments for crisp vector cutting
      hasAnyChange = true;
      const stepSize = Math.max(2, eraserRadius * 0.35);
      const densifiedPoints: [number, number, number][] = [];
      for (let i = 0; i < stroke.points.length; i++) {
        densifiedPoints.push(stroke.points[i]);
        if (i < stroke.points.length - 1) {
          const [x1, y1, p1] = stroke.points[i];
          const [x2, y2, p2] = stroke.points[i + 1];
          const dist = Math.hypot(x2 - x1, y2 - y1);
          if (dist > stepSize) {
            const steps = Math.min(12, Math.ceil(dist / stepSize));
            for (let s = 1; s < steps; s++) {
              const t = s / steps;
              densifiedPoints.push([
                x1 + (x2 - x1) * t,
                y1 + (y2 - y1) * t,
                p1 + (p2 - p1) * t,
              ]);
            }
          }
        }
      }

      // 4. Split into sub-stroke chunks of points outside the eraser circle
      let currentChunk: [number, number, number][] = [];
      for (let i = 0; i < densifiedPoints.length; i++) {
        const pt = densifiedPoints[i];
        const dx = pt[0] - baseX;
        const dy = pt[1] - baseY;
        const isInside = dx * dx + dy * dy <= eraserRadiusSq;

        if (!isInside) {
          currentChunk.push(pt);
        } else {
          if (currentChunk.length > 0) {
            const finalChunk: [number, number, number][] = currentChunk.length === 1
              ? [currentChunk[0], [currentChunk[0][0] + 0.1, currentChunk[0][1] + 0.1, currentChunk[0][2]]]
              : currentChunk;
            nextStrokes.push({
              ...stroke,
              points: finalChunk,
            });
            currentChunk = [];
          }
        }
      }

      if (currentChunk.length > 0) {
        const finalChunk: [number, number, number][] = currentChunk.length === 1
          ? [currentChunk[0], [currentChunk[0][0] + 0.1, currentChunk[0][1] + 0.1, currentChunk[0][2]]]
          : currentChunk;
        nextStrokes.push({
          ...stroke,
          points: finalChunk,
        });
      }
    }

    if (hasAnyChange) {
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      hasErasedChangeRef.current = true;
    }
  }, [activeWidth]);

  // Continuous drag eraser with linear interpolation to prevent gaps on fast swipes
  const performErase = useCallback((screenX: number, screenY: number) => {
    if (lastErasePosRef.current) {
      const dx = screenX - lastErasePosRef.current.x;
      const dy = screenY - lastErasePosRef.current.y;
      const dist = Math.hypot(dx, dy);
      const baseEraserRadius = getEraserRadius(activeWidth);
      const stepSize = Math.max(3, baseEraserRadius * 0.4);
      if (dist > stepSize) {
        const steps = Math.min(24, Math.ceil(dist / stepSize));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          eraseAt(
            lastErasePosRef.current.x + dx * t,
            lastErasePosRef.current.y + dy * t
          );
        }
      } else {
        eraseAt(screenX, screenY);
      }
    } else {
      eraseAt(screenX, screenY);
    }
    lastErasePosRef.current = { x: screenX, y: screenY };
  }, [eraseAt, activeWidth]);

  // Pointer Event Handlers (PointerType Separation & Stylus Precision)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !inkVisible) return;

    // Hardware stylus eraser tip / side button detection (e.buttons === 32 or pointerType === 'eraser')
    const isHardwareEraser = e.buttons === 32 || (e as any).pointerType === 'eraser' || e.button === 5;
    const isEffectiveEraser = isEraserActive || activeTool === 'eraser' || isHardwareEraser;

    // Detect Apple Pencil / Stylus input / Mouse input
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      if (!pencilDetected && e.pointerType === 'pen') {
        setPencilDetected(true);
      }
      isMultiTouchGestureRef.current = false;
      if (e.pointerType === 'pen') {
        canvasRef.current!.style.touchAction = 'none';
      }
    } else if (e.pointerType === 'touch') {
      if (!isEffectiveEraser) {
        return; // Let CSS pan-y handle the scroll
      }
      if (!isEraserActive) {
        return; // Prevent touch from erasing if eraser is not explicitly active
      }
      if (!e.isPrimary || isMultiTouchGestureRef.current) {
        isMultiTouchGestureRef.current = true;
        setIsDrawing(false);
        setCurrentPoints([]);
        return;
      }
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

    if (isEffectiveEraser) {
      isErasingRef.current = true;
      setIsErasingLive(true);
      setEraserCursorPos({ x, y });
      hasErasedChangeRef.current = false;
      lastErasePosRef.current = { x, y };
      eraseAt(x, y);
    } else {
      setIsDrawing(true);
      setCurrentPoints([[x, y, pressure]]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !inkVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.pointerType === 'touch' && !isEraserActive && !allowTouchDrawing) {
      return;
    }

    const isEffectiveEraser = isEraserActive || activeTool === 'eraser';
    if (e.pointerType === 'touch' && !isEraserActive) {
      return;
    }

    if (isEffectiveEraser) {
      setEraserCursorPos({ x, y });
      setIsHoveringEraser(true);
    }

    if (isErasingRef.current) {
      performErase(x, y);
      return;
    }

    if (!isDrawing) return;
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

    lastErasePosRef.current = null;
    setIsErasingLive(false);
    if (e.pointerType === 'pen') {
      e.currentTarget.style.touchAction = 'pan-y';
    }

    if (isErasingRef.current) {
      isErasingRef.current = false;
      if (hasErasedChangeRef.current) {
        emitSave(strokesRef.current, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
        redoStackRef.current = [];
        hasErasedChangeRef.current = false;
      }
      return;
    }

    // Ignore commit if a multi-touch gesture was detected
    if (isMultiTouchGestureRef.current) {
      setIsDrawing(false);
      setCurrentPoints([]);
      return;
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
      redoStackRef.current = [];
      emitSave(nextStrokes, eraserMasksRef.current, canvasHeightRef.current, canvasWidthRef.current);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    lastErasePosRef.current = null;
    setIsDrawing(false);
    setCurrentPoints([]);
    isErasingRef.current = false;
    setIsErasingLive(false);
    
    if (e.pointerType === 'pen') {
      e.currentTarget.style.touchAction = 'pan-y';
    }
  };

  const handlePointerLeave = () => {
    setIsHoveringEraser(false);
  };

  // Render Canvas Context
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {isVisible ? (
        <>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{
              touchAction: 'pan-y',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
            className={`w-full h-full select-none ${readOnly || !inkVisible
              ? 'pointer-events-none'
              : isEraserActive || activeTool === 'eraser'
                ? 'cursor-none'
                : 'cursor-crosshair'
              }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
          />
          {/* Visual Eraser Indicator Ring */}
          {!readOnly && inkVisible && (isErasingLive || (isHoveringEraser && (isEraserActive || activeTool === 'eraser'))) && eraserCursorPos && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E11D48]/70 bg-[#E11D48]/15 backdrop-blur-[0.5px] transition-none z-20"
              style={{
                left: eraserCursorPos.x,
                top: eraserCursorPos.y,
                width: getEraserRadius(activeWidth) * 2,
                height: getEraserRadius(activeWidth) * 2,
              }}
            />
          )}
        </>
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
