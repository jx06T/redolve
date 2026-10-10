"""Additive migration checks; no production database connection."""
from pathlib import Path
import sqlite3
import unittest

class ReaderMigrationTests(unittest.TestCase):
    def test_existing_data_defaults_and_constraints(self):
        db=sqlite3.connect(':memory:')
        db.executescript("CREATE TABLE collection_item_reads(user_id TEXT,entry_id TEXT,seen_at TEXT); CREATE TABLE saved_refs(id TEXT,status TEXT); INSERT INTO collection_item_reads VALUES('user','entry','yesterday'); INSERT INTO saved_refs VALUES('saved','resolved');")
        db.executescript(Path('worker/migrations/0003_reader_ux.sql').read_text(encoding='utf-8'))
        self.assertEqual(db.execute('SELECT * FROM collection_item_reads').fetchone(),('user','entry','yesterday',0))
        self.assertEqual(db.execute('SELECT * FROM saved_refs').fetchone(),('saved','resolved','ready'))
        for statement in ["UPDATE collection_item_reads SET starred=2", "UPDATE saved_refs SET classification_state='unknown'"]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(statement)
        self.assertEqual(dict(db.execute("SELECT 'starred_column',COUNT(*) FROM pragma_table_info('collection_item_reads') WHERE name='starred' UNION ALL SELECT 'classification_column',COUNT(*) FROM pragma_table_info('saved_refs') WHERE name='classification_state'")),{'starred_column':1,'classification_column':1})

if __name__=='__main__': unittest.main()
