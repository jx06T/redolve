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
  const { showToast, currentUser, setAuthModalOpen } = useStore();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<string | null>(null);

  const isGuest = !currentUser || (currentUser.id === 'dev_user_default' && !import.meta.env.DEV);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      setAuthModalOpen(true);
      return;
    }
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
      <div className="bg-surface border border-border-subtle rounded-3xl p-6">
        <div className="flex items-center space-x-3 text-text-main">
          <div className="p-2.5 bg-primary-50 text-primary rounded-2xl">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">iOS 捷徑 API Key 管理</h1>
            <p className="text-xs text-text-muted">
              產生傳輸金鑰供 iPad / iPhone 捷徑將照片拍完直接 POST 上傳至 Redolve
            </p>
          </div>
        </div>
      </div>

      {/* Guest Lock Notice Banner */}
      {isGuest && (
        <div className="p-6 rounded-3xl bg-primary-50/80 border border-primary-200/80 space-y-3 animate-in fade-in">
          <div className="flex items-center space-x-2.5 text-primary font-bold text-sm">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span>iOS 捷徑金鑰需綁定雲端會員帳號</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            iOS 截圖一鍵傳送捷徑會將照片自動歸屬到您的個人帳號。目前您處於訪客試用模式，請先登入 Google 帳號以取得專屬 API Key。
          </p>
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-primary text-white hover:bg-primary-hover text-xs font-semibold shadow-xs transition-all active:scale-95"
          >
            <span>登入 Google 帳號以啟用金鑰</span>
          </button>
        </div>
      )}

      {/* Newly Generated Key Alert Box */}
      {newKey && (
        <div className="bg-status-resolved/10 border border-status-resolved/20 rounded-3xl p-6 space-y-3">
          <div className="flex items-center space-x-2 text-status-resolved text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>新 API Key 已順利生成！此明文僅顯示一次，請立即複製：</span>
          </div>

          <div className="flex items-center space-x-2 bg-surface p-3 rounded-2xl border border-status-resolved/20">
            <code className="text-xs font-mono text-text-main flex-1 truncate">
              {newKey}
            </code>
            <button
              onClick={handleCopyNewKey}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors"
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? '已複製' : '複製 Key'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Generate Key Form */}
      <form onSubmit={handleCreateKey} className="bg-surface border border-border-subtle rounded-3xl p-6 space-y-4">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          新增 API 金鑰
        </h2>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="金鑰用途說明 (例如: iPad Pro 拍照捷徑)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 px-4 py-2 rounded-2xl text-xs bg-neutral-50 border border-border-subtle text-text-main focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-medium bg-primary text-white hover:bg-primary-hover shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>生成 Key</span>
          </button>
        </div>
      </form>

      {/* Keys List */}
      <div className="bg-surface border border-border-subtle rounded-3xl p-6 space-y-4">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          已授權的 API Key 列表
        </h2>

        {loadingKeys ? (
          <div className="text-center py-6 text-xs text-text-muted">載入金鑰中...</div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-xs text-text-muted">目前尚未建立任何 API Key。</div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.key_prefix}
                className="p-4 rounded-2xl bg-neutral-50 border border-border-subtle flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-text-main">
                    {k.description || '無備註'}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted mt-0.5">
                    前綴: {k.key_prefix}••••••••
                  </div>
                </div>

                <button
                  onClick={() => setRevokeKeyTarget(k.key_prefix)}
                  className="p-2 rounded-xl text-text-muted hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
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
