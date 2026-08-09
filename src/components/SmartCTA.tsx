import React from 'react';
import { CheckCircle2, ArrowDown } from 'lucide-react';
import { useStore } from '../store/useStore';
import { updateProblemStatus } from '../services/api';

interface SmartCTAProps {
  onStatusResolved?: (problemId: string) => void;
}

export const SmartCTA: React.FC<SmartCTAProps> = ({ onStatusResolved }) => {
  const { activeProblemId, problems, updateProblemInStore } = useStore();

  // Find currently locked problem or first unsolved problem
  const targetProblem =
    problems.find((p) => p.id === activeProblemId) || problems.find((p) => p.status === 'unsolved') || problems[0];

  if (!targetProblem) return null;

  const isResolved = targetProblem.status === 'resolved';

  const handleSmartResolve = async () => {
    if (isResolved) {
      if (onStatusResolved) {
        onStatusResolved(targetProblem.id);
      }
      return;
    }
    const nextStatus = 'resolved';
    try {
      await updateProblemStatus(targetProblem.id, nextStatus);
      updateProblemInStore(targetProblem.id, {
        status: nextStatus,
        review_count: targetProblem.review_count + 1,
      });

      if (onStatusResolved) {
        onStatusResolved(targetProblem.id);
      }
    } catch (err) {
      console.error('Failed to mark resolved via Smart CTA:', err);
    }
  };

  return (
    <div
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 2px) + 3.75rem)' }}
      className="fixed md:bottom-8 right-5 sm:right-6 z-40 flex items-center space-x-2"
    >
      <button
        onClick={handleSmartResolve}
        className={`flex items-center space-x-1.5 px-4 py-3 rounded-full text-xs font-bold text-white shadow-xl transition-all duration-200 active:scale-95 ${isResolved
          ? 'bg-status-resolved hover:bg-status-resolved/90 ring-2 ring-status-resolved/30'
          : 'bg-primary hover:bg-primary-hover ring-2 ring-primary/30'
          }`}
        title="智慧工作流推進器：標記當前題目並推進至下一題"
      >
        <CheckCircle2 className="w-4 h-4 mr-0.5" />
        <span>{isResolved ? '已完成' : '完成訂正'}</span>
        <ArrowDown className="w-3.5 h-3.5 " />
      </button>
    </div>
  );
};
