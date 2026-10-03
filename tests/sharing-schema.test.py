"""Small SQLite invariant checks for the sharing migration.

Run with Python's standard library: python tests/sharing-schema.test.py
"""
from pathlib import Path
import sqlite3
import unittest


SCHEMA = (Path(__file__).resolve().parents[1] / "worker" / "schema.sql").read_text(encoding="utf-8-sig")
MIGRATION = (Path(__file__).resolve().parents[1] / "worker" / "migrations" / "0002_sharing_collections.sql").read_text(encoding="utf-8-sig")
LATE_UPLOAD_BACKFILL = (Path(__file__).resolve().parents[1] / "scripts" / "sharing-backfill-late-uploads.sql").read_text(encoding="utf-8-sig")
ASSET_AUDIT = (Path(__file__).resolve().parents[1] / "scripts" / "sharing-asset-audit.sql").read_text(encoding="utf-8-sig")


def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    for uid in ("a", "b", "d"):
        db.execute("INSERT INTO users(id,email) VALUES(?,?)", (uid, f"{uid}@example.test"))
        db.execute("INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)", (uid, uid))
    db.execute("INSERT INTO assets(id,storage_key) VALUES('image','images/b.jpg')")
    db.execute("INSERT INTO items(id,user_id,image_url) VALUES('source','b','image')")
    db.execute("INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES('root','image','source','source_image')")
    db.execute(
        "INSERT INTO collections(id,owner_id,title,public_name,lifecycle,visibility) "
        "VALUES('set','a','Set','Teacher','active','public')"
    )
    db.commit()
    return db


class SharingSchemaTest(unittest.TestCase):
    def test_asset_audit_detects_missing_source_root(self):
        db = database()
        metrics = dict(db.execute(ASSET_AUDIT).fetchall())
        self.assertTrue(all(count == 0 for count in metrics.values()), metrics)
        db.execute("DELETE FROM asset_refs WHERE id='root'")
        metrics = dict(db.execute(ASSET_AUDIT).fetchall())
        self.assertEqual(metrics["missing_source_asset_or_ref"], 1)
        self.assertEqual(metrics["unreferenced_ready_assets"], 1)
        db.close()

    def test_late_upload_backfill_is_idempotent(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA)
        db.execute("INSERT INTO users(id,email) VALUES('legacy','legacy@example.test')")
        db.execute("INSERT INTO items(id,user_id,image_url) VALUES('late','legacy','images/legacy/late.jpg')")
        db.commit()

        db.executescript(LATE_UPLOAD_BACKFILL)
        db.executescript(LATE_UPLOAD_BACKFILL)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM assets").fetchone()[0], 1)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM asset_refs").fetchone()[0], 1)
        self.assertEqual(db.execute("SELECT id,asset_id,item_id FROM asset_refs").fetchone(),
                         ("item:late", "images/legacy/late.jpg", "late"))
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()

    def test_existing_items_receive_asset_records_during_migration(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(SCHEMA.split("-- Sharing v2.", 1)[0])
        db.execute("INSERT INTO users(id,email) VALUES('legacy','legacy@example.test')")
        db.execute(
            "INSERT INTO items(id,user_id,image_url,vector_clock) VALUES(?,?,?,?)",
            ("first", "legacy", "images/legacy/shared.jpg", '{"seq":3}'),
        )
        db.execute(
            "INSERT INTO items(id,user_id,image_url,vector_clock) VALUES(?,?,?,?)",
            ("second", "legacy", "images/legacy/shared.jpg", "invalid"),
        )
        db.commit()

        db.executescript(MIGRATION)
        self.assertEqual(db.execute("SELECT id,storage_key FROM assets").fetchall(),
                         [("images/legacy/shared.jpg", "images/legacy/shared.jpg")])
        self.assertEqual(db.execute("SELECT id,asset_id,item_id FROM asset_refs ORDER BY item_id").fetchall(),
                         [("item:first", "images/legacy/shared.jpg", "first"),
                          ("item:second", "images/legacy/shared.jpg", "second")])
        self.assertEqual(db.execute("SELECT id,draw_seq FROM items ORDER BY id").fetchall(),
                         [("first", 3), ("second", 0)])
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()

    def test_source_owner_and_contributor_grant(self):
        db = database()
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) "
                "VALUES('entry','set','source','b','source')"
            )
        db.execute(
            "INSERT INTO collection_grants(id,collection_id,kind,role,user_id) "
            "VALUES('grant','set','user','contributor','b')"
        )
        db.execute(
            "INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) "
            "VALUES('entry','set','source','b','source')"
        )
        db.execute(
            "INSERT INTO collection_events(collection_id,entry_id,generation,type) "
            "VALUES('set','entry',1,'add')"
        )
        self.assertEqual(db.execute("SELECT COUNT(*) FROM collection_items").fetchone()[0], 1)
        db.close()

    def test_saved_image_survives_source_delete_and_revoke(self):
        db = database()
        db.execute(
            "INSERT INTO collection_grants(id,collection_id,kind,role,user_id) "
            "VALUES('grant','set','user','contributor','b')"
        )
        db.execute(
            "INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) "
            "VALUES('entry','set','source','b','source')"
        )
        db.execute("INSERT INTO saved_refs(id,user_id,entry_id) VALUES('saved','d','entry')")
        db.execute(
            "INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,"
            "provider_public_name,source_content_seq,source_shared_seq) "
            "VALUES('snapshot','saved','image','Question','Set','B',1,0)"
        )
        db.execute("UPDATE saved_refs SET current_snapshot_id='snapshot' WHERE id='saved'")
        db.execute(
            "INSERT INTO asset_refs(id,asset_id,snapshot_id,role) "
            "VALUES('saved-root','image','snapshot','saved_image')"
        )
        db.execute("INSERT INTO personal_workspaces(id,user_id,saved_ref_id) VALUES('workspace','d','saved')")
        db.execute("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='grant'")
        db.execute("UPDATE collection_items SET state='removed' WHERE id='entry'")
        db.execute("DELETE FROM asset_refs WHERE id='root'")
        db.execute("DELETE FROM items WHERE id='source'")
        self.assertIsNone(db.execute("SELECT source_item_id FROM collection_items WHERE id='entry'").fetchone()[0])
        self.assertEqual(db.execute("SELECT COUNT(*) FROM asset_refs WHERE asset_id='image'").fetchone()[0], 1)
        self.assertEqual(db.execute("SELECT image_asset_id FROM saved_snapshots WHERE id='snapshot'").fetchone()[0], "image")
        db.execute("DELETE FROM saved_refs WHERE id='saved'")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM asset_refs WHERE asset_id='image'").fetchone()[0], 0)
        db.close()

    def test_shared_layer_cannot_be_written_after_revocation(self):
        db = database()
        db.execute(
            "INSERT INTO collection_grants(id,collection_id,kind,role,user_id) "
            "VALUES('grant','set','user','contributor','b')"
        )
        db.execute(
            "INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) "
            "VALUES('entry','set','source','b','source')"
        )
        db.execute(
            "INSERT INTO shared_layers(id,entry_id,entry_generation,user_id,author_display) "
            "VALUES('layer','entry',1,'b','B')"
        )
        db.execute("UPDATE shared_layers SET typed_notes='note',notes_seq=1 WHERE id='layer'")
        self.assertEqual(db.execute("SELECT shared_seq FROM collection_items WHERE id='entry'").fetchone()[0], 1)
        db.execute("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='grant'")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE shared_layers SET typed_notes='stale',notes_seq=2 WHERE id='layer'")
        db.close()


if __name__ == "__main__":
    unittest.main()
