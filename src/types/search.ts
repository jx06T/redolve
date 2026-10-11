import type { Item } from './index';

export type SearchScope = 'mine' | 'shared' | 'public';
export type SearchHit = {
  origin: 'owned' | 'saved' | 'shared' | 'public' | 'collection';
  id: string; title: string | null; topic_id: string | null; topic_label: string | null;
  keywords: string | null; typed_notes: string | null; status: Item['status'] | null;
  review_count: number | null; created_at: string; collection_id: string | null;
  collection_title: string | null; provider_name: string | null; saved_id: string | null;
  relevance_score: number; problem?: Item;
};
export type SearchPage = { items: SearchHit[]; next_offset: number | null; scope: SearchScope;
  /** Client transport metadata; never used as permission to read a question. */
  cache_validator?: string; cache_version?: string };
