-- Retain full OCR text independently of the live source's access permissions.
ALTER TABLE saved_snapshots ADD COLUMN source_text TEXT;

-- Recover legacy OCR only when the retained image and content revision match.
-- Missing/deleted/changed sources cannot safely reconstruct an older OCR version.
UPDATE saved_snapshots SET source_text=(
 SELECT COALESCE((SELECT f.problem_text FROM items_fts f
   WHERE f.id=i.id AND f.user_id=i.user_id ORDER BY f.rowid DESC LIMIT 1),'')
 FROM saved_refs sr JOIN collection_items ci ON ci.id=sr.entry_id
 JOIN items i ON i.id=ci.origin_item_key AND i.user_id=ci.contributor_id
 WHERE sr.id=saved_snapshots.saved_ref_id
   AND i.image_url=saved_snapshots.image_asset_id
   AND i.content_seq=saved_snapshots.source_content_seq
)
WHERE source_text IS NULL;
