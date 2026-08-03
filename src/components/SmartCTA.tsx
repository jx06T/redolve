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
    const nextStatus = isResolved ? 'unsolved' : 'resolved';
    try {
      await updateProblemStatus(targetProblem.id, nextStatus);
      updateProblemInStore(targetProblem.id, {
        status: nextStatus,
        review_count: isResolved ? targetProblem.review_count : targetProblem.review_count + 1,
      });

      if (nextStatus === 'resolved' && onStatusResolved) {
        onStatusResolved(targetProblem.id);
      }
    } catch (err) {
      console.error('Failed to mark resolved via Smart CTA:', err);
    }
  };

  return (
    <div className="fixed bottom-8 right-6 z-40 flex items-center space-x-2">
      <button
        onClick={handleSmartResolve}
        className={`flex items-center space-x-2 px-5 py-3 rounded-full text-xs font-bold text-white shadow-xl transition-all duration-200 active:scale-95 ${
          isResolved
            ? 'bg-emerald-600 hover:bg-emerald-700 ring-4 ring-emerald-500/20'
            : 'bg-[#6366F1] hover:bg-[#4F46E5] ring-4 ring-[#6366F1]/30 animate-pulse'
        }`}
        title="智慧工作流推進器：標記當前題目並推進至下一題"
      >
        <CheckCircle2 className="w-4.5 h-4.5" />
        <span>{isResolved ? '已標記完成' : '標記完成訂正'}</span>
        <ArrowDown className="w-3.5 h-3.5 opacity-80" />
      </button>
    </div>
  );
};
