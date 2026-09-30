import { TaxonomyNode } from '../../types';

// 歷史：目前只有單元，待後續資料補齊再加入子分類。
const units = [
  ['multicultural-society', '多元族群社會的形成'],
  ['modern-state', '現代國家的形塑'],
  ['economic-cultural-diversity', '經濟與文化的多樣性'],
  ['state-society', '國家與社會'],
  ['migration-exchange', '人群的移動與交流'],
  ['modernization', '現代化的歷程'],
  ['europe-modern-world', '歐洲文化與現代世界'],
  ['cultural-encounters', '文化的交會與多元世界的發展'],
  ['global-change-modernity', '世界變遷與現代性'],
] as const;

export const historyTaxonomy: TaxonomyNode = {
  id: 'history',
  parent_id: null,
  label: '高中歷史',
  level: 0,
  children: units.map(([slug, label]) => ({
    id: `history-${slug}`,
    parent_id: 'history',
    label,
    level: 1,
  })),
};
