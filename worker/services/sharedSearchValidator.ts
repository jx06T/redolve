import type { Bindings } from '../types';
import { hashToken } from './collectionAccess';

// Bump when the shared-search response or matching semantics change.
const SEARCH_CONTRACT = 'shared-search-v1';
export async function sharedSearchValidator(env: Bindings, collectionId: string, userId: string, params: URLSearchParams) {
  let version: { revision: number; user_revision: number; expired_grants: number } | null;
  try {
    // Current contributor access and counters are read together. No item/notes scan.
    version = await env.DB.prepare(`SELECT v.revision,COALESCE(uv.revision,0) AS user_revision,
      (SELECT COUNT(*) FROM collection_grants g WHERE g.collection_id=co.id
        AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL
        AND g.expires_at IS NOT NULL AND datetime(g.expires_at)<=CURRENT_TIMESTAMP) AS expired_grants
      FROM collections co JOIN collection_search_versions v ON v.collection_id=co.id
      JOIN collection_search_cache_config cfg ON cfg.id=1 AND cfg.schema_version=1 AND cfg.ready=1
      LEFT JOIN collection_search_user_versions uv ON uv.collection_id=co.id AND uv.user_id=?2
      WHERE co.id=?1 AND co.kind!='personal' AND co.lifecycle!='deleted'
        AND (co.owner_id=?2 OR EXISTS(SELECT 1 FROM collection_grants g
          WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor' AND g.user_id=?2
            AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`)
      .bind(collectionId, userId).first<typeof version>();
  } catch (error) {
    // A rolling deployment may precede the additive migration. Never validate from incomplete counters.
    if (error instanceof Error && /no such table: collection_search_(?:versions|user_versions|cache_config)\b/.test(error.message)) return null;
    throw error;
  }
  if (!version) return null;
  const scopeVersion = await hashToken(JSON.stringify([SEARCH_CONTRACT, userId, collectionId,
    version.revision, version.user_revision, version.expired_grants]));
  const normalized = new URLSearchParams(params); normalized.set('q', (params.get('q') || '').trim()); normalized.sort();
  const etag = `W/"${await hashToken(scopeVersion + ':' + normalized)}"`;
  return { etag, scopeVersion };
}
