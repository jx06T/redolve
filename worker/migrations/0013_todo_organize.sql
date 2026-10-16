-- Additive only. 0011 was withdrawn; never reuse that number.
ALTER TABLE home_widget_preferences ADD COLUMN todo_order TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(todo_order) AND json_type(todo_order)='array');
