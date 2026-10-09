/**
 * FTS5's id is UNINDEXED, not UNIQUE: INSERT OR REPLACE does not replace by id.
 * Keep the newest legacy OCR row, refresh metadata from the live item, and create
 * a row only if missing. Run all statements in the item's mutation batch.
 */
export function itemSearchIndexStatements(
  db: D1Database, id: string | undefined, userId: string, ocrText?: string,
): D1PreparedStatement[] {
  const itemId = id || '';
  return [
    db.prepare(`DELETE FROM items_fts WHERE id=? AND rowid NOT IN (
      SELECT MAX(rowid) FROM items_fts WHERE id=?)
      AND EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=?)`)
      .bind(itemId, itemId, itemId, userId),
    db.prepare(`UPDATE items_fts SET user_id=?,
      source=COALESCE((SELECT source FROM items WHERE id=?),''),
      keyword_tokens=COALESCE((SELECT keyword_tokens FROM items WHERE id=?),''),
      typed_notes=COALESCE((SELECT typed_notes FROM items WHERE id=?),'')
      ${ocrText === undefined ? '' : ',problem_text=?'}
      WHERE id=? AND EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=?)`)
      .bind(userId, itemId, itemId, itemId, ...(ocrText === undefined ? [] : [ocrText]),
        itemId, itemId, userId),
    db.prepare(`INSERT INTO items_fts(id,user_id,source,keyword_tokens,typed_notes,problem_text)
      SELECT id,user_id,COALESCE(source,''),COALESCE(keyword_tokens,''),COALESCE(typed_notes,''),?
      FROM items WHERE id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM items_fts WHERE id=?)`)
      .bind(ocrText || '', itemId, userId, itemId),
  ];
}
