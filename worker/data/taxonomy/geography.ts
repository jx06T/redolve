import { TaxonomyNode } from '../../types';

function chapter(slug: string, label: string, sections: readonly (readonly [string, string])[]): TaxonomyNode {
  const id = `geo-${slug}`;
  return {
    id,
    parent_id: 'geography',
    label,
    level: 1,
    children: sections.map(([sectionSlug, sectionLabel]) => ({
      id: `${id}-${sectionSlug}`,
      parent_id: id,
      label: sectionLabel,
      level: 2,
    })),
  };
}

export const geographyTaxonomy: TaxonomyNode = {
  id: 'geography',
  parent_id: null,
  label: '高中地理',
  level: 0,
  children: [
    // 地理技能
    chapter('research', '地理學的研究觀點與方法', [
      ['scope', '地理學的研究內涵'],
      ['perspectives', '地理學的研究與觀點'],
      ['methods', '地理學的研究方法'],
      ['data-analysis', '地理資料的整理、分析與展示'],
    ]),
    chapter('maps', '地圖概說', [
      ['elements', '地圖五要素'],
      ['grid', '地理網線'],
      ['projection', '地圖投影'],
      ['taiwan-coordinates', '臺灣地圖的坐標系統'],
      ['types', '地圖種類'],
      ['reading', '地圖判讀與量測'],
    ]),
    chapter('gis', '地理資訊', [
      ['system', '地理資訊系統'],
      ['functions', '地理資訊系統的功能'],
    ]),
    // 地理系統
    chapter('climate-water', '氣候與水文', [
      ['elements', '氣候要素'],
      ['circulation', '大氣環流與洋流系統'],
      ['climate-zones', '氣候類型與自然景觀'],
      ['water-resources', '氣候、水資源'],
    ]),
    chapter('landforms', '地形', [
      ['processes', '地形系統與營力'],
      ['river', '河流地形'],
      ['coast', '海岸地形'],
      ['karst', '石灰岩地形（岩溶地形）'],
      ['aeolian', '風成地形'],
      ['glacial', '冰河地形'],
    ]),
    chapter('population', '人口', [
      ['growth', '人口成長與人口轉型'],
      ['composition', '人口組成與人口金字塔'],
      ['distribution', '人口分布'],
      ['migration', '人口遷移'],
    ]),
    chapter('settlements', '聚落、交通與區域', [
      ['system', '聚落系統'],
      ['transport', '交通運輸與聚落系統'],
      ['central-place', '中地體系'],
    ]),
    chapter('urban', '都市', [
      ['growth', '都市化與都市成長'],
      ['spatial-structure', '都市內部空間結構'],
      ['planning', '都市問題與都市計畫'],
    ]),
    chapter('industries', '產業活動', [
      ['primary', '第一級產業'],
      ['secondary', '第二級產業'],
      ['tertiary', '第三級產業'],
      ['transformation', '產業轉型'],
      ['knowledge-economy', '知識經濟下的產業經營特色'],
    ]),
    chapter('world-system', '世界體系', [
      ['origins', '世界體系的形成背景'],
      ['structure', '世界體系結構'],
    ]),
    // 地理視野
    chapter('taiwan-world', '臺灣與世界', [
      ['environment', '自然環境的特殊性'],
      ['culture', '多元的文化特色'],
      ['economy', '經濟發展與世界的連結'],
    ]),
    chapter('east-asia', '東亞文化圈的形成與發展', [
      ['environment', '東亞文化圈形成的環境背景'],
      ['economic-transition', '經濟崛起與轉型的歷程'],
      ['population-environment', '人口與環境問題'],
    ]),
    chapter('southeast-asia', '東西文化接觸與區域發展—東南亞', [
      ['environment', '過渡性的環境背景'],
      ['culture', '多元的文化景觀'],
      ['economy', '經濟發展與轉型'],
    ]),
    chapter('south-asia', '東西文化接觸與區域發展—南亞', [
      ['environment', '東西文化接觸的環境背景'],
      ['culture', '多元的文化景觀'],
      ['economy', '經濟發展與轉型'],
    ]),
    chapter('australasia', '從孤立到樞紐—澳洲與紐西蘭', [
      ['isolation', '位置孤立的紐澳'],
      ['migration', '族群與移民社會的發展'],
      ['industry-geopolitics', '產業發展與地緣樞紐'],
    ]),
    chapter('islamic-world', '伊斯蘭世界的形成與發展—西亞北非', [
      ['environment', '自然環境'],
      ['arid-life', '乾燥氣候下的生活方式'],
      ['culture', '伊斯蘭文化'],
      ['geopolitics', '風雲詭譎的伊斯蘭世界'],
    ]),
    chapter('europe', '歐洲文明的發展與擴散', [
      ['environment', '文明發展與環境間的關係'],
      ['expansion', '歐洲的崛起與擴張'],
      ['integration', '區域整合的契機與挑戰'],
    ]),
    chapter('united-states', '超級強國的興起與挑戰—美國', [
      ['environment', '環境背景'],
      ['immigration', '移民社會的文化特色'],
      ['industry-urbanism', '產業發展與都市文明'],
    ]),
    chapter('latin-america', '南方區域的發展與挑戰—中南美洲', [
      ['environment', '自然環境背景'],
      ['colonial-politics', '列強入侵與政治發展'],
      ['colonial-economy', '殖民地式經濟的發展'],
    ]),
    chapter('subsaharan-africa', '南方區域的發展與挑戰—漠南非洲', [
      ['environment', '自然環境背景'],
      ['colonial-politics', '列強入侵與政治發展'],
      ['colonial-economy', '殖民地式經濟的發展'],
    ]),
    chapter('globalization', '全球化', [
      ['development', '全球化定義與發展'],
      ['economic-restructuring', '經濟地理空間重組'],
    ]),
  ],
};
