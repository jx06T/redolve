import { TaxonomyNode } from '../../types';

// 化學 (Chemistry)
export const chemistryTaxonomy: TaxonomyNode = {
  id: 'chem',
  parent_id: null,
  label: '高中化學',
  level: 0,
  children: [
    // ================= 第一部分：高一必修化學（學測範圍） =================
    {
      id: 'chem-composition',
      parent_id: 'chem',
      label: '物質的組成',
      level: 1,
      children: [
        { id: 'chem-comp-class', parent_id: 'chem-composition', label: '物質的分類與分離', level: 2 },
        { id: 'chem-comp-atom', parent_id: 'chem-composition', label: '原子、分子與原子量', level: 2 },
        { id: 'chem-comp-mole', parent_id: 'chem-composition', label: '莫耳數與化學計量', level: 2 },
      ],
    },
    {
      id: 'chem-structure',
      parent_id: 'chem',
      label: '物質的構造與反應',
      level: 1,
      children: [
        { id: 'chem-struct-periodic', parent_id: 'chem-structure', label: '原子結構與元素週期表', level: 2 },
        { id: 'chem-struct-bond', parent_id: 'chem-structure', label: '八隅體規則與化學鍵 (離子鍵、共價鍵、金屬鍵)', level: 2 },
        { id: 'chem-struct-rxn', parent_id: 'chem-structure', label: '化學反應式與反應熱', level: 2 },
      ],
    },
    {
      id: 'chem-solution',
      parent_id: 'chem',
      label: '溶液與反應',
      level: 1,
      children: [
        { id: 'chem-sol-conc', parent_id: 'chem-solution', label: '溶液的本質與濃度', level: 2 },
        { id: 'chem-sol-solubility', parent_id: 'chem-solution', label: '溶解度', level: 2 },
        { id: 'chem-sol-rxns', parent_id: 'chem-solution', label: '常見的化學反應 (酸鹼反應、氧化還原)', level: 2 },
      ],
    },
    {
      id: 'chem-life',
      parent_id: 'chem',
      label: '生活中的化學',
      level: 1,
      children: [
        { id: 'chem-life-bio', parent_id: 'chem-life', label: '食品與生化分子 (醣類、蛋白質、脂質)', level: 2 },
        { id: 'chem-life-med', parent_id: 'chem-life', label: '藥品、清潔劑與先進材料', level: 2 },
        { id: 'chem-life-env', parent_id: 'chem-life', label: '環境與永續化學', level: 2 },
      ],
    },

    // ================= 第二部分：選修化學（加深加廣 / 分科測驗範圍） =================
    {
      id: 'chem-elec1',
      parent_id: 'chem',
      label: '※選修化學(1) 物質與溶液',
      level: 1,
      children: [
        { id: 'chem-elec1-ident', parent_id: 'chem-elec1', label: '物質鑑定與反應', level: 2 },
        { id: 'chem-elec1-gas', parent_id: 'chem-elec1', label: '氣體', level: 2 },
        { id: 'chem-elec1-colligative', parent_id: 'chem-elec1', label: '溶液的依數性質', level: 2 },
      ],
    },
    {
      id: 'chem-elec2',
      parent_id: 'chem',
      label: '※選修化學(2) 結構與反應速率',
      level: 1,
      children: [
        { id: 'chem-elec2-atom', parent_id: 'chem-elec2', label: '原子結構與週期性', level: 2 },
        { id: 'chem-elec2-bond', parent_id: 'chem-elec2', label: '化學鍵與物質結構', level: 2 },
        { id: 'chem-elec2-rate', parent_id: 'chem-elec2', label: '反應速率', level: 2 },
      ],
    },
    {
      id: 'chem-elec3',
      parent_id: 'chem',
      label: '※選修化學(3) 化學平衡',
      level: 1,
      children: [
        { id: 'chem-elec3-eq', parent_id: 'chem-elec3', label: '化學平衡', level: 2 },
        { id: 'chem-elec3-precip', parent_id: 'chem-elec3', label: '沉澱反應與溶解平衡', level: 2 },
        { id: 'chem-elec3-acidbase', parent_id: 'chem-elec3', label: '酸鹼鹽', level: 2 },
      ],
    },
    {
      id: 'chem-elec4',
      parent_id: 'chem',
      label: '※選修化學(4) 氧化還原與元素',
      level: 1,
      children: [
        { id: 'chem-elec4-redox', parent_id: 'chem-elec4', label: '氧化還原反應', level: 2 },
        { id: 'chem-elec4-electro', parent_id: 'chem-elec4', label: '電化學', level: 2 },
        { id: 'chem-elec4-element', parent_id: 'chem-elec4', label: '非金屬元素與金屬元素', level: 2 },
      ],
    },
    {
      id: 'chem-elec5',
      parent_id: 'chem',
      label: '※選修化學(5) 有機化學與應用',
      level: 1,
      children: [
        { id: 'chem-elec5-hc', parent_id: 'chem-elec5', label: '有機化合物－烴類', level: 2 },
        { id: 'chem-elec5-func', parent_id: 'chem-elec5', label: '有機化合物－含官能基的有機物', level: 2 },
        { id: 'chem-elec5-poly', parent_id: 'chem-elec5', label: '聚合物', level: 2 },
        { id: 'chem-elec5-ind', parent_id: 'chem-elec5', label: '化學與化工', level: 2 },
      ],
    },
  ],
};
