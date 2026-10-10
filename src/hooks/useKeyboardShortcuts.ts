import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { PEN_WIDTHS } from '../config/constants';
import { hasDrawingCanvas, runDrawingCommand, STUDY_ADVANCE_EVENT } from '../services/drawingCommands';

interface KeyboardShortcutsOptions {
  onToggleShortcutsModal?: () => void;
  onResolveActiveProblem?: () => void;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutsOptions) {
  const optionsRef=useRef(options); optionsRef.current=options;
  useEffect(()=>{
    const handleKeyDown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.isComposing || event.keyCode===229)return;
      const typing=(element:EventTarget|null)=>element instanceof Element && !!element.closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
      if(typing(event.target)||typing(document.activeElement))return;
      const key=event.key.toLowerCase();
      const modifier=event.metaKey||event.ctrlKey;
      const state=useStore.getState();
      if(!modifier && !event.altKey && (key==='?' || event.shiftKey && key==='/')) {
        if(!event.repeat && optionsRef.current?.onToggleShortcutsModal) {
          event.preventDefault(); optionsRef.current.onToggleShortcutsModal();
        }
        return;
      }
      // Modal controls and text fields retain their own keyboard behavior.
      if(document.querySelector('[role="dialog"][aria-modal="true"]'))return;
      if(modifier && !event.altKey && (key==='z' || key==='y' && event.ctrlKey && !event.metaKey && !event.shiftKey)) {
        const direction=key==='y'||event.shiftKey?'redo':'undo';
        if(runDrawingCommand(direction,state.activeProblemId))event.preventDefault();
        return;
      }
      if(modifier && !event.altKey && !event.shiftKey && key==='enter') {
        if(event.repeat)return;
        if(optionsRef.current?.onResolveActiveProblem) {
          event.preventDefault(); optionsRef.current.onResolveActiveProblem();
        } else {
          const advance=new Event(STUDY_ADVANCE_EVENT,{cancelable:true});
          window.dispatchEvent(advance);
          if(advance.defaultPrevented)event.preventDefault();
        }
        return;
      }
      if(modifier && !event.altKey && !event.shiftKey && key==='d') {
        if(!event.repeat){event.preventDefault();state.toggleDarkMode();}
        return;
      }
      if(modifier || event.altKey || event.shiftKey || !hasDrawingCanvas())return;
      const tools={p:'pen',h:'highlighter',e:'eraser'} as const;
      if(key in tools) {
        event.preventDefault();state.setTool(tools[key as keyof typeof tools]);
      } else if(/^[1-5]$/.test(key)) {
        const color=state.paletteColors[Number(key)-1];
        if(color){
          event.preventDefault();state.setPenColor(color.hex);
          if(state.tool==='eraser')state.setTool('pen');
        }
      } else if(key==='[' || key===']') {
        event.preventDefault();
        const index=PEN_WIDTHS.indexOf(state.penWidth);
        state.setPenWidth(PEN_WIDTHS[Math.max(0,Math.min(PEN_WIDTHS.length-1,index+(key==='['?-1:1)))]);
      }
    };
    window.addEventListener('keydown',handleKeyDown);
    return ()=>window.removeEventListener('keydown',handleKeyDown);
  },[]);
}
