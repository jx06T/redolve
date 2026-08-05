import getStroke from 'perfect-freehand';
import { DrawData, Stroke } from '../types';

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
export async function exportProblemAsImage(
  imageUrl: string,
  drawData: DrawData | string | null,
  filename: string = 'redolve_problem_export.png'
): Promise<void> {
  const parsedDrawData: DrawData | null = (() => {
    if (!drawData) return null;
    try {
      return typeof drawData === 'string' ? JSON.parse(drawData) : drawData;
    } catch {
      return null;
    }
  })();

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load problem image'));
    img.src = imageUrl;
  });

  const width = img.naturalWidth || 1200;
  const imgHeight = img.naturalHeight || 800;
  const calcSpaceHeight = parsedDrawData?.calcSpaceHeight ?? 240;

  // Determine base coordinate space width
  const baseWidth = parsedDrawData?.baseWidth || 800;
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
      const baseSize = toolType === 'highlighter'
        ? (stroke.width <= 1 ? 16 : stroke.width <= 2 ? 24 : 36)
        : (stroke.width <= 1 ? 2.5 : stroke.width <= 2 ? 4.5 : 7.5);

      const scaledPoints = scale === 1.0
        ? stroke.points
        : stroke.points.map(([px, py, pr]) => [px * scale, py * scale, pr] as [number, number, number]);

      const strokePoints = getStroke(scaledPoints, {
        size: baseSize * scale,
        thinning: toolType === 'highlighter' ? 0.02 : 0.5,
        smoothing: toolType === 'highlighter' ? 0.6 : 0.5,
        streamline: toolType === 'highlighter' ? 0.6 : 0.5,
      });

      const pathData = getSvgPathFromStroke(strokePoints);
      if (pathData) {
        ctx.save();
        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = stroke.opacity ?? (toolType === 'highlighter' ? 0.32 : 1.0);
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.restore();
      }
    });
  }

  // Trigger download
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
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
      const baseSize = toolType === 'highlighter'
        ? (stroke.width <= 1 ? 16 : stroke.width <= 2 ? 24 : 36)
        : (stroke.width <= 1 ? 2.5 : stroke.width <= 2 ? 4.5 : 7.5);

      const strokePoints = getStroke(stroke.points, {
        size: baseSize,
        thinning: toolType === 'highlighter' ? 0.02 : 0.5,
        smoothing: toolType === 'highlighter' ? 0.6 : 0.5,
        streamline: toolType === 'highlighter' ? 0.6 : 0.5,
      });
      const d = getSvgPathFromStroke(strokePoints);
      const opacity = stroke.opacity ?? (toolType === 'highlighter' ? 0.32 : 1.0);
      return `<path d="${d}" fill="${stroke.color}" opacity="${opacity}" />`;
    })
    .filter(Boolean)
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${pathElements}\n</svg>`;
}
