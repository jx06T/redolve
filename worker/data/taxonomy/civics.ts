import { TaxonomyNode } from '../../types';

// 公民：目前只有單元，待後續資料補齊再加入子分類。
const units = [
  ['citizenship-rights', '公民身分與權利保障'],
  ['sovereignty-identity', '國家主權與國家認同'],
  ['justice-social-security', '公平正義與社會安全'],
  ['democracy-government', '民主政治與政府體制'],
  ['public-opinion-media', '民意、媒體與民主治理'],
  ['political-participation', '公民的政治參與'],
  ['social-norms', '與人民相關的社會規範'],
  ['constitution-human-rights', '憲法與人權、權利主體'],
  ['administrative-law', '行政法與人權保障'],
  ['contract-labor', '契約自由與勞動參與'],
  ['property-rights', '財產權的保障'],
  ['criminal-law', '刑法與人權保障'],
  ['resource-allocation', '資源有限與分配'],
  ['supply-demand', '需求與供給'],
  ['market-government', '市場機能與政府管制'],
  ['incentives-trade', '誘因、分工與自由貿易'],
  ['national-income-sustainability', '國民所得與永續發展'],
  ['market-failure', '市場失靈與因應對策'],
] as const;

export const civicsTaxonomy: TaxonomyNode = {
  id: 'civics',
  parent_id: null,
  label: '高中公民',
  level: 0,
  children: units.map(([slug, label]) => ({
    id: `civics-${slug}`,
    parent_id: 'civics',
    label,
    level: 1,
  })),
};
