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
        className="bg-surface border border-border-subtle rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-2xl ${
                isDestructive
                  ? 'bg-status-eraser/10 text-status-eraser border border-status-eraser/20'
                  : 'bg-primary/10 text-primary dark:bg-primary-950/40 dark:text-primary-300'
              }`}
            >
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-text-main">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-xl text-text-muted hover:text-text-main transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          {message}
        </p>

        <div className="pt-2 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-text-main hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all active:scale-95"
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
                ? 'bg-status-eraser hover:bg-status-eraser/90 shadow-xs'
                : 'bg-primary hover:bg-primary-hover shadow-xs'
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
