import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ArrowDown } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProblemActions } from '../hooks/useProblemActions';
import { STUDY_ADVANCE_EVENT } from '../services/drawingCommands';

interface SmartCTAProps {
  onStatusResolved?: (problemId: string) => void;
  action?: { resolved: boolean; disabled?: boolean; run: () => Promise<void> };
}

export const SmartCTA: React.FC<SmartCTAProps> = ({ onStatusResolved, action }) => {
  const { activeProblemId, problems } = useStore();
  const { toggleStatus } = useProblemActions();
  const [busy, setBusy] = useState(false);
  const buttonRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const advance=(event:Event)=>{
      const button=buttonRef.current;
      if(event.defaultPrevented || !button || button.disabled)return;
      event.preventDefault();button.click();
    };
    window.addEventListener(STUDY_ADVANCE_EVENT,advance);
    return ()=>window.removeEventListener(STUDY_ADVANCE_EVENT,advance);
  },[]);

  const targetProblem =
    problems.find((p) => p.id === activeProblemId) || problems.find((p) => p.status === 'unsolved') || problems[0];

  if (!action && !targetProblem) return null;

  const isResolved = action?.resolved ?? targetProblem.status === 'resolved';

  const handleSmartResolve = async () => {
    if (busy || action?.disabled) return;
    if (action) {
      setBusy(true);
      try { await action.run(); }
      catch (error) { useStore.getState().showToast(error instanceof Error ? error.message : '儲存失敗', 'error'); }
      finally { setBusy(false); }
      return;
    }
    if (isResolved) {
      if (onStatusResolved) onStatusResolved(targetProblem.id);
      return;
    }
    const nextStatus = await toggleStatus(targetProblem);
    if (nextStatus === 'resolved' && onStatusResolved) {
      onStatusResolved(targetProblem.id);
    }
  };

  const button = (
    <div
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 2px) + 4.5rem)' }}
      className="fixed md:bottom-8 right-5 sm:right-6 z-40 flex items-center space-x-2"
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={busy || action?.disabled}
        aria-label={isResolved ? '切換下一題' : '完成當題訂正'}
        onClick={handleSmartResolve}
        className={`flex items-center space-x-1.5 px-4 py-3 rounded-full text-xs font-bold text-white shadow-xl transition-all duration-200 active:scale-95 disabled:opacity-50 ${isResolved
          ? 'bg-status-resolved hover:bg-status-resolved/90 ring-2 ring-status-resolved/30'
          : 'bg-primary hover:bg-primary-hover ring-2 ring-primary/30'
          }`}
        title={`${isResolved ? '下一題' : '完成當題訂正並前往下一題'}（Ctrl/Cmd + Enter）`}
      >
        <CheckCircle2 className="w-4 h-4 mr-0.5" />
        <span>{busy ? '儲存中…' : isResolved ? '下一題' : '完成訂正'}</span>
        <ArrowDown className="w-3.5 h-3.5 " />
      </button>
    </div>
  );
  // Virtual rows are translated; portal keeps the action fixed to the viewport.
  return action ? createPortal(button, document.body) : button;
};
