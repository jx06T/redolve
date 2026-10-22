/** A bounded, replay-safe legacy OCR batch. Current AI/user text always wins. */
export function learningBackfillSql(start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
    throw Error('Invalid backfill rowid range');
  }
  return `INSERT INTO item_texts(item_id,user_id,source_content_seq,ocr_text,text_origin,legacy_rowid)
 SELECT i.id,i.user_id,i.content_seq,COALESCE(f.problem_text,''),'legacy',f.rowid
 FROM items_fts f JOIN items i ON i.id=f.id AND i.user_id=f.user_id
 WHERE f.rowid IN (SELECT MAX(rowid) FROM items_fts WHERE rowid>${start} AND rowid<=${end} GROUP BY id,user_id)
 ON CONFLICT(item_id) DO UPDATE SET ocr_text=excluded.ocr_text,legacy_rowid=excluded.legacy_rowid,source_content_seq=excluded.source_content_seq
 WHERE item_texts.text_origin='legacy' AND item_texts.legacy_rowid<excluded.legacy_rowid;`;
}
