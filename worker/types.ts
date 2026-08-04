// Worker Environment Bindings and Type Definitions

export interface Bindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;
  GEMINI_API_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  /** Comma-separated Google account emails with admin access. Replaces ADMIN_SECRET. */
  ADMIN_EMAILS?: string;
  /** Google OAuth 2.0 Client ID (better-auth Google provider) */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth 2.0 Client Secret (better-auth Google provider) */
  GOOGLE_CLIENT_SECRET?: string;
  AI_PROVIDER?: string;
  ALLOWED_ORIGINS?: string;
  ENV?: string;
}

export interface Variables {
  userId: string;
  /** Authenticated user's Google email, resolved by authMiddleware. */
  userEmail: string | null;
}

export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// DrawData JSON Schema (v1.3.0)
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
  expansions?: { addedHeight: number; atY: number }[];
}

export interface VectorClock {
  clientId: string;
  seq: number;
}

// Taxonomy Node Types
export interface TaxonomyNode {
  id: string;
  parent_id: string | null;
  label: string;
  level: number;
  children?: TaxonomyNode[];
}

// Database Row Types
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface ApiKeyRow {
  key_hash: string;
  key_prefix: string;
  user_id: string;
  description: string | null;
  created_at: string;
}

export interface ItemRow {
  id: string;
  user_id: string;
  type: string;
  topic_id: string | null;
  keywords: string | null;
  keyword_tokens: string | null;
  source: string | null;
  image_url: string;
  draw_data: string | null;
  status: 'processing' | 'unsolved' | 'resolved';
  review_count: number;
  vector_clock: string | null;
  updated_at: string;
  created_at: string;
}

export interface ShareRow {
  token: string;
  item_id: string;
  user_id: string;
  allow_ink: number;
  expires_at: string | null;
  created_at: string;
}
