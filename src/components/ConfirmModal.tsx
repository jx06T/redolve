import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = '確認',
  cancelText = '取消',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#202023] border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-2xl ${
                isDestructive
                  ? 'bg-rose-500/10 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400'
                  : 'bg-indigo-500/10 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-400'
              }`}
            >
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#374151] dark:text-[#E5E7EB]">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] leading-relaxed">
          {message}
        </p>

        <div className="pt-2 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-stone-100 dark:bg-stone-800 text-[#4B5563] dark:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700 transition-all active:scale-95"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-medium text-white transition-all active:scale-95 ${
              isDestructive
                ? 'bg-[#E11D48] hover:bg-[#BE123C] shadow-xs'
                : 'bg-[#6366F1] hover:bg-[#4F46E5] shadow-xs'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
