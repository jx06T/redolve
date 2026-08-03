import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React Error Boundary Caught]:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F4F2] dark:bg-[#161618] flex items-center justify-center p-6 select-none">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#374151] dark:text-[#D1D5DB]">
              應用程式發生意外錯誤
            </h2>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              很抱歉，畫面前端渲染遭遇未預期例外。您可以點擊下方按鈕重新載入應用程式。
            </p>
            {this.state.error && (
              <div className="p-3 rounded-2xl bg-stone-100 dark:bg-stone-800 text-[11px] font-mono text-stone-600 dark:text-stone-400 text-left overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-95 transition-all shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              <span>重新載入頁面</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
