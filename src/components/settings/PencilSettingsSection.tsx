import React, { useState } from 'react';
import { Sliders, Palette, RotateCcw, Plus, X } from 'lucide-react';
import { useStore } from '../../store/useStore';

const ALL_RECOMMENDED_COLORS = [
  { name: '深灰石墨', hex: '#374151' },
  { name: '鋼筆經典', hex: '#6366F1' },
  { name: '重點批註', hex: '#E11D48' },
  { name: '觀念補強', hex: '#3B82F6' },
  { name: '薄荷翠綠', hex: '#10B981' },
  { name: '暖陽琥珀', hex: '#F59E0B' },
  { name: '薰衣草紫', hex: '#8B5CF6' },
  { name: '珊瑚粉橘', hex: '#FB923C' },
  { name: '青瓷海藍', hex: '#06B6D4' },
  { name: '櫻花淡粉', hex: '#EC4899' },
];

export const PencilSettingsSection: React.FC = () => {
  const {
    penColor,
    setPenColor,
    paletteColors,
    addPaletteColor,
    removePaletteColor,
    resetPaletteColors,
    penWidth,
    setPenWidth,
    showToast,
  } = useStore();

  const [customHexInput, setCustomHexInput] = useState<string>('#6366F1');

  const handleAddCustomColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hex = customHexInput.trim().toUpperCase();
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
      showToast('請輸入合法的 Hex 色碼 (例如: #10B981)', 'error');
      return;
    }
    addPaletteColor({ hex });
  };

  const handleResetPalette = () => {
    resetPaletteColors();
    showToast('已還原為經典預設調色盤', 'info');
  };

  return (
    <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-6">
      <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
          <Sliders className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold">iPad 手寫與筆觸偏好</h2>
          <p className="text-xs text-[#9CA3AF]">
            配置 iPad + Apple Pencil 預設筆觸顏色、自訂調色盤、粗細與自動滾動體驗
          </p>
        </div>
      </div>

      <div className="space-y-6 pt-2">
        {/* Unified Pen Color Palette Management */}
        <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-800/30 border border-stone-200/60 dark:border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Palette className="w-4 h-4 text-[#6366F1]" />
              <label className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">
                筆觸調色盤 (Pen Color Palette)
              </label>
              <span className="text-[11px] font-mono text-[#9CA3AF] ml-2">
                當前選取：<span className="font-bold text-[#6366F1]">{penColor.toUpperCase()}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetPalette}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-200/60 dark:hover:bg-stone-700/60 transition-colors"
              title="還原為系統經典 4 色預設"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>還原經典配色</span>
            </button>
          </div>

          {/* All Palette Color Chips */}
          <div className="flex flex-wrap items-center gap-2.5">
            {paletteColors.map((c) => (
              <div
                key={c.hex}
                className={`group relative flex items-center space-x-1.5 pl-2 pr-1.5 py-1.5 rounded-xl border transition-all ${
                  penColor.toUpperCase() === c.hex.toUpperCase()
                    ? 'border-indigo-500 bg-white dark:bg-[#202023] ring-2 ring-indigo-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#202023] hover:border-stone-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPenColor(c.hex)}
                  className="flex items-center space-x-2 text-left"
                >
                  <span
                    className="w-5 h-5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="text-xs font-medium text-[#374151] dark:text-[#D1D5DB]">
                    {c.name || c.hex}
                  </span>
                </button>
                {paletteColors.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePaletteColor(c.hex);
                    }}
                    aria-label={`刪除顏色 ${c.name || c.hex}`}
                    className="p-1 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    title="自調色盤刪除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add Custom Color Controls */}
          <form onSubmit={handleAddCustomColor} className="flex flex-wrap items-center gap-3 pt-2">
            <div className="relative shrink-0 w-8 border rounded-full border-stone-200 dark:border-stone-700 bg-white dark:bg-[#202023] h-8">
              <div className="relative w-5 h-5 mx-auto mt-[0.35rem]">
                <button
                  type="button"
                  className="absolute inset-0 w-full h-full rounded-xl border border-black/10 shadow-xs transition-transform flex items-center justify-center"
                  style={{ backgroundColor: customHexInput }}
                  title="點擊開啟原生調色盤"
                />
                <input
                  type="color"
                  value={customHexInput}
                  onChange={(e) => setCustomHexInput(e.target.value.toUpperCase())}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                  title="選擇自訂顏色"
                />
              </div>
            </div>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-semibold bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-95 transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>加入調色盤</span>
            </button>
          </form>

          {/* Suggested Colors Row */}
          <div className="pt-2">
            <div className="text-[11px] font-semibold text-[#9CA3AF] mb-2">
              快速推薦莫蘭迪與經典色系（點擊加入）：
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ALL_RECOMMENDED_COLORS.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  onClick={() => {
                    setCustomHexInput(s.hex);
                    addPaletteColor({ hex: s.hex, name: s.name });
                  }}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] bg-white dark:bg-[#202023] border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB] hover:border-indigo-400 hover:scale-105 active:scale-95 transition-all"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.hex }} />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stroke Width Selector */}
        <div className="pt-2">
          <label className="block text-xs font-bold text-[#374151] dark:text-[#D1D5DB] mb-2">
            預設筆觸粗細 (Default Stroke Width: {penWidth}px)
          </label>
          <div className="flex items-center space-x-3">
            {[1, 2, 4].map((w) => (
              <button
                key={w}
                onClick={() => setPenWidth(w)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  penWidth === w
                    ? 'bg-[#6366F1] text-white border-[#6366F1] shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] border-stone-200 dark:border-stone-700 hover:bg-stone-100'
                }`}
              >
                {w}px {w === 1 ? '(細)' : w === 2 ? '(標準)' : '(粗)'}
              </button>
            ))}
          </div>
        </div>

        {/* iPad Gestures Guide */}
        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 text-xs text-[#9CA3AF] space-y-1">
          <p className="font-semibold text-[#374151] dark:text-[#D1D5DB]">iPad 觸控手勢提示：</p>
          <p>• 雙指輕觸畫布可直接 Undo 復原上一步筆跡。</p>
          <p>• 運筆接近卡片底部 100px 時，畫布將平滑自動向下展延 400px。</p>
          <p>• 長按懸浮橡皮擦按鈕可啟動彈簧橡皮擦，放開即刻回到原本筆觸。</p>
        </div>
      </div>
    </div>
  );
};
