import { TaxonomyNode } from '../../types';

// 國文 (Chinese)
export const chineseTaxonomy: TaxonomyNode = {
  id: 'chinese',
  parent_id: null,
  label: '高中國文',
  level: 0,
  children: [
    {
      id: 'chi-basic',
      parent_id: 'chinese',
      label: '語文基本知識',
      level: 1,
      children: [
        { id: 'chi-basic-pronounce', parent_id: 'chi-basic', label: '字音字形', level: 2 },
        { id: 'chi-basic-meaning', parent_id: 'chi-basic', label: '字義與詞義', level: 2 },
        { id: 'chi-basic-idiom', parent_id: 'chi-basic', label: '成語與慣用語', level: 2 },
        { id: 'chi-basic-grammar', parent_id: 'chi-basic', label: '語法與修辭', level: 2 },
      ],
    },
    {
      id: 'chi-lit-knowledge',
      parent_id: 'chinese',
      label: '國學與文學常識',
      level: 1,
      children: [
        { id: 'chi-lit-knowledge-history', parent_id: 'chi-lit-knowledge', label: '國學常識 (經史子集、流派)', level: 2 },
        { id: 'chi-lit-knowledge-author', parent_id: 'chi-lit-knowledge', label: '作家與作品生平', level: 2 },
        { id: 'chi-lit-knowledge-couplet', parent_id: 'chi-lit-knowledge', label: '題辭、對聯與詠人詠物', level: 2 },
      ],
    },
    {
      id: 'chi-read-classic',
      parent_id: 'chinese',
      label: '閱讀理解 (古典文本)',
      level: 1,
      children: [
        { id: 'chi-read-classic-core', parent_id: 'chi-read-classic', label: '核心古文 (15篇)', level: 2 },
        { id: 'chi-read-classic-ext', parent_id: 'chi-read-classic', label: '課外古典散文與小說', level: 2 },
        { id: 'chi-read-classic-poem', parent_id: 'chi-read-classic', label: '古典詩、詞、曲', level: 2 },
      ],
    },
    {
      id: 'chi-read-modern',
      parent_id: 'chinese',
      label: '閱讀理解 (現代文本)',
      level: 1,
      children: [
        { id: 'chi-read-modern-prose', parent_id: 'chi-read-modern', label: '現代白話文 (散文、小說)', level: 2 },
        { id: 'chi-read-modern-poem', parent_id: 'chi-read-modern', label: '現代詩', level: 2 },
        { id: 'chi-read-modern-chart', parent_id: 'chi-read-modern', label: '圖表與跨領域文本', level: 2 },
      ],
    },
    {
      id: 'chi-mixed-writing',
      parent_id: 'chinese',
      label: '混合題與國寫',
      level: 1,
      children: [
        { id: 'chi-mixed-writing-mixed', parent_id: 'chi-mixed-writing', label: '混合題型', level: 2 },
        { id: 'chi-mixed-writing-intellectual', parent_id: 'chi-mixed-writing', label: '知性寫作', level: 2 },
        { id: 'chi-mixed-writing-emotional', parent_id: 'chi-mixed-writing', label: '情意寫作', level: 2 },
      ],
    },
  ],
};
