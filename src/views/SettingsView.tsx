import React, { useEffect, useState } from 'react';
import { Sliders, Tag, Key } from 'lucide-react';
import { fetchApiKeys, fetchTaxonomyTree } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { ApiKeyItem, TaxonomyNode } from '../types';
import { PencilSettingsSection } from '../components/settings/PencilSettingsSection';
import { TaxonomySettingsSection } from '../components/settings/TaxonomySettingsSection';
import { ApiKeySettingsSection } from '../components/settings/ApiKeySettingsSection';

type SettingsTab = 'pencil' | 'taxonomy' | 'apikeys';
const VALID_TABS: SettingsTab[] = ['pencil', 'taxonomy', 'apikeys'];

const getInitialTab = (): SettingsTab => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '') as SettingsTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
  }
  return 'pencil';
};

export const SettingsView: React.FC = () => {
  useSEO({
    title: '系統設定與 iOS 捷徑管理',
    description: '管理 iPad / iPhone 捷徑傳輸金鑰、自訂題庫科目與單元分類、手寫筆觸自訂顏色與偏好設定。',
  });

  const { currentUser, setTaxonomies, taxonomyCounts } = useStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(true);

  // Custom taxonomy state
  const [customTaxonomies, setCustomTaxonomies] = useState<TaxonomyNode[]>([]);
  const [countsMap, setCountsMap] = useState<Record<string, number>>({});

  const loadKeys = async () => {
    try {
      setLoadingKeys(true);
      const res = await fetchApiKeys();
      setKeys(res.keys || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadTaxonomyData = async () => {
    try {
      const res = await fetchTaxonomyTree();
      setCustomTaxonomies(res.customNodes || []);
      const currentTree = res.tree && res.tree.length > 0 ? res.tree : TAXONOMY_SEED_DATA;
      setTaxonomies(currentTree);
      if (res.counts) {
        setCountsMap(res.counts);
      }
    } catch (err) {
      console.error('Failed to load taxonomy:', err);
      setTaxonomies(TAXONOMY_SEED_DATA);
    }
  };

  useEffect(() => {
    loadKeys();
    loadTaxonomyData();
  }, [currentUser]);

  // Sync countsMap with store taxonomyCounts if available
  useEffect(() => {
    if (Object.keys(taxonomyCounts).length > 0) {
      setCountsMap((prev) => ({ ...prev, ...taxonomyCounts }));
    }
  }, [taxonomyCounts]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as SettingsTab;
      if (VALID_TABS.includes(hash)) {
        setActiveTab(hash);
      }
    };
    if (!window.location.hash || !VALID_TABS.includes(window.location.hash.replace('#', '') as SettingsTab)) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-surface border border-border-subtle p-1.5 rounded-2xl select-none">
        <button
          onClick={() => handleTabChange('pencil')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'pencil'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-main hover:bg-neutral-100'
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">iPad 筆觸偏好設定</span>
        </button>

        <button
          onClick={() => handleTabChange('taxonomy')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'taxonomy'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-main hover:bg-neutral-100'
          }`}
        >
          <Tag className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">自訂科目與單元分類</span>
        </button>

        <button
          onClick={() => handleTabChange('apikeys')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'apikeys'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-main hover:bg-neutral-100'
          }`}
        >
          <Key className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">iOS 捷徑 API Key</span>
        </button>
      </div>

      {/* Tab 1: iPad Pen & Handwriting Preferences */}
      {activeTab === 'pencil' && <PencilSettingsSection />}

      {/* Tab 2: Custom Taxonomy Tree Management */}
      {activeTab === 'taxonomy' && (
        <TaxonomySettingsSection
          customTaxonomies={customTaxonomies}
          countsMap={countsMap}
          loadTaxonomyData={loadTaxonomyData}
        />
      )}

      {/* Tab 3: API Keys */}
      {activeTab === 'apikeys' && (
        <ApiKeySettingsSection keys={keys} loadingKeys={loadingKeys} loadKeys={loadKeys} />
      )}
    </div>
  );
};
