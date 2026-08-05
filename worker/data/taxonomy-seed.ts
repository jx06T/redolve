import { TaxonomyNode } from '../types';

export const TAXONOMY_SEED_DATA: TaxonomyNode[] = [
  // 數學 (Math)
  {
    id: 'math',
    parent_id: null,
    label: '高中數學',
    level: 0,
    children: [
      // ================= 第一部分：必修與學測範圍 =================
      {
        id: 'math-num-expr',
        parent_id: 'math',
        label: '數與式',
        level: 1,
        children: [
          { id: 'math-num-expr-real', parent_id: 'math-num-expr', label: '實數', level: 2 },
          { id: 'math-num-expr-ops', parent_id: 'math-num-expr', label: '式的運算', level: 2 },
          { id: 'math-num-expr-abs', parent_id: 'math-num-expr', label: '絕對值', level: 2 },
        ],
      },
      {
        id: 'math-exp-log',
        parent_id: 'math',
        label: '指數與對數',
        level: 1,
        children: [
          { id: 'math-exp-log-exp', parent_id: 'math-exp-log', label: '指數', level: 2 },
          { id: 'math-exp-log-common', parent_id: 'math-exp-log', label: '常用對數', level: 2 },
          { id: 'math-exp-log-exp-func', parent_id: 'math-exp-log', label: '指數函數及其圖形', level: 2 },
          { id: 'math-exp-log-log-func', parent_id: 'math-exp-log', label: '對數函數及其圖形', level: 2 },
          { id: 'math-exp-log-app', parent_id: 'math-exp-log', label: '指數與對數函數的應用', level: 2 },
        ],
      },
      {
        id: 'math-line-circle',
        parent_id: 'math',
        label: '直線與圓',
        level: 1,
        children: [
          { id: 'math-line-circle-line', parent_id: 'math-line-circle', label: '直線方程式', level: 2 },
          { id: 'math-line-circle-circle', parent_id: 'math-line-circle', label: '圓', level: 2 },
        ],
      },
      {
        id: 'math-polynomial',
        parent_id: 'math',
        label: '多項式函數',
        level: 1,
        children: [
          { id: 'math-poly-div', parent_id: 'math-polynomial', label: '多項式的除法', level: 2 },
          { id: 'math-poly-1st-2nd', parent_id: 'math-polynomial', label: '一次與二次函數', level: 2 },
          { id: 'math-poly-3rd', parent_id: 'math-polynomial', label: '三次函數', level: 2 },
          { id: 'math-poly-ineq', parent_id: 'math-polynomial', label: '多項式不等式', level: 2 },
        ],
      },
      {
        id: 'math-seq-series',
        parent_id: 'math',
        label: '數列與級數',
        level: 1,
        children: [
          { id: 'math-seq-series-seq', parent_id: 'math-seq-series', label: '數列', level: 2 },
          { id: 'math-seq-series-series', parent_id: 'math-seq-series', label: '級數', level: 2 },
        ],
      },
      {
        id: 'math-perm-comb',
        parent_id: 'math',
        label: '排列組合',
        level: 1,
        children: [
          { id: 'math-perm-comb-logic', parent_id: 'math-perm-comb', label: '數學的邏輯與集合', level: 2 },
          { id: 'math-perm-comb-sys', parent_id: 'math-perm-comb', label: '有系統的計數排列組合', level: 2 },
        ],
      },
      {
        id: 'math-classical-prob',
        parent_id: 'math',
        label: '古典機率',
        level: 1,
        children: [
          { id: 'math-classical-prob-comp', parent_id: 'math-classical-prob', label: '複合事件的古典機率', level: 2 },
          { id: 'math-classical-prob-exp', parent_id: 'math-classical-prob', label: '期望值', level: 2 },
        ],
      },
      {
        id: 'math-data-analysis',
        parent_id: 'math',
        label: '數據分析',
        level: 1,
        children: [
          { id: 'math-data-analysis-1d', parent_id: 'math-data-analysis', label: '一維數據分析', level: 2 },
          { id: 'math-data-analysis-2d', parent_id: 'math-data-analysis', label: '二維數據分析', level: 2 },
        ],
      },
      {
        id: 'math-trig',
        parent_id: 'math',
        label: '三角函數',
        level: 1,
        children: [
          { id: 'math-trig-ratio', parent_id: 'math-trig', label: '三角比', level: 2 },
          { id: 'math-trig-radian', parent_id: 'math-trig', label: '弧度量', level: 2 },
          { id: 'math-trig-formulas', parent_id: 'math-trig', label: '常用的三角比公式', level: 2 },
          { id: 'math-trig-graph', parent_id: 'math-trig', label: '三角函數的圖形', level: 2 },
          { id: 'math-trig-superpos', parent_id: 'math-trig', label: '正餘弦函數的疊合', level: 2 },
        ],
      },
      {
        id: 'math-plane-vec',
        parent_id: 'math',
        label: '平面向量',
        level: 1,
        children: [
          { id: 'math-plane-vec-ops', parent_id: 'math-plane-vec', label: '平面向量的運算', level: 2 },
          { id: 'math-plane-vec-dot', parent_id: 'math-plane-vec', label: '平面向量的內積', level: 2 },
          { id: 'math-plane-vec-app', parent_id: 'math-plane-vec', label: '平面向量的應用', level: 2 },
          { id: 'math-plane-vec-prop', parent_id: 'math-plane-vec', label: '平面上的比例模型', level: 2 },
        ],
      },
      {
        id: 'math-space-vec',
        parent_id: 'math',
        label: '空間向量',
        level: 1,
        children: [
          { id: 'math-space-vec-concept', parent_id: 'math-space-vec', label: '空間概念', level: 2 },
          { id: 'math-space-vec-coord', parent_id: 'math-space-vec', label: '空間向量的座標表示法', level: 2 },
          { id: 'math-space-vec-dot', parent_id: 'math-space-vec', label: '空間向量的內積', level: 2 },
          { id: 'math-space-vec-cross', parent_id: 'math-space-vec', label: '外積、體積與行列式', level: 2 },
          { id: 'math-space-vec-sphere', parent_id: 'math-space-vec', label: '球面與經緯度', level: 2 },
        ],
      },
      {
        id: 'math-space-geom',
        parent_id: 'math',
        label: '空間中的平面與直線',
        level: 1,
        children: [
          { id: 'math-space-geom-plane', parent_id: 'math-space-geom', label: '平面方程式', level: 2 },
          { id: 'math-space-geom-line', parent_id: 'math-space-geom', label: '空間中的直線方程式', level: 2 },
        ],
      },
      {
        id: 'math-prob-bayes',
        parent_id: 'math',
        label: '條件機率與貝氏定理',
        level: 1,
        children: [
          { id: 'math-prob-bayes-cond', parent_id: 'math-prob-bayes', label: '條件機率與獨立事件', level: 2 },
          { id: 'math-prob-bayes-thm', parent_id: 'math-prob-bayes', label: '貝氏定理與主觀、客觀機率', level: 2 },
        ],
      },
      {
        id: 'math-matrix-eq',
        parent_id: 'math',
        label: '矩陣與線性方程組',
        level: 1,
        children: [
          { id: 'math-matrix-eq-sys', parent_id: 'math-matrix-eq', label: '一次方程組', level: 2 },
          { id: 'math-matrix-eq-ops', parent_id: 'math-matrix-eq', label: '矩陣的運算', level: 2 },
          { id: 'math-matrix-eq-app', parent_id: 'math-matrix-eq', label: '矩陣的應用', level: 2 },
        ],
      },
      {
        id: 'math-conic-intro',
        parent_id: 'math',
        label: '圓錐曲線的認識與應用',
        level: 1,
        // 無次章節，作為獨立 level 1 節點
      },

      // ================= 第二部分：選修範圍 / 分科測驗 =================
      {
        id: 'math-limit-func',
        parent_id: 'math',
        label: '※極限與函數',
        level: 1,
        children: [
          { id: 'math-limit-func-seq', parent_id: 'math-limit-func', label: '數列及其極限', level: 2 },
          { id: 'math-limit-func-geom', parent_id: 'math-limit-func', label: '無窮等比級數', level: 2 },
          { id: 'math-limit-func-prop', parent_id: 'math-limit-func', label: '函數與函數圖形的性質', level: 2 },
          { id: 'math-limit-func-limit', parent_id: 'math-limit-func', label: '函數的極限', level: 2 },
        ],
      },
      {
        id: 'math-calculus',
        parent_id: 'math',
        label: '※微積分',
        level: 1,
        children: [
          { id: 'math-calculus-diff', parent_id: 'math-calculus', label: '微分', level: 2 },
          { id: 'math-calculus-riemann', parent_id: 'math-calculus', label: '黎曼和', level: 2 },
          { id: 'math-calculus-int', parent_id: 'math-calculus', label: '積分', level: 2 },
          { id: 'math-calculus-app', parent_id: 'math-calculus', label: '積分的應用', level: 2 },
        ],
      },
      {
        id: 'math-complex-eq',
        parent_id: 'math',
        label: '※複數與方程式',
        level: 1,
        children: [
          { id: 'math-complex-eq-poly', parent_id: 'math-complex-eq', label: '複數與多項式方程式', level: 2 },
          { id: 'math-complex-eq-geom', parent_id: 'math-complex-eq', label: '複數的幾何意涵', level: 2 },
        ],
      },
      {
        id: 'math-conic',
        parent_id: 'math',
        label: '※二次曲線',
        level: 1,
        children: [
          { id: 'math-conic-sections', parent_id: 'math-conic', label: '圓錐截痕與二次曲線', level: 2 },
          { id: 'math-conic-parabola', parent_id: 'math-conic', label: '拋物線', level: 2 },
          { id: 'math-conic-ellipse', parent_id: 'math-conic', label: '橢圓', level: 2 },
          { id: 'math-conic-hyperbola', parent_id: 'math-conic', label: '雙曲線', level: 2 },
        ],
      },
      {
        id: 'math-random-var',
        parent_id: 'math',
        label: '※隨機變數與機率分布',
        level: 1,
        children: [
          { id: 'math-random-var-discrete', parent_id: 'math-random-var', label: '離散型隨機變數', level: 2 },
          { id: 'math-random-var-dist', parent_id: 'math-random-var', label: '二項分布與幾何分布', level: 2 },
        ],
      },
      {
        id: 'math-linear-prog',
        parent_id: 'math',
        label: '※線性規劃',
        level: 1,
        // 無次章節，作為獨立 level 1 節點
      },
    ],
  },
  {
    id: 'physics',
    parent_id: null,
    label: '高中物理',
    level: 0,
    children: [
      // ================= 第一部分：高一必修物理（學測範圍） =================
      {
        id: 'phys-science-method',
        parent_id: 'physics',
        label: '科學態度與方法',
        level: 1,
        children: [
          { id: 'phys-science-method-dev', parent_id: 'phys-science-method', label: '物理學的發展與科學態度', level: 2 },
          { id: 'phys-science-method-si', parent_id: 'phys-science-method', label: '物理量與國際單位制 (SI制)', level: 2 },
        ],
      },
      {
        id: 'phys-motion',
        parent_id: 'physics',
        label: '物體的運動',
        level: 1,
        children: [
          { id: 'phys-motion-kinematics', parent_id: 'phys-motion', label: '運動學 (位置、速度與加速度)', level: 2 },
          { id: 'phys-motion-newton', parent_id: 'phys-motion', label: '牛頓運動定律', level: 2 },
        ],
      },
      {
        id: 'phys-matter-interaction',
        parent_id: 'physics',
        label: '物質的組成與交互作用',
        level: 1,
        children: [
          { id: 'phys-matter-interaction-particle', parent_id: 'phys-matter-interaction', label: '物質的組成與基本粒子', level: 2 },
          { id: 'phys-matter-interaction-force', parent_id: 'phys-matter-interaction', label: '四大基本交互作用與摩擦力', level: 2 },
        ],
      },
      {
        id: 'phys-electromagnetism',
        parent_id: 'physics',
        label: '電與磁的統一',
        level: 1,
        children: [
          { id: 'phys-electromagnetism-mag', parent_id: 'phys-electromagnetism', label: '電流的磁效應', level: 2 },
          { id: 'phys-electromagnetism-induct', parent_id: 'phys-electromagnetism', label: '電磁感應與電磁波', level: 2 },
        ],
      },
      {
        id: 'phys-energy',
        parent_id: 'physics',
        label: '能量',
        level: 1,
        children: [
          { id: 'phys-energy-work', parent_id: 'phys-energy', label: '功與動能', level: 2 },
          { id: 'phys-energy-conserv', parent_id: 'phys-energy', label: '能量的轉換與守恆 (含核能)', level: 2 },
        ],
      },
      {
        id: 'phys-quantum',
        parent_id: 'physics',
        label: '量子現象',
        level: 1,
        children: [
          { id: 'phys-quantum-photoelectric', parent_id: 'phys-quantum', label: '光電效應', level: 2 },
          { id: 'phys-quantum-duality', parent_id: 'phys-quantum', label: '波粒二象性與原子光譜', level: 2 },
        ],
      },

      // ================= 第二部分：選修物理（加深加廣 / 分科測驗範圍） =================
      {
        id: 'phys-elec-mech1',
        parent_id: 'physics',
        label: '※力學一',
        level: 1,
        children: [
          { id: 'phys-elec-mech1-linear', parent_id: 'phys-elec-mech1', label: '直線運動', level: 2 },
          { id: 'phys-elec-mech1-planar', parent_id: 'phys-elec-mech1', label: '平面運動', level: 2 },
          { id: 'phys-elec-mech1-newton', parent_id: 'phys-elec-mech1', label: '牛頓運動定律', level: 2 },
          { id: 'phys-elec-mech1-periodic', parent_id: 'phys-elec-mech1', label: '週期運動', level: 2 },
          { id: 'phys-elec-mech1-gravity', parent_id: 'phys-elec-mech1', label: '萬有引力', level: 2 },
        ],
      },
      {
        id: 'phys-elec-mech2',
        parent_id: 'physics',
        label: '※力學二與熱學',
        level: 1,
        children: [
          { id: 'phys-elec-mech2-momentum', parent_id: 'phys-elec-mech2', label: '動量與角動量', level: 2 },
          { id: 'phys-elec-mech2-energy', parent_id: 'phys-elec-mech2', label: '功與能量', level: 2 },
          { id: 'phys-elec-mech2-newton-app', parent_id: 'phys-elec-mech2', label: '牛頓運動定律的應用', level: 2 },
          { id: 'phys-elec-mech2-heat', parent_id: 'phys-elec-mech2', label: '熱學', level: 2 },
        ],
      },
      {
        id: 'phys-elec-wave',
        parent_id: 'physics',
        label: '※波動、光及聲音',
        level: 1,
        children: [
          { id: 'phys-elec-wave-wave', parent_id: 'phys-elec-wave', label: '波動', level: 2 },
          { id: 'phys-elec-wave-sound', parent_id: 'phys-elec-wave', label: '聲波', level: 2 },
          { id: 'phys-elec-wave-refract', parent_id: 'phys-elec-wave', label: '光的折射及其應用', level: 2 },
          { id: 'phys-elec-wave-interfere', parent_id: 'phys-elec-wave', label: '光的干涉與繞射', level: 2 },
        ],
      },
      {
        id: 'phys-elec-em1',
        parent_id: 'physics',
        label: '※電磁現象一',
        level: 1,
        children: [
          { id: 'phys-elec-em1-static', parent_id: 'phys-elec-em1', label: '靜電學', level: 2 },
          { id: 'phys-elec-em1-mag', parent_id: 'phys-elec-em1', label: '電流的磁效應', level: 2 },
          { id: 'phys-elec-em1-induct', parent_id: 'phys-elec-em1', label: '電磁感應', level: 2 },
        ],
      },
      {
        id: 'phys-elec-em2',
        parent_id: 'physics',
        label: '※電磁現象二與量子現象',
        level: 1,
        children: [
          { id: 'phys-elec-em2-circuit', parent_id: 'phys-elec-em2', label: '電路學', level: 2 },
          { id: 'phys-elec-em2-quantum', parent_id: 'phys-elec-em2', label: '量子現象', level: 2 },
          { id: 'phys-elec-em2-atom', parent_id: 'phys-elec-em2', label: '原子結構', level: 2 },
        ],
      },
    ],
  },
  {
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
  },
  {
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
          { id: 'bio-cell-energy', parent_id: 'bio-cell', label: '細胞與能量 (基礎概念)', level: 2 },
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
          { id: 'bio-adv-tissue-plant', parent_id: 'bio-adv-tissue', label: '植物的組織 (分生、表皮、基本、維管束組織)', level: 2 },
          { id: 'bio-adv-tissue-animal', parent_id: 'bio-adv-tissue', label: '動物的組織 (上皮、結締、肌肉、神經組織)', level: 2 },
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
  },
  {
    id: 'earth',
    parent_id: null,
    label: '高中地球科學',
    level: 0,
    children: [
      // ================= 1. 固體地球 =================
      {
        id: 'earth-solid',
        parent_id: 'earth',
        label: '固體地球 (地質與板塊)',
        level: 1,
        children: [
          { id: 'earth-solid-history', parent_id: 'earth-solid', label: '地質年代與地球歷史', level: 2 },
          { id: 'earth-solid-struct', parent_id: 'earth-solid', label: '地球內部構造與地震波', level: 2 },
          { id: 'earth-solid-plate-theory', parent_id: 'earth-solid', label: '板塊構造學說', level: 2 },
          { id: 'earth-solid-plate-activity', parent_id: 'earth-solid', label: '板塊邊界的地質活動', level: 2 },
        ],
      },
      // ================= 2. 大氣 =================
      {
        id: 'earth-atmos',
        parent_id: 'earth',
        label: '大氣 (氣象與天氣)',
        level: 1,
        children: [
          { id: 'earth-atmos-struct', parent_id: 'earth-atmos', label: '大氣結構與能量平衡', level: 2 },
          { id: 'earth-atmos-moisture', parent_id: 'earth-atmos', label: '大氣的水氣與濕度', level: 2 },
          { id: 'earth-atmos-wind', parent_id: 'earth-atmos', label: '大氣的運動與風', level: 2 },
          { id: 'earth-atmos-typhoon', parent_id: 'earth-atmos', label: '台灣的災變天氣：颱風', level: 2 },
        ],
      },
      // ================= 3. 宇宙 =================
      {
        id: 'earth-space',
        parent_id: 'earth',
        label: '宇宙 (天文與星象)',
        level: 1,
        children: [
          { id: 'earth-space-motion', parent_id: 'earth-space', label: '天球與星體的視運動', level: 2 },
          { id: 'earth-space-bright', parent_id: 'earth-space', label: '恆星的亮度與光度', level: 2 },
          { id: 'earth-space-spectrum', parent_id: 'earth-space', label: '恆星的光譜與觀測', level: 2 },
        ],
      },
      // ================= 4. 海洋 =================
      {
        id: 'earth-ocean',
        parent_id: 'earth',
        label: '海洋 (海水運動與海氣交互)',
        level: 1,
        children: [
          { id: 'earth-ocean-current', parent_id: 'earth-ocean', label: '洋流與溫鹽環流', level: 2 },
          { id: 'earth-ocean-wave', parent_id: 'earth-ocean', label: '波浪與海域安全', level: 2 },
          { id: 'earth-ocean-tide', parent_id: 'earth-ocean', label: '潮汐現象', level: 2 },
          { id: 'earth-ocean-enso', parent_id: 'earth-ocean', label: '海氣交互作用 (聖嬰與反聖嬰)', level: 2 },
        ],
      },
      // ================= 5. 氣候變遷與永續發展 =================
      {
        id: 'earth-climate',
        parent_id: 'earth',
        label: '氣候變遷與永續發展',
        level: 1,
        children: [
          { id: 'earth-climate-change', parent_id: 'earth-climate', label: '全球氣候變遷 (含米蘭科維奇循環)', level: 2 },
          { id: 'earth-climate-sustain', parent_id: 'earth-climate', label: '地球環境與永續發展', level: 2 },
        ],
      },
    ],
  },
];
