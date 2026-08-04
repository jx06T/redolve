import React, { useEffect } from 'react';
import { X, Command, PenTool, Eraser, Palette, CheckCircle2, Moon, HelpCircle } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: '手寫與繪圖工具 (Drawing Tools)',
      items: [
        { key: 'P', desc: '切換為 鋼筆 (Pen)', icon: PenTool },
        { key: 'H', desc: '切換為 螢光筆 (Highlighter)', icon: PenTool },
        { key: 'E', desc: '切換為 橡皮擦 (Eraser)', icon: Eraser },
        { key: '1 ~ 4', desc: '切換筆觸預設顏色 (黑 / 靛藍 / 玫紅 / 蔚藍)', icon: Palette },
        { key: '[  /  ]', desc: '縮小 / 放大筆觸粗細 (1px / 2px / 4px)', icon: PenTool },
      ],
    },
    {
      title: '刷題與訂正推進 (Study & Review)',
      items: [
        { key: 'Cmd / Ctrl + Enter', desc: '標記當前題目為完成訂正並推進下一題', icon: CheckCircle2 },
        { key: '雙指輕觸畫布', desc: '復原上一步筆跡 (Undo Gesture)', icon: Command },
        { key: '左下角長按 FAB', desc: '彈簧橡皮擦 (放開即刻切回鋼筆)', icon: Eraser },
      ],
    },
    {
      title: '系統與快速操作 (System & Shortcuts)',
      items: [
        { key: 'Cmd / Ctrl + D', desc: '切換深淺色模式', icon: Moon },
        { key: '?', desc: '開啟 / 關閉此快捷鍵指南', icon: HelpCircle },
        { key: 'Esc', desc: '關閉目前開啟的彈出視窗', icon: X },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in-50 duration-200">
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl">
              <Command className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
                iPad 外接鍵盤 & 桌面快捷鍵指南
              </h3>
              <p className="text-[11px] text-[#9CA3AF]">
                支援 iPad Magic Keyboard 與外接藍牙鍵盤高效操作
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF] transition-colors"
            title="關閉 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {shortcutGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <h4 className="text-xs font-bold text-[#9CA3AF] tracking-wider">
                {group.title}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item, iIdx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={iIdx}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 dark:bg-[#1a1a1d] border border-stone-200/50 dark:border-stone-800/80"
                    >
                      <div className="flex items-center space-x-2.5">
                        <Icon className="w-4 h-4 text-[#6366F1] shrink-0" />
                        <span className="text-xs text-[#374151] dark:text-[#D1D5DB] font-medium">
                          {item.desc}
                        </span>
                      </div>
                      <kbd className="px-2.5 py-1 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-mono font-bold text-[#374151] dark:text-[#D1D5DB] shadow-2xs">
                        {item.key}
                      </kbd>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 bg-stone-50 dark:bg-[#1a1a1d] border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
