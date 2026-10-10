from pathlib import Path
import sqlite3
import unittest

class StudyMigrationTests(unittest.TestCase):
    def test_additive_repeat_constraints_and_foreign_keys(self):
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript("CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE collection_items(id TEXT PRIMARY KEY); CREATE TABLE items(id TEXT PRIMARY KEY,status TEXT); INSERT INTO users VALUES('a'),('b'); INSERT INTO collection_items VALUES('entry'); INSERT INTO items VALUES('source','resolved');")
        sql=Path('worker/migrations/0004_study_progress.sql').read_text(encoding='utf-8')
        db.executescript(sql);db.executescript(sql)
        db.execute("INSERT INTO collection_item_progress(user_id,entry_id) VALUES('a','entry'),('b','entry')")
        db.execute("UPDATE collection_item_progress SET status='archived' WHERE user_id='a'")
        self.assertEqual(db.execute("SELECT status FROM collection_item_progress WHERE user_id='b'").fetchone()[0],'unsolved')
        self.assertEqual(db.execute('SELECT status FROM items').fetchone()[0],'resolved')
        self.assertEqual(len(db.execute("PRAGMA table_info(collection_item_progress)").fetchall()),7)
        for query in ["UPDATE collection_item_progress SET status='invalid'", "UPDATE collection_item_progress SET review_count=-1", "INSERT INTO collection_item_progress(user_id,entry_id) VALUES('unknown','entry')"]:
            with self.assertRaises(sqlite3.IntegrityError): db.execute(query)

if __name__=='__main__': unittest.main()
