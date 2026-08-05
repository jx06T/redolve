import { TaxonomyNode } from '../../types';

// 英文 (English)
export const englishTaxonomy: TaxonomyNode = {
  id: 'english',
  parent_id: null,
  label: '高中英文',
  level: 0,
  children: [
    // 依照你的要求，直接將題型作為 Level 1 且不設次章節
    {
      id: 'eng-vocab',
      parent_id: 'english',
      label: '單字',
      level: 1,
    },
    {
      id: 'eng-cloze',
      parent_id: 'english',
      label: '克漏字',
      level: 1,
    },
    {
      id: 'eng-fill',
      parent_id: 'english',
      label: '文意選填',
      level: 1,
    },
    {
      id: 'eng-discourse',
      parent_id: 'english',
      label: '篇章結構',
      level: 1,
    },
    {
      id: 'eng-reading',
      parent_id: 'english',
      label: '閱讀',
      level: 1,
    },
    {
      id: 'eng-mixed',
      parent_id: 'english',
      label: '混合題',
      level: 1,
    },
    {
      id: 'eng-translation',
      parent_id: 'english',
      label: '翻譯',
      level: 1,
    },
    {
      id: 'eng-writing',
      parent_id: 'english',
      label: '英文作文',
      level: 1,
    },
  ],
};
