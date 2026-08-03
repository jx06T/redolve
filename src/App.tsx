import { BookOpen, Sparkles, ShieldCheck, PenTool } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-200 transition-colors duration-200 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-3xl p-8 shadow-sm space-y-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <PenTool className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Redolve
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              心流式 AI 錯題本 (iPad + Cloudflare Workers)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <Sparkles className="w-5 h-5 text-indigo-500 mb-2" />
            <h3 className="font-semibold text-sm">Gemini AI 分類</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              自動依課綱標準辨識科目、單元與關鍵字
            </p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <BookOpen className="w-5 h-5 text-indigo-500 mb-2" />
            <h3 className="font-semibold text-sm">無縫無限滾動</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              專為 iPad Apple Pencil 最佳化的向量畫布
            </p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <ShieldCheck className="w-5 h-5 text-indigo-500 mb-2" />
            <h3 className="font-semibold text-sm">Cloudflare Edge</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Workers + D1 + R2 超低延遲邊緣運算
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>專案目錄初始化完成</span>
          <span>Version 1.0.0</span>
        </div>
      </div>
    </div>
  );
}
