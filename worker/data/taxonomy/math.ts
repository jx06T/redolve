import { TaxonomyNode } from '../../types';

// 數學 (Math)
export const mathTaxonomy: TaxonomyNode = {
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
};
