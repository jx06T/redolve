import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Toast: React.FC = () => {
  const { toast, hideToast } = useStore();

  if (!toast) return null;

  const bgStyle =
    toast.type === 'error'
      ? 'bg-status-eraser text-white ring-4 ring-status-eraser/20 shadow-xl'
      : toast.type === 'success'
      ? 'bg-status-resolved text-white ring-4 ring-status-resolved/20 shadow-xl'
      : 'bg-primary text-white ring-4 ring-primary/20 shadow-xl';

  const Icon = toast.type === 'error' ? AlertCircle : toast.type === 'success' ? CheckCircle : Info;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-full text-xs font-semibold select-none animate-in slide-in-from-top duration-200">
      <div
        className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-full ${bgStyle} ${toast.action ? 'cursor-pointer hover:opacity-90' : ''}`}
        onClick={() => {
          if (toast.action) {
            toast.action();
            hideToast();
          }
        }}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="max-w-md truncate">{toast.message}</span>
        <button
          onClick={hideToast}
          className="p-0.5 rounded-full hover:bg-white/20 transition-colors ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
