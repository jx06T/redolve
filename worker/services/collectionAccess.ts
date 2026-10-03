import type { Bindings } from '../types';

export interface CollectionRecord {
  id: string;
  owner_id: string | null;
  kind: 'personal' | 'set' | 'single';
  title: string;
  description: string;
  public_name: string;
  lifecycle: 'draft' | 'active' | 'suspended' | 'deleted';
  visibility: 'restricted' | 'link' | 'public';
  listed: number;
  show_shared_ink: number;
  show_shared_notes: number;
  acl_version: number;
  row_version: number;
  created_at: string;
  updated_at: string;
}

export interface EntryRecord {
  id: string;
  collection_id: string;
  source_item_id: string | null;
  contributor_id: string | null;
  origin_item_key: string;
  state: 'included' | 'removed';
  generation: number;
  display_order: number;
  shared_seq: number;
  latest_add_event_seq: number | null;
}

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function cookieToken(cookieHeader: string | undefined, collectionId: string): string | null {
  const key = `rdv_collection_${collectionId}=`;
  const value = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(key));
  return value ? value.slice(key.length) : null;
}

export async function canReadCollection(
  env: Bindings,
  collection: CollectionRecord,
  userId: string | null | undefined,
  cookieHeader?: string,
): Promise<boolean> {
  if (userId && collection.owner_id === userId) return true;
  if (collection.kind === 'personal') return false;
  if (userId && await canContribute(env, collection, userId)) return true;
  if (collection.lifecycle !== 'active') return false;
  if (collection.visibility === 'public') return true;

  if (userId) {
    const grant = await env.DB.prepare(
      `SELECT 1 FROM collection_grants
       WHERE collection_id = ? AND kind = 'user' AND user_id = ?
         AND revoked_at IS NULL AND (expires_at IS NULL OR datetime(expires_at)>CURRENT_TIMESTAMP) LIMIT 1`
    ).bind(collection.id, userId).first();
    if (grant) return true;
  }
  if (collection.visibility !== 'link') return false;

  if (userId) {
    const holder = await env.DB.prepare(
      `SELECT 1 FROM grant_holders h JOIN collection_grants l ON l.id = h.grant_id
       WHERE h.user_id = ? AND l.collection_id = ? AND l.kind = 'link'
         AND l.revoked_at IS NULL
         AND (l.expires_at IS NULL OR datetime(l.expires_at)>CURRENT_TIMESTAMP) LIMIT 1`
    ).bind(userId, collection.id).first();
    if (holder) return true;
  }
  const rawToken = cookieToken(cookieHeader, collection.id);
  if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) return false;
  const tokenHash = await hashToken(rawToken);
  const validLink = await env.DB.prepare(
    `SELECT 1 FROM collection_grants
     WHERE collection_id = ? AND kind = 'link' AND token_hash = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR datetime(expires_at)>CURRENT_TIMESTAMP) LIMIT 1`
  ).bind(collection.id, tokenHash).first();
  return Boolean(validLink);
}

export async function loadCollection(env: Bindings, id: string | undefined): Promise<CollectionRecord | null> {
  return env.DB.prepare('SELECT * FROM collections WHERE id = ? AND lifecycle != ?')
    .bind(id || '', 'deleted').first<CollectionRecord>();
}

export async function canContribute(env: Bindings, collection: CollectionRecord, userId: string): Promise<boolean> {
  if (collection.owner_id === userId) return true;
  if (collection.kind === 'personal' || collection.lifecycle === 'deleted') return false;
  const grant = await env.DB.prepare(`SELECT 1 FROM collection_grants
    WHERE collection_id=? AND kind='user' AND role='contributor' AND user_id=?
      AND revoked_at IS NULL AND (expires_at IS NULL OR datetime(expires_at)>CURRENT_TIMESTAMP) LIMIT 1`)
    .bind(collection.id, userId).first();
  return Boolean(grant);
}

export async function liveEntry(env: Bindings, entryId: string | undefined, collectionId: string): Promise<EntryRecord | null> {
  return env.DB.prepare(`SELECT ci.* FROM collection_items ci JOIN items i ON i.id=ci.source_item_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    JOIN collections co ON co.id=ci.collection_id
    WHERE ci.id=? AND ci.collection_id=? AND ci.state='included'
      AND ci.contributor_id=i.user_id AND
      (co.owner_id=ci.contributor_id OR EXISTS(
        SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
          AND g.kind='user' AND g.role='contributor' AND g.user_id=ci.contributor_id
          AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`)
    .bind(entryId || '', collectionId).first<EntryRecord>();
}

export function apiError(code: string, message: string) {
  return { error: { code, message } };
}
