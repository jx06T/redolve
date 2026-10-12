import { LoginNotice } from '../components/LoginNotice';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CollectionsHubView } from './CollectionsHubView';
import { SubscriptionManagement } from './SubscriptionManagement';
import { PendingWorkPanel } from '../components/PendingWorkPanel';
import { ProfileSettingsSection } from '../components/settings/ProfileSettingsSection';
import { isGuestUser } from '../utils/guest';
import { Sliders, Tag, UserRound, Users, BookOpen } from 'lucide-react';
import { fetchApiKeys, fetchTaxonomyTree } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { ApiKeyItem, TaxonomyNode } from '../types';
import { PencilSettingsSection } from '../components/settings/PencilSettingsSection';
import { TaxonomySettingsSection } from '../components/settings/TaxonomySettingsSection';
import { ApiKeySettingsSection } from '../components/settings/ApiKeySettingsSection';
import { HomeWidgetSettings } from '../components/HomeWidgets';

type SettingsTab = 'pencil' | 'taxonomy' | 'profile' | 'collections' | 'subscriptions';
const VALID_TABS: SettingsTab[] = ['pencil', 'taxonomy', 'profile', 'collections', 'subscriptions'];

const getInitialTab = (): SettingsTab => {
  if (typeof window !== 'undefined') {
    const raw=window.location.hash.slice(1);const hash=(raw==='apikeys'?'profile':raw) as SettingsTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
  }
  return 'pencil';
};

export const SettingsView: React.FC = () => {
  const location=useLocation(); const navigate=useNavigate();
  useEffect(()=>{const raw=location.hash.slice(1);const tab=(raw==='apikeys'?'profile':raw) as SettingsTab;if(VALID_TABS.includes(tab))setActiveTab(tab);},[location.hash]);
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
    if (!isGuestUser(currentUser)) void loadKeys();
    else { setKeys([]); setLoadingKeys(false); }
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
      navigate(`/settings#${tab}`);
    }
  };


  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PendingWorkPanel/>
      <div role="group" aria-label="設定分類" className="flex overflow-x-auto gap-1.5 rounded-2xl border border-border-subtle bg-surface p-1.5">{([
        ['pencil','筆觸偏好',Sliders],['taxonomy','科目分類',Tag],['profile','個人檔案',UserRound],['collections','共用集管理',Users],['subscriptions','訂閱中心',BookOpen],
      ] as const).map(([tab,label,Icon])=><button key={tab} aria-pressed={activeTab===tab} onClick={()=>handleTabChange(tab)} className={'flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors '+(activeTab===tab?'bg-primary text-white':'text-text-main hover:bg-neutral-100')}><Icon size={16}/>{label}</button>)}</div>
      {activeTab==='collections'&&<CollectionsHubView/>}
      {activeTab==='subscriptions'&&<SubscriptionManagement/>}
      {/* Tab 1: iPad Pen & Handwriting Preferences */}
      {activeTab === 'pencil' && <PencilSettingsSection />}

      {/* Tab 2: Custom Taxonomy Tree Management */}
      {activeTab === 'taxonomy' && (
        !isGuestUser(currentUser) ? <TaxonomySettingsSection
          customTaxonomies={customTaxonomies}
          countsMap={countsMap}
          loadTaxonomyData={loadTaxonomyData}
        /> : <LoginNotice description="自訂科目與單元需要登入後才能跨裝置保存；訪客仍可使用既有課綱分類。"/>
      )}

      {/* Tab 3: API Keys */}
      {activeTab === 'profile' && (
        <><ProfileSettingsSection><ApiKeySettingsSection keys={keys} loadingKeys={loadingKeys} loadKeys={loadKeys} /></ProfileSettingsSection><HomeWidgetSettings /></>
      )}
    </div>
  );
};
