export interface Stroke {
  color: string;
  width: number;
  opacity?: number;
  points: [number, number, number][]; // [x, y, pressure]
  tool?: 'pen' | 'highlighter';
}

export interface EraserMask {
  strokeIdx: number;
  segmentRange: [number, number][]; // [startT, endT] in [0, 1]
}

export interface DrawData {
  strokes: Stroke[];
  eraserMasks: EraserMask[];
  baseWidth?: number;
  baseHeight?: number;
  calcSpaceHeight?: number;
  expansions?: { addedHeight: number; atY: number }[];
}

export interface TaxonomyNode {
  id: string;
  user_id?: string | null;
  parent_id: string | null;
  label: string;
  level: number;
  children?: TaxonomyNode[];
}

export interface Item {
  id: string;
  user_id: string;
  type: string;
  topic_id: string | null;
  keywords: string | null; // JSON string array
  keyword_tokens: string | null;
  source: string | null;
  image_url: string;
  draw_data: string | null; // JSON string or DrawData
  typed_notes?: string | null;
  status: 'processing' | 'unsolved' | 'resolved' | 'archived';
  review_count: number;
  vector_clock: string | null;
  updated_at: string;
  created_at: string;
}

export interface ApiKeyItem {
  key_hash: string;
  key_prefix: string;
  description: string | null;
  created_at: string;
}

export interface DashboardData {
  summary: {
    total: number;
    resolved: number;
    unsolved: number;
    archived?: number;
    processing: number;
  };
  subjects: {
    subject_id: string;
    subject_label: string;
    total: number;
    resolved: number;
  }[];
  top_unsolved_topics: {
    topic_id: string;
    topic_label: string;
    unsolved_count: number;
  }[];
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role?: string | null;
  created_at?: string;
  isDevFallback?: boolean;
}

