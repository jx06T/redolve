import React, { useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, ShieldCheck } from 'lucide-react';
import { ApiKeyItem } from '../../types';
import { useStore } from '../../store/useStore';
import { createApiKey, deleteApiKey } from '../../services/api';
import { ConfirmModal } from '../ConfirmModal';

interface ApiKeySettingsSectionProps {
  keys: ApiKeyItem[];
  loadingKeys: boolean;
  loadKeys: () => Promise<void>;
}

export const ApiKeySettingsSection: React.FC<ApiKeySettingsSectionProps> = ({
  keys,
  loadingKeys,
  loadKeys,
}) => {
  const { showToast } = useStore();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<string | null>(null);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createApiKey(description.trim() || 'iPad 捷徑 Key');
      setNewKey(res.key);
      setDescription('');
      await loadKeys();
      showToast('API Key 生成成功！請記得妥善保存。', 'success');
    } catch (err) {
      console.error('Failed to create key:', err);
      showToast('生成金鑰失敗', 'error');
    }
  };

  const confirmRevokeKey = async () => {
    if (!revokeKeyTarget) return;
    try {
      await deleteApiKey(revokeKeyTarget);
      await loadKeys();
      showToast('已撤銷該 API Key', 'info');
    } catch (err) {
      console.error('Failed to revoke key:', err);
      showToast('撤銷失敗', 'error');
    } finally {
      setRevokeKeyTarget(null);
    }
  };

  const handleCopyNewKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  };

  return (
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

        {loadingKeys ? (
          <div className="text-center py-6 text-xs text-[#9CA3AF]">載入金鑰中...</div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#9CA3AF]">目前尚未建立任何 API Key。</div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.key_prefix}
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
                  onClick={() => setRevokeKeyTarget(k.key_prefix)}
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

      {/* Revoke Modal */}
      <ConfirmModal
        isOpen={Boolean(revokeKeyTarget)}
        title="撤銷 API Key"
        message="確定要撤銷此 API Key 嗎？使用此 Key 的 iOS 捷徑將無法再上傳錯題。"
        confirmText="確定撤銷"
        cancelText="取消"
        isDestructive={true}
        onConfirm={confirmRevokeKey}
        onCancel={() => setRevokeKeyTarget(null)}
      />
    </div>
  );
};
