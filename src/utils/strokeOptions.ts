export function getStrokeOptions(tool: 'pen' | 'highlighter' | 'eraser', width: number) {
  if (tool === 'highlighter') {
    return {
      size: width <= 1 ? 14 : width <= 2 ? 18 : 30,
      thinning: 0.02,
      smoothing: 0.6,
      streamline: 0.6,
      opacity: 0.32,
    };
  }

  return {
    size: width <= 1 ? 1.5 : width <= 2 ? 2.5 : 6,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    opacity: 1.0,
  };
}
