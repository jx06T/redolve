import getStroke from 'perfect-freehand';
import { DrawData, Stroke } from '../types';
import { DEFAULT_CALC_SPACE_HEIGHT, DEFAULT_BASE_WIDTH } from '../config/constants';
import { getStrokeOptions } from './strokeOptions';

function getSvgPathFromStroke(strokePoints: number[][]): string {
  if (!strokePoints || strokePoints.length === 0) return '';
  return strokePoints.reduce((acc, [x0, y0], i, arr) => {
    if (i === 0) return `M ${x0},${y0}`;
    const [x1, y1] = arr[i - 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    return `${acc} Q ${x1},${y1} ${mx},${my}`;
  }, '');
}

/**
 * Exports problem image and handwriting strokes combined into a high-res PNG
 */
export async function composeProblemImage(
  imageUrl: string,
  drawData: DrawData | string | null,
  options: { maxDimension?: number; maxPixels?: number; type?: string; quality?: number; imageElement?: HTMLImageElement } = {}
): Promise<Blob> {
  const parsedDrawData: DrawData | null = (() => {
    if (!drawData) return null;
    try {
      return typeof drawData === 'string' ? JSON.parse(drawData) : drawData;
    } catch {
      return null;
    }
  })();

  const reusable = options.imageElement?.complete && options.imageElement.naturalWidth ? options.imageElement : null;
  const img = reusable || new Image();
  if (!reusable) {
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('圖片載入逾時，請稍後重試')), 8000);
    img.onload = () => { clearTimeout(timeout); resolve(); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load problem image')); };
    img.src = imageUrl;
    });
  }

  const originalWidth = img.naturalWidth || 1200, originalHeight = img.naturalHeight || 800;
  const calcSpaceHeight = Math.max(0, Math.min(3000, parsedDrawData?.calcSpaceHeight ?? DEFAULT_CALC_SPACE_HEIGHT));
  const ratio = originalHeight / originalWidth + calcSpaceHeight / (parsedDrawData?.baseWidth || DEFAULT_BASE_WIDTH);
  const width = Math.max(1, Math.floor(Math.min(originalWidth, options.maxDimension || Infinity, (options.maxDimension || Infinity) / ratio, Math.sqrt((options.maxPixels || Infinity) / ratio))));
  const imgHeight = originalHeight * width / originalWidth;

  // Determine base coordinate space width
  const baseWidth = parsedDrawData?.baseWidth || DEFAULT_BASE_WIDTH;
  const scale = width / baseWidth;

  const totalHeight = Math.round(imgHeight + (calcSpaceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // 1. Draw problem image background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, imgHeight);
  ctx.drawImage(img, 0, 0, width, imgHeight);

  // 2. Draw extended scratchpad workspace background
  if (calcSpaceHeight > 0) {
    ctx.fillStyle = '#FAFAF9';
    ctx.fillRect(0, imgHeight, width, Math.round(calcSpaceHeight * scale));

    // Separator line
    ctx.save();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = Math.max(1, Math.round(2 * scale));
    ctx.setLineDash([8 * scale, 6 * scale]);
    ctx.beginPath();
    ctx.moveTo(0, imgHeight);
    ctx.lineTo(width, imgHeight);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw vector handwriting strokes
  if (parsedDrawData && parsedDrawData.strokes) {
    parsedDrawData.strokes.forEach((stroke: Stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
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
  }

  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('無法合成圖片')), options.type || 'image/png', options.quality));
}

export async function exportProblemAsImage(imageUrl: string, drawData: DrawData | string | null, filename = 'redolve_problem_export.png'): Promise<void> {
  const blob = await composeProblemImage(imageUrl, drawData), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.download = filename; link.href = url; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Exports handwriting strokes as a clean vector SVG string
 */
export function exportStrokesAsSvg(
  strokes: Stroke[],
  width: number = 800,
  height: number = 600
): string {
  const pathElements = strokes
    .map((stroke) => {
      if (!stroke.points || stroke.points.length === 0) return '';
      const toolType = stroke.tool === 'highlighter' ? 'highlighter' : 'pen';
      const opts = getStrokeOptions(toolType, stroke.width);

      const strokePoints = getStroke(stroke.points, {
        size: opts.size,
        thinning: opts.thinning,
        smoothing: opts.smoothing,
        streamline: opts.streamline,
      });
      const d = getSvgPathFromStroke(strokePoints);
      const opacity = stroke.opacity ?? opts.opacity;
      return `<path d="${d}" fill="${stroke.color}" opacity="${opacity}" />`;
    })
    .filter(Boolean)
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${pathElements}\n</svg>`;
}
