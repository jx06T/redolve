type DrawingCommand = 'undo' | 'redo';
type Commands = Record<DrawingCommand, () => boolean>;
const canvases = new Map<HTMLElement, Commands>();
let lastUsed: HTMLElement | null = null;
export const STUDY_ADVANCE_EVENT = 'redolve:study-advance';

export function registerDrawingCommands(element: HTMLElement, commands: Commands) {
  canvases.set(element, commands);
  return () => { canvases.delete(element); if(lastUsed===element)lastUsed=null; };
}
export function activateDrawingCanvas(element: HTMLElement) { lastUsed=element; }
export function hasDrawingCanvas() { return canvases.size>0; }
export function runDrawingCommand(command: DrawingCommand, problemId: string | null) {
  const element=(lastUsed&&canvases.has(lastUsed)?lastUsed:null)
    || [...canvases.keys()].find(el=>el.closest('[data-problem-id]')?.getAttribute('data-problem-id')===problemId)
    || canvases.keys().next().value;
  return element?canvases.get(element)![command]():false;
}
