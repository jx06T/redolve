import { TaxonomyNode } from '../../types';

// 生物 (Biology)
export const biologyTaxonomy: TaxonomyNode = {
  id: 'bio',
  parent_id: null,
  label: '高中生物',
  level: 0,
  children: [
    // ================= 第一部分：高一必修生物（學測範圍） =================
    {
      id: 'bio-cell',
      parent_id: 'bio',
      label: '生命的特性與細胞',
      level: 1,
      children: [
        { id: 'bio-cell-intro', parent_id: 'bio-cell', label: '生命現象與細胞學說的發展', level: 2 },
        { id: 'bio-cell-struct', parent_id: 'bio-cell', label: '原核與真核細胞的構造', level: 2 },
        { id: 'bio-cell-energy', parent_id: 'bio-cell', label: '細胞與能量 (基礎)', level: 2 },
      ],
    },
    {
      id: 'bio-genetics',
      parent_id: 'bio',
      label: '生殖與遺傳',
      level: 1,
      children: [
        { id: 'bio-genetics-division', parent_id: 'bio-genetics', label: '染色體與細胞分裂', level: 2 },
        { id: 'bio-genetics-mendel', parent_id: 'bio-genetics', label: '孟德爾與性狀的遺傳', level: 2 },
        { id: 'bio-genetics-material', parent_id: 'bio-genetics', label: '遺傳物質 (DNA與RNA)', level: 2 },
        { id: 'bio-genetics-tech', parent_id: 'bio-genetics', label: '基因轉殖技術', level: 2 },
      ],
    },
    {
      id: 'bio-evolution',
      parent_id: 'bio',
      label: '演化與生物多樣性',
      level: 1,
      children: [
        { id: 'bio-evolution-theory', parent_id: 'bio-evolution', label: '生物的演化', level: 2 },
        { id: 'bio-evolution-tree', parent_id: 'bio-evolution', label: '生命樹', level: 2 },
        { id: 'bio-evolution-diversity', parent_id: 'bio-evolution', label: '生物多樣性', level: 2 },
      ],
    },

    // ================= 第二部分：選修生物（加深加廣 / 分科測驗範圍） =================
    {
      id: 'bio-adv-cell',
      parent_id: 'bio',
      label: '※細胞學與能量運轉 (進階)',
      level: 1,
      children: [
        { id: 'bio-adv-cell-compound', parent_id: 'bio-adv-cell', label: '細胞化合物與細胞構造', level: 2 },
        { id: 'bio-adv-cell-photo', parent_id: 'bio-adv-cell', label: '光合作用', level: 2 },
        { id: 'bio-adv-cell-resp', parent_id: 'bio-adv-cell', label: '呼吸作用', level: 2 },
      ],
    },
    {
      id: 'bio-adv-tissue',
      parent_id: 'bio',
      label: '※動植物的組織',
      level: 1,
      children: [
        { id: 'bio-adv-tissue-plant', parent_id: 'bio-adv-tissue', label: '植物的組織', level: 2 },
        { id: 'bio-adv-tissue-animal', parent_id: 'bio-adv-tissue', label: '動物的組織', level: 2 },
      ],
    },
    {
      id: 'bio-adv-plant',
      parent_id: 'bio',
      label: '※植物體的構造與功能',
      level: 1,
      children: [
        { id: 'bio-adv-plant-nutri', parent_id: 'bio-adv-plant', label: '營養構造與功能', level: 2 },
        { id: 'bio-adv-plant-repro', parent_id: 'bio-adv-plant', label: '生殖構造與功能', level: 2 },
        { id: 'bio-adv-plant-stimuli', parent_id: 'bio-adv-plant', label: '對環境刺激的反應', level: 2 },
      ],
    },
    {
      id: 'bio-adv-animal',
      parent_id: 'bio',
      label: '※動物體的構造與功能',
      level: 1,
      children: [
        { id: 'bio-adv-animal-circ', parent_id: 'bio-adv-animal', label: '循環系統', level: 2 },
        { id: 'bio-adv-animal-digest', parent_id: 'bio-adv-animal', label: '消化系統', level: 2 },
        { id: 'bio-adv-animal-resp-exc', parent_id: 'bio-adv-animal', label: '呼吸與排泄系統', level: 2 },
        { id: 'bio-adv-animal-immune', parent_id: 'bio-adv-animal', label: '防禦系統', level: 2 },
        { id: 'bio-adv-animal-repro', parent_id: 'bio-adv-animal', label: '生殖系統', level: 2 },
        { id: 'bio-adv-animal-nervous', parent_id: 'bio-adv-animal', label: '感應與協調', level: 2 },
      ],
    },
    {
      id: 'bio-adv-ecology',
      parent_id: 'bio',
      label: '※生物與環境',
      level: 1,
      // 無次章節，作為獨立 level 1 節點 (進階生態學)
    },
  ],
};
