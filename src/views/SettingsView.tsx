import React, { useEffect, useState, useRef } from 'react';
import { Key, Plus, Trash2, Copy, Check, ShieldCheck, Tag, Sliders, FolderPlus, Palette, X, RotateCcw } from 'lucide-react';
import { fetchApiKeys, createApiKey, deleteApiKey } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { ApiKeyItem, TaxonomyNode } from '../types';

const ALL_RECOMMENDED_COLORS = [
  { name: 'Dark Grey (深灰石墨)', hex: '#374151' },
  { name: 'Indigo (鋼筆經典)', hex: '#6366F1' },
  { name: 'Rose (重點批註)', hex: '#E11D48' },
  { name: 'Blue (觀念補強)', hex: '#3B82F6' },
  { name: '薄荷翠綠', hex: '#10B981' },
  { name: '暖陽琥珀', hex: '#F59E0B' },
  { name: '薰衣草紫', hex: '#8B5CF6' },
  { name: '珊瑚粉橘', hex: '#FB923C' },
  { name: '青瓷海藍', hex: '#06B6D4' },
  { name: '櫻花淡粉', hex: '#EC4899' },
];

export const SettingsView: React.FC = () => {
  useSEO({
    title: '系統設定與 iOS 捷徑管理',
    description: '管理 iPad / iPhone 捷徑傳輸金鑰、自訂題庫科目與單元分類、手寫筆觸自訂顏色與偏好設定。',
  });

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

  const [activeTab, setActiveTab] = useState<'apikeys' | 'taxonomy' | 'pencil'>('pencil');
  const [customHexInput, setCustomHexInput] = useState<string>('#10B981');
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // API Keys state
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Custom Taxonomy state
  const [customTaxonomies, setCustomTaxonomies] = useState<TaxonomyNode[]>(() => {
    try {
      const saved = localStorage.getItem('redolve_custom_taxonomies');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newSubjectLabel, setNewSubjectLabel] = useState<string>('');
  const [selectedParentSubject, setSelectedParentSubject] = useState<string>('math');
  const [newUnitLabel, setNewUnitLabel] = useState<string>('');

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetchApiKeys();
      setKeys(res.keys || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createApiKey(description.trim() || 'iPad 捷徑 Key');
      setNewKey(res.key);
      setDescription('');
      loadKeys();
      showToast('API Key 生成成功！請記得妥善保存。', 'success');
    } catch (err) {
      console.error('Failed to create key:', err);
      showToast('生成金鑰失敗', 'error');
    }
  };

  const handleRevokeKey = async (keyHash: string) => {
    if (confirm('確定要撤銷此 API Key 嗎？使用此 Key 的 iOS 捷徑將無法上傳。')) {
      try {
        await deleteApiKey(keyHash);
        loadKeys();
        showToast('已撤銷該 API Key', 'info');
      } catch (err) {
        console.error('Failed to revoke key:', err);
        showToast('撤銷失敗', 'error');
      }
    }
  };

  const handleCopyNewKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
      showToast('已複製金鑰至剪貼簿', 'success');
    }
  };

  const handleAddCustomSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectLabel.trim()) return;
    const newId = `custom-sub-${Date.now()}`;
    const newNode: TaxonomyNode = {
      id: newId,
      parent_id: null,
      label: newSubjectLabel.trim(),
      level: 0,
      children: [],
    };
    const updated = [...customTaxonomies, newNode];
    setCustomTaxonomies(updated);
    localStorage.setItem('redolve_custom_taxonomies', JSON.stringify(updated));
    setNewSubjectLabel('');
    showToast(`已新增自訂科目：${newNode.label}`, 'success');
  };

  const handleAddCustomUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitLabel.trim()) return;
    const newId = `custom-unit-${Date.now()}`;
    const newNode: TaxonomyNode = {
      id: newId,
      parent_id: selectedParentSubject,
      label: newUnitLabel.trim(),
      level: 1,
    };
    const updated = [...customTaxonomies, newNode];
    setCustomTaxonomies(updated);
    localStorage.setItem('redolve_custom_taxonomies', JSON.stringify(updated));
    setNewUnitLabel('');
    showToast(`已新增自訂單元：${newNode.label}`, 'success');
  };

  const handleDeleteCustomNode = (nodeId: string) => {
    const updated = customTaxonomies.filter((n) => n.id !== nodeId && n.parent_id !== nodeId);
    setCustomTaxonomies(updated);
    localStorage.setItem('redolve_custom_taxonomies', JSON.stringify(updated));
    showToast('已刪除自訂項目', 'info');
  };

  const handleAddCustomColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hex = customHexInput.trim().toUpperCase();
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
      showToast('請輸入合法的 Hex 色碼 (例如: #10B981)', 'error');
      return;
    }
    addPaletteColor({ hex });
    showToast(`已新增顏色 ${hex} 至調色盤`, 'success');
  };

  const handleResetPalette = () => {
    resetPaletteColors();
    showToast('已還原為經典預設調色盤', 'info');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] p-1.5 rounded-2xl select-none">
        <button
          onClick={() => setActiveTab('pencil')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'pencil'
              ? 'bg-[#6366F1] text-white shadow-xs'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>iPad 筆觸偏好設定</span>
        </button>

        <button
          onClick={() => setActiveTab('taxonomy')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'taxonomy'
              ? 'bg-[#6366F1] text-white shadow-xs'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>自訂科目與單元分類</span>
        </button>

        <button
          onClick={() => setActiveTab('apikeys')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'apikeys'
              ? 'bg-[#6366F1] text-white shadow-xs'
              : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>iOS 捷徑 API Key</span>
        </button>
      </div>

      {/* Tab 1: iPad Pen & Handwriting Preferences */}
      {activeTab === 'pencil' && (
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
                      onClick={() => {
                        setPenColor(c.hex);
                        showToast(`已選取筆觸顏色：${c.name || c.hex}`, 'success', 1500);
                      }}
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
                          showToast(`已自調色盤移除 ${c.name || c.hex}`, 'info');
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
                <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] p-1.5 rounded-2xl border border-stone-200 dark:border-stone-700">
                  <button
                    type="button"
                    onClick={() => pickerInputRef.current?.click()}
                    className="w-8 h-8 rounded-xl border border-black/10 shadow-xs transition-transform active:scale-95 flex items-center justify-center shrink-0"
                    style={{ backgroundColor: customHexInput }}
                    title="點擊開啟原生調色盤"
                  />
                  <input
                    ref={pickerInputRef}
                    type="color"
                    value={customHexInput}
                    onChange={(e) => setCustomHexInput(e.target.value.toUpperCase())}
                    className="sr-only"
                    tabIndex={-1}
                  />
                  <input
                    type="text"
                    value={customHexInput}
                    onChange={(e) => setCustomHexInput(e.target.value.toUpperCase())}
                    placeholder="#10B981"
                    maxLength={7}
                    className="w-24 px-2 py-1 text-xs font-mono uppercase bg-transparent text-[#374151] dark:text-[#D1D5DB] focus:outline-none"
                  />
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
                        showToast(`已加入並選取：${s.name} (${s.hex})`, 'success');
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
                    onClick={() => {
                      setPenWidth(w);
                      showToast(`已設定筆觸粗細為 ${w}px`, 'success', 1500);
                    }}
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
              <p>• 長按左下角懸浮按鈕可啟動彈簧橡皮擦，放開即刻回到原本筆觸。</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Custom Taxonomy Management */}
      {activeTab === 'taxonomy' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6">
            <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">自訂題庫科目與單元分類</h2>
                <p className="text-xs text-[#9CA3AF]">
                  支援自由新增自訂科目（如多益英文、國中理化）或在現有科目下擴充客製章節單元
                </p>
              </div>
            </div>
          </div>

          {/* Add Custom Subject Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <form onSubmit={handleAddCustomSubject} className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">新增自訂科目 (Top-level Subject)</h3>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="例如：國中理化、多益英文"
                  value={newSubjectLabel}
                  onChange={(e) => setNewSubjectLabel(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                >
                  新增科目
                </button>
              </div>
            </form>

            <form onSubmit={handleAddCustomUnit} className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">新增單元章節 (Sub-unit)</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedParentSubject}
                  onChange={(e) => setSelectedParentSubject(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
                >
                  {TAXONOMY_SEED_DATA.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                  {customTaxonomies.filter((n) => !n.parent_id).map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      [自訂] {cs.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="單元名稱 (如：有機反應機構)"
                  value={newUnitLabel}
                  onChange={(e) => setNewUnitLabel(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                >
                  新增單元
                </button>
              </div>
            </form>
          </div>

          {/* Existing Taxonomy Overview */}
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
              系統預設與自訂分類一覽
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {TAXONOMY_SEED_DATA.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">{s.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] font-medium">
                      預設
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9CA3AF]">
                    {s.children?.length ?? 0} 個核心章節單元
                  </div>
                </div>
              ))}

              {customTaxonomies.map((cs) => (
                <div
                  key={cs.id}
                  className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/40 space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">{cs.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
                        自訂
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] mt-1">
                      {cs.parent_id ? `上層科目 ID: ${cs.parent_id}` : '頂層自訂科目'}
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => handleDeleteCustomNode(cs.id)}
                      className="text-stone-400 hover:text-rose-500 p-1 transition-colors"
                      title="刪除自訂分類"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: API Keys */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6">
            <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold">iOS 捷徑 API Key 管理</h1>
                <p className="text-xs text-[#9CA3AF]">
                  產生傳輸金鑰供 iPad / iPhone 捷徑將照片拍完直接 POST 上傳至 Redolve
                </p>
              </div>
            </div>
          </div>

          {/* Newly Generated Key Alert Box */}
          {newKey && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-3xl p-6 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>新 API Key 已順利生成！此明文僅顯示一次，請立即複製：</span>
              </div>

              <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/40">
                <code className="text-xs font-mono text-[#374151] dark:text-[#D1D5DB] flex-1 truncate">
                  {newKey}
                </code>
                <button
                  onClick={handleCopyNewKey}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#6366F1] text-white text-xs font-medium hover:bg-[#4F46E5]"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? '已複製' : '複製 Key'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Generate Key Form */}
          <form onSubmit={handleCreateKey} className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
              新增 API 金鑰
            </h2>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="金鑰用途說明 (例如: iPad Pro 拍照捷徑)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 px-4 py-2 rounded-2xl text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
              />
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>生成 Key</span>
              </button>
            </div>
          </form>

          {/* Keys List */}
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
              已授權的 API Key 列表
            </h2>

            {loading ? (
              <div className="text-center py-6 text-xs text-[#9CA3AF]">載入金鑰中...</div>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#9CA3AF]">目前尚未建立任何 API Key。</div>
            ) : (
              <div className="space-y-3">
                {keys.map((k) => (
                  <div
                    key={k.key_hash}
                    className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]">
                        {k.description || '無備註'}
                      </div>
                      <div className="text-[11px] font-mono text-[#9CA3AF] mt-0.5">
                        前綴: {k.key_prefix}••••••••
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeKey(k.key_hash)}
                      className="p-2 rounded-xl text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="撤銷此 Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


