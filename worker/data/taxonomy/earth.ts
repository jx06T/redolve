import { TaxonomyNode } from '../../types';

// 地球科學 (Earth Science)
export const earthTaxonomy: TaxonomyNode = {
  id: 'earth',
  parent_id: null,
  label: '高中地科',
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
        { id: 'earth-atmos-typhoon', parent_id: 'earth-atmos', label: '台灣的災變天氣(颱風)', level: 2 },
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
};
