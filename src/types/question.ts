import type { DrawData, Item } from './index';
import type { Collection, SavedDetail, SharedLayer } from '../services/sharingApi';

export type StudySource = 'owned' | 'saved' | 'contributing';
export type QuestionRef =
  | { kind: 'owned'; itemId: string }
  | { kind: 'saved'; savedRefId: string }
  | { kind: 'collection'; collectionId: string; entryId: string };
export type WorkTarget =
  | { kind: 'saved'; savedRefId: string }
  | { kind: 'shared'; collectionId: string; entryId: string; generation: number };
export type QuestionWork = {
  target: WorkTarget; ink: DrawData; notes: string; inkSeq: number; notesSeq: number;
};
export type CollectionItemDetail = {
  progress?: ReviewProgress;
  collection: Pick<Collection,'id'|'title'|'show_shared_ink'|'show_shared_notes'> & {visibility?:Collection['visibility'];is_owner?:boolean};
  entry: { id: string; generation: number; shared_seq: number; latest_add_event_seq: number|null };
  source: { id: string; source: string|null; keywords: string|null; topic_id?:string|null;
    topic_label: string|null; content_seq: number; provider_name: string|null; contributor_id?:string };
  layers: SharedLayer[];
  capabilities: { can_contribute: boolean; can_save: boolean };
};
export type ReviewProgress={status:'unsolved'|'resolved'|'archived';previous_status:'unsolved'|'resolved';review_count:number;row_version:number};
export type WorkContent = {
  ref: Exclude<QuestionRef,{kind:'owned'}>; title: string; image: string;
  topic: string|null; collectionId?:string; collectionTitle:string; provider:string;
  work: QuestionWork;
  layers: { id:string; author:string; notes:string; ink?:DrawData; authorId?:string }[];
  saved?: SavedDetail; shared?:CollectionItemDetail;
};
export type Question = { ref:QuestionRef; title:string; owned?:Item };
export type Subscription = {
  collection_id:string;title?:string;last_known_title:string;public_name?:string;
  can_read:boolean;subscribed_at:string;last_viewed_at?:string|null;unread_count?:number;
  role?:'owner'|'contributor'|'viewer';
};
