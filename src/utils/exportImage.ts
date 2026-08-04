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

  const canvas = document.createElement('canvas');
  const width = img.naturalWidth || 1200;
  const height = img.naturalHeight || 800;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Draw background problem image
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  // Draw vector handwriting strokes
  if (parsedDrawData && parsedDrawData.strokes) {
    parsedDrawData.strokes.forEach((stroke: Stroke) => {
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
      const strokePoints = getStroke(stroke.points, {
        size: stroke.width * 2,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });
      const d = getSvgPathFromStroke(strokePoints);
      const opacity = stroke.opacity ?? 1.0;
      return `<path d="${d}" fill="${stroke.color}" opacity="${opacity}" />`;
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${pathElements}\n</svg>`;
}
