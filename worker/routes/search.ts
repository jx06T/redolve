import { Hono } from 'hono';
import type { Bindings, Variables, ItemRow } from '../types';
import { optionalAuthMiddleware } from '../middleware/auth';
import { apiError, hashToken } from '../services/collectionAccess';

export const searchRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
searchRouter.use('*', optionalAuthMiddleware);

type Hit = {
  origin: 'owned' | 'saved' | 'shared' | 'public' | 'collection';
  id: string; title: string | null; topic_id: string | null; topic_label: string | null;
  keywords: string | null; typed_notes: string | null; status: string | null;
  review_count: number | null; created_at: string; collection_id: string | null;
  collection_title: string | null; provider_name: string | null; saved_id: string | null;
  relevance_score: number; sort_priority: number;
};

searchRouter.get('/', async c => {
  const uid = c.get('userId');
  const scope = c.req.query('scope') || 'mine';
  const origin = c.req.query('origin') || 'all';
  const query = (c.req.query('q') || '').trim();
  const metadataOnly = c.req.query('metadata_only') === '1';
  const collectionId = c.req.query('collection_id') || '';
  const topic = c.req.query('topic_id') || '';
  const status = c.req.query('status') || '';
  const tag = c.req.query('tag') || '';
  const contributing = c.req.query('contributing') === 'yes';
  if(contributing && (!c.get('userId') || scope!=='shared' || !collectionId)) return c.json(apiError('INVALID_REQUEST','請選擇可貢獻集合'),400);
  const subscribed = c.req.query('subscribed') || '';
  const offset = Number(c.req.query('offset') || 0);
  const limit = Number(c.req.query('limit') || 30);
  if (!['mine', 'shared', 'public'].includes(scope) || !['all', 'owned', 'saved'].includes(origin)
    || (scope !== 'mine' && (origin !== 'all' || (status&&!contributing)))
    || (status && !['processing', 'unsolved', 'resolved', 'archived'].includes(status))
    || (subscribed && (scope !== 'shared' || subscribed !== 'yes'))
    || query.length > 200 || tag.length > 80 || collectionId.length > 80 || topic.length > 80
    || !Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - 50
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return c.json(apiError('INVALID_REQUEST', '搜尋範圍或條件無效'), 400);
  }
  if (!uid && scope !== 'public' && !(scope === 'shared' && collectionId))
    return c.json(apiError('UNAUTHORIZED', '請登入以搜尋個人或共用題庫'), 401);
  if (!query && c.req.query('browse')!=='1') return c.json({ items: [], next_offset: null, scope });

  // Numbered bindings let repeated ACL predicates share values without interpolating input.
  const values: (string | number)[] = [];
  const bind = (value: string | number) => { values.push(value); return `?${values.length}`; };
  const user = bind(uid || '');
  const term = bind(`%${query.replace(/[\\%_]/g, '\\$&')}%`);
  // Metadata is read from items, so legacy stale metadata in FTS cannot match.
  const match = bind(`problem_text : "${query.replace(/"/g, '""')}"*`);
  const collection = bind(collectionId);
  const like = (field: string) => `COALESCE(${field},'') LIKE ${term} ESCAPE '\\'`;
  const score = (fields: [string, number][]) => query ? fields.map(([field, weight]) =>
    `(CASE WHEN ${like(field)} THEN ${weight} ELSE 0 END)`).join('+') : '0';
  const contains = (fields: string[]) => fields.map(like).join(' OR ');
  const searchFilter = (fields: [string, number][]) => query
    ? ` AND (${contains(fields.map(([field]) => field))})` : '';
  const validGrant = (alias: string) => `${alias}.revoked_at IS NULL AND
    (${alias}.expires_at IS NULL OR datetime(${alias}.expires_at)>CURRENT_TIMESTAMP)`;
  const contributor = (who: string) => `(co.owner_id=${who} OR EXISTS(
    SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
      AND g.role='contributor' AND g.user_id=${who} AND ${validGrant('g')}))`;
  const namedAccess = `EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
    AND g.kind='user' AND g.user_id=${user} AND ${validGrant('g')})`;
  const heldLink = `(co.visibility='link' AND EXISTS(
    SELECT 1 FROM grant_holders h JOIN collection_grants g ON g.id=h.grant_id
    WHERE h.user_id=${user} AND g.collection_id=co.id AND g.kind='link' AND ${validGrant('g')}))`;
  const cookies: string[] = [];
  // Cookies grant only the corresponding collection, and still require a live link grant.
  for (const part of (c.req.header('cookie') || '').split(';').slice(0, 40)) {
    const found = part.trim().match(/^rdv_collection_([a-zA-Z0-9_-]{1,80})=([a-f0-9]{64})$/);
    if (!found || (collectionId && found[1] !== collectionId)) continue;
    const id = bind(found[1]);
    const hash = bind(await hashToken(found[2]));
    cookies.push(`(co.id=${id} AND co.visibility='link' AND EXISTS(
      SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='link'
        AND g.token_hash=${hash} AND ${validGrant('g')}))`);
  }
  const cookieAccess = cookies.length ? cookies.join(' OR ') : '0';
  const related = `(co.owner_id=${user} OR ${namedAccess} OR ${heldLink} OR ${cookieAccess}
    OR EXISTS(SELECT 1 FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=${user}))`;
  const readable = `(co.owner_id=${user} OR ${contributor(user)} OR (co.lifecycle='active'
    AND (co.visibility='public' OR ${namedAccess} OR ${heldLink} OR ${cookieAccess})))`;
  const publicGate = `co.lifecycle='active' AND co.visibility='public' AND co.listed=1`;
  const liveFrom = `FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    LEFT JOIN taxonomies t ON t.id=i.topic_id AND t.user_id IS NULL
    LEFT JOIN public_profiles p ON p.user_id=ci.contributor_id`;
  const liveGate = `ci.state='included' AND co.kind!='personal' AND co.lifecycle!='deleted'
    AND ${contributor('ci.contributor_id')}`;
  const topicFilter = (column: string, personal: boolean) => {
    if (!topic) return '';
    if(topic==='unclassified')return ` AND ${column} IS NULL`;
    const root = bind(topic);
    const allowed = personal ? `(user_id IS NULL OR user_id=${user})` : 'user_id IS NULL';
    return ` AND ${column} IN (WITH RECURSIVE descendants(id) AS (
      SELECT id FROM taxonomies WHERE id=${root} AND ${allowed}
      UNION SELECT child.id FROM taxonomies child JOIN descendants parent ON child.parent_id=parent.id
        WHERE ${personal ? `(child.user_id IS NULL OR child.user_id=${user})` : 'child.user_id IS NULL'}
    ) SELECT id FROM descendants)`;
  };
  const tagFilter = (fields: string[]) => {
    if (!tag) return '';
    const value = bind(tag);
    return ` AND (${fields.map(field => `EXISTS(SELECT 1 FROM json_each(
      CASE WHEN json_valid(${field}) THEN ${field} ELSE '[]' END) WHERE value=${value})`).join(' OR ')})`;
  };
  const parts: string[] = [];
  if (scope === 'mine' && origin !== 'saved') {
    const fields: [string, number][] = [['i.keywords', 100], ['i.keyword_tokens', 100],
      ['i.source', 60], ['i.typed_notes', 40], ['f.problem_text', 10], ['t.label', 10]];
    parts.push(`SELECT 'owned' AS origin,i.id,i.source AS title,i.topic_id,t.label AS topic_label,
      i.keywords,${metadataOnly ? 'NULL' : 'i.typed_notes'} AS typed_notes,i.status,i.review_count,i.created_at,
      NULL AS collection_id,NULL AS collection_title,NULL AS provider_name,NULL AS saved_id,
      ${query ? `(CASE WHEN ${like('i.keywords')} OR ${like('i.keyword_tokens')} THEN 100 ELSE 0 END)
      +${score(fields.slice(2))}+CASE WHEN i.id IN (SELECT id FROM fts_hits) THEN 10 ELSE 0 END` : '0'} AS relevance_score,
      0 AS sort_priority FROM items i
      ${query ? `LEFT JOIN items_fts f ON f.rowid=(SELECT MAX(rowid) FROM items_fts WHERE id=i.id AND user_id=${user})` : ''}
      LEFT JOIN taxonomies t ON t.id=i.topic_id AND (t.user_id IS NULL OR t.user_id=${user})
      WHERE i.user_id=${user}${query ? ` AND (${contains(fields.map(([field]) => field))}
        OR i.id IN (SELECT id FROM fts_hits))` : ''}
      ${collectionId ? `AND EXISTS(SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
        WHERE ci.source_item_id=i.id AND ci.state='included' AND co.lifecycle!='deleted'
          AND co.id=${collection} AND ${contributor('ci.contributor_id')})` : ''}
      ${topicFilter('i.topic_id', true)}${tagFilter(['i.keywords'])}
      ${status ? `AND i.status=${bind(status)}` : ''}
      ${c.req.query('exclude_archived')==='yes'?"AND i.status!='archived'":''}`);
  }
  if (scope === 'mine' && origin !== 'owned') {
    const fields: [string, number][] = [['ss.source_tags', 100], ['sr.personal_tags', 100],
      ['ss.source_title', 60], ['ss.source_label', 60], ['pw.typed_notes', 40],
      ['ss.collection_title', 20], ['ss.provider_public_name', 20], ['t.label', 10], ['ss.source_topic_label', 10]];
    const retainedNotes = `(SELECT COALESCE(group_concat(sl.typed_notes,' '),'')
      FROM saved_snapshot_layers sl WHERE sl.snapshot_id=ss.id AND (sl.retained_field_mask & 2)=2)`;
    fields.push([retainedNotes, 40]);
    parts.push(`SELECT 'saved' AS origin,sr.id,ss.source_title AS title,
      sr.personal_topic_id AS topic_id,t.label AS topic_label,ss.source_tags AS keywords,
      ${metadataOnly ? 'NULL' : 'pw.typed_notes'} AS typed_notes,sr.status,sr.review_count,sr.downloaded_at AS created_at,
      NULL AS collection_id,ss.collection_title,ss.provider_public_name AS provider_name,sr.id AS saved_id,
      ${score(fields)} AS relevance_score,0 AS sort_priority
      FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id AND ss.saved_ref_id=sr.id
      LEFT JOIN personal_workspaces pw ON pw.saved_ref_id=sr.id AND pw.user_id=${user}
      LEFT JOIN taxonomies t ON t.id=sr.personal_topic_id AND (t.user_id IS NULL OR t.user_id=${user})
      WHERE sr.user_id=${user}${searchFilter(fields)}
      ${collectionId ? `AND sr.entry_id IN (SELECT id FROM collection_items WHERE collection_id=${collection})` : ''}
      ${topicFilter('sr.personal_topic_id', true)}${tagFilter(['ss.source_tags', 'sr.personal_tags'])}
      ${status ? `AND sr.status=${bind(status)}` : ''}
      ${c.req.query('exclude_archived')==='yes'?"AND sr.status!='archived'":''}`);
  }
  if (scope === 'shared' || scope === 'public') {
    const sharedNotes = `(SELECT COALESCE(group_concat(sl.typed_notes,' '),'') FROM shared_layers sl
      WHERE sl.entry_id=ci.id AND sl.entry_generation=ci.generation AND sl.state='active'
        AND ${contributor('sl.user_id')} AND (${contributor(user)} OR co.show_shared_notes=1))`;
    const fields: [string, number][] = [['i.keywords', 100], ['i.source', 60],
      ['co.title', 20], ['co.public_name', 20], ['p.display_name', 20], ['t.label', 10]];
    if (scope === 'shared') fields.push([sharedNotes, 40]);
    parts.push(`SELECT '${scope}' AS origin,ci.id,COALESCE(i.source,'題目') AS title,
      t.id AS topic_id,t.label AS topic_label,i.keywords,
      ${scope === 'shared' && !metadataOnly ? `substr(${sharedNotes},1,1024)` : 'NULL'} AS typed_notes,
      ${contributing ? "COALESCE(cp.status,'unsolved')" : 'NULL'} AS status,${contributing ? 'COALESCE(cp.review_count,0)' : 'NULL'} AS review_count,ci.created_at,co.id AS collection_id,
      co.title AS collection_title,COALESCE(p.display_name,co.public_name) AS provider_name,
      (SELECT sr.id FROM saved_refs sr WHERE sr.user_id=${user} AND sr.entry_id=ci.id) AS saved_id,
      ${score(fields)} AS relevance_score,0 AS sort_priority ${liveFrom}
      ${contributing?`LEFT JOIN collection_item_progress cp ON cp.entry_id=ci.id AND cp.user_id=${user}`:''}
      WHERE ${liveGate} AND ${scope === 'public' ? publicGate : readable}
        ${contributing ? `AND ${contributor(user)}` : ''}
        ${contributing&&status?`AND COALESCE(cp.status,'unsolved')=${bind(status)}`:''}
        ${contributing&&c.req.query('exclude_archived')==='yes'?"AND COALESCE(cp.status,'unsolved')!='archived'":''}
        ${scope === 'shared' && !collectionId ? `AND ${related}` : ''}
        ${subscribed ? `AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=${user})` : ''}
        ${collectionId ? `AND co.id=${collection}` : ''}
        ${searchFilter(fields)}
        ${topicFilter('t.id', false)}${tagFilter(['i.keywords'])}`);
    if (scope === 'public') {
      parts.push(`SELECT 'collection' AS origin,co.id,co.title,
        NULL AS topic_id,NULL AS topic_label,NULL AS keywords,NULL AS typed_notes,NULL AS status,
        NULL AS review_count,co.created_at,co.id AS collection_id,co.title AS collection_title,
        co.public_name AS provider_name,NULL AS saved_id,
        ${score([['co.title', 100], ['co.description', 60], ['co.public_name', 20]])} AS relevance_score,
        1 AS sort_priority FROM collections co WHERE ${publicGate} AND co.kind!='personal'
        ${collectionId ? `AND co.id=${collection}` : ''}
        ${query ? `AND (${contains(['co.title', 'co.description', 'co.public_name'])})` : ''}
        AND EXISTS(SELECT 1 ${liveFrom.replace('JOIN collections co ON co.id=ci.collection_id', '')}
          WHERE ci.collection_id=co.id AND ${liveGate}
          ${topicFilter('t.id', false)}${tagFilter(['i.keywords'])})`);
    }
  }
  const pageLimit = bind(limit + 1);
  const pageOffset = bind(offset);
  const ownedFts = !!query && scope === 'mine' && origin !== 'saved';
  const ftsHits = ownedFts ? `SELECT id FROM items_fts WHERE items_fts MATCH ${match}
    AND user_id=${user} AND rowid IN (SELECT MAX(rowid) FROM items_fts WHERE user_id=${user} GROUP BY id)` : 'SELECT NULL AS id WHERE 0';
  // Browsing has no OCR lookup or relevance work. A single origin also needs no
  // constant origin sort term, allowing the created_at/id index to stop at LIMIT.
  const sql = (withFts: boolean) => `WITH ${query ? `fts_hits AS (${withFts ? ftsHits : 'SELECT NULL AS id WHERE 0'}),` : ''}
    hits AS (${parts.join(' UNION ALL ')}) SELECT * FROM hits
    ORDER BY ${query ? 'sort_priority DESC,relevance_score DESC,' : ''}created_at DESC,${parts.length > 1 ? 'origin,' : ''}id DESC LIMIT ${pageLimit} OFFSET ${pageOffset}`;
  const execute = (withFts: boolean) => c.env.DB.prepare(sql(withFts)).bind(...values).all<Hit>();
  let rows: Hit[];
  try { rows = (await execute(ownedFts)).results || []; }
  catch (error) {
    if (!ownedFts) throw error;
    console.warn('[Search] Full-text query failed; using current metadata and OCR substring search', error);
    rows = (await execute(false)).results || [];
  }
  const page = rows.slice(0, limit);
  const ownedIds = (metadataOnly?[]:page).filter(hit => hit.origin === 'owned').map(hit => hit.id);
  const problems = ownedIds.length ? (await c.env.DB.prepare(
    `SELECT * FROM items WHERE user_id=? AND id IN (${ownedIds.map(() => '?').join(',')})`)
    .bind(uid, ...ownedIds).all<ItemRow>()).results || [] : [];
  const byId = new Map(problems.map(item => [item.id, item]));
  return c.json({ items: page.map(hit => ({ ...hit,
    ...(metadataOnly?{typed_notes:null,keywords:null}:{}),
    ...(hit.origin === 'owned' ? { problem: byId.get(hit.id) } : {}),
  })), next_offset: rows.length > limit ? offset + limit : null, scope });
});
