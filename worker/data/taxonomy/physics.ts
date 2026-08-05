import { TaxonomyNode } from '../../types';

// 物理 (Physics)
export const physicsTaxonomy: TaxonomyNode = {
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
};
