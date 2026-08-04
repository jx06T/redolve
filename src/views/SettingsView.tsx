import React, { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, ShieldCheck, Tag, Sliders, FolderPlus } from 'lucide-react';
import { fetchApiKeys, createApiKey, deleteApiKey } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { ApiKeyItem, TaxonomyNode } from '../types';
import { PEN_COLORS } from '../config/constants';

export const SettingsView: React.FC = () => {
  useSEO({
    title: '系統設定與 iOS 捷徑管理',
    description: '管理 iPad / iPhone 捷徑傳輸金鑰、自訂題庫科目與單元分類、手寫筆觸偏好設定。',
  });

  const {
    penColor,
    setPenColor,
    penWidth,
    setPenWidth,
    showToast,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'apikeys' | 'taxonomy' | 'pencil'>('apikeys');

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] p-1.5 rounded-2xl select-none">
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
      </div>

      {/* Tab 1: API Keys */}
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

      {/* Tab 3: iPad Pen & Handwriting Preferences */}
      {activeTab === 'pencil' && (
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-6">
          <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">iPad 手寫與筆觸偏好</h2>
              <p className="text-xs text-[#9CA3AF]">
                配置 iPad + Apple Pencil 預設筆觸顏色、粗細與自動滾動體驗
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-[#374151] dark:text-[#D1D5DB] mb-2">
                預設筆觸顏色 (Default Pen Color)
              </label>
              <div className="flex items-center space-x-3">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setPenColor(c);
                      showToast('已更新預設筆觸顏色', 'success', 1500);
                    }}
                    className={`w-9 h-9 rounded-2xl transition-all border-2 ${
                      penColor === c ? 'border-indigo-500 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`顏色 ${c}`}
                  />
                ))}
              </div>
            </div>

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
                        ? 'bg-[#6366F1] text-white border-[#6366F1]'
                        : 'bg-stone-50 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    {w}px {w === 1 ? '(細)' : w === 2 ? '(標準)' : '(粗)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 text-xs text-[#9CA3AF] space-y-1">
              <p className="font-semibold text-[#374151] dark:text-[#D1D5DB]">iPad 觸控手勢提示：</p>
              <p>• 雙指輕觸畫布可直接 Undo 復原上一步筆跡。</p>
              <p>• 運筆接近卡片底部 100px 時，畫布將平滑自動向下展延 400px。</p>
              <p>• 長按左下角懸浮按鈕可啟動彈簧橡皮擦，放開即刻回到原本筆觸。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

