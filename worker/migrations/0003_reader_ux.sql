-- Apply once before deploying the new reader UI/Worker.
ALTER TABLE collection_item_reads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));
ALTER TABLE saved_refs ADD COLUMN classification_state TEXT NOT NULL DEFAULT 'ready'
  CHECK(classification_state IN ('ready','pending','failed','manual'));
