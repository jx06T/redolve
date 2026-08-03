import { TaxonomyNode } from '../types';

export const TAXONOMY_SEED_DATA: TaxonomyNode[] = [
  // 數學 (Math)
  {
    id: 'math',
    parent_id: null,
    label: '高中數學',
    level: 0,
    children: [
      {
        id: 'math-num-algebra',
        parent_id: 'math',
        label: '數與式',
        level: 1,
        children: [
          { id: 'math-real-num', parent_id: 'math-num-algebra', label: '實數與算幾不等式', level: 2 },
          { id: 'math-polynomial', parent_id: 'math-num-algebra', label: '多項式與餘式定理', level: 2 },
        ],
      },
      {
        id: 'math-linear-algebra',
        parent_id: 'math',
        label: '直線與圓',
        level: 1,
        children: [
          { id: 'math-line-eq', parent_id: 'math-linear-algebra', label: '直線方程式與斜率', level: 2 },
          { id: 'math-circle-eq', parent_id: 'math-linear-algebra', label: '圓方程式與切線', level: 2 },
        ],
      },
      {
        id: 'math-trig',
        parent_id: 'math',
        label: '三角函數',
        level: 1,
        children: [
          { id: 'math-trig-ratio', parent_id: 'math-trig', label: '三角比與正餘弦定理', level: 2 },
          { id: 'math-trig-func', parent_id: 'math-trig', label: '三角函數圖形與和差角', level: 2 },
        ],
      },
      {
        id: 'math-exp-log',
        parent_id: 'math',
        label: '指數與對數',
        level: 1,
        children: [
          { id: 'math-exp-func', parent_id: 'math-exp-log', label: '指數函數與律則', level: 2 },
          { id: 'math-log-func', parent_id: 'math-exp-log', label: '對數首數尾數與應用', level: 2 },
        ],
      },
      {
        id: 'math-seq-series',
        parent_id: 'math',
        label: '數列與級數',
        level: 1,
        children: [
          { id: 'math-arith-geom', parent_id: 'math-seq-series', label: '等差與等比級數', level: 2 },
          { id: 'math-induction', parent_id: 'math-seq-series', label: '數學歸納法', level: 2 },
        ],
      },
      {
        id: 'math-probability',
        parent_id: 'math',
        label: '排列組合與機率',
        level: 1,
        children: [
          { id: 'math-perm-comb', parent_id: 'math-probability', label: '排列組合與二項式定理', level: 2 },
          { id: 'math-bayes', parent_id: 'math-probability', label: '條件機率與貝氏定理', level: 2 },
        ],
      },
      {
        id: 'math-vector',
        parent_id: 'math',
        label: '平面與空間向量',
        level: 1,
        children: [
          { id: 'math-dot-product', parent_id: 'math-vector', label: '向量內積與正射影', level: 2 },
          { id: 'math-spatial-geom', parent_id: 'math-vector', label: '空間平面與直線方程式', level: 2 },
        ],
      },
      {
        id: 'math-matrix',
        parent_id: 'math',
        label: '矩陣與線性聯立方程',
        level: 1,
        children: [
          { id: 'math-matrix-op', parent_id: 'math-matrix', label: '矩陣運算與反矩陣', level: 2 },
          { id: 'math-linear-trans', parent_id: 'math-matrix', label: '二維線性變換與旋轉', level: 2 },
        ],
      },
      {
        id: 'math-calculus',
        parent_id: 'math',
        label: '微積分極限與導函數',
        level: 1,
        children: [
          { id: 'math-limit', parent_id: 'math-calculus', label: '極限與連續', level: 2 },
          { id: 'math-derivative', parent_id: 'math-calculus', label: '導函數與積分極值', level: 2 },
        ],
      },
    ],
  },
  // 物理 (Physics)
  {
    id: 'physics',
    parent_id: null,
    label: '高中物理',
    level: 0,
    children: [
      {
        id: 'phys-kinematics',
        parent_id: 'physics',
        label: '直線與平面運動',
        level: 1,
      },
      {
        id: 'phys-dynamics',
        parent_id: 'physics',
        label: '牛頓運動定律與萬有引力',
        level: 1,
      },
      {
        id: 'phys-work-energy',
        parent_id: 'physics',
        label: '功與能量守恆',
        level: 1,
      },
      {
        id: 'phys-momentum',
        parent_id: 'physics',
        label: '動量與碰撞守恆',
        level: 1,
      },
      {
        id: 'phys-electromagnetism',
        parent_id: 'physics',
        label: '電磁學與冷次定律',
        level: 1,
      },
      {
        id: 'phys-optics-waves',
        parent_id: 'physics',
        label: '波動與光學干涉雙狹縫',
        level: 1,
      },
    ],
  },
  // 化學 (Chemistry)
  {
    id: 'chem',
    parent_id: null,
    label: '高中化學',
    level: 0,
    children: [
      {
        id: 'chem-stoichiometry',
        parent_id: 'chem',
        label: '化學計量與莫耳濃度',
        level: 1,
      },
      {
        id: 'chem-atomic-struct',
        parent_id: 'chem',
        label: '原子結構與週期表',
        level: 1,
      },
      {
        id: 'chem-equilibrium',
        parent_id: 'chem',
        label: '化學平衡與酸鹼滴定',
        level: 1,
      },
      {
        id: 'chem-redox-elec',
        parent_id: 'chem',
        label: '氧化還原與電化學電池',
        level: 1,
      },
      {
        id: 'chem-organic',
        parent_id: 'chem',
        label: '有機化學與聚合物',
        level: 1,
      },
    ],
  },
  // 生物 (Biology)
  {
    id: 'bio',
    parent_id: null,
    label: '高中生物',
    level: 0,
    children: [
      { id: 'bio-cell', parent_id: 'bio', label: '細胞結構與能量轉化', level: 1 },
      { id: 'bio-genetics', parent_id: 'bio', label: '遺傳學與 DNA 重組', level: 1 },
      { id: 'bio-physiology', parent_id: 'bio', label: '人體生理與神經內分泌', level: 1 },
      { id: 'bio-ecology', parent_id: 'bio', label: '生態系與生物多樣性', level: 1 },
    ],
  },
];
