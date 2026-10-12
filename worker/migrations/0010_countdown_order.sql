-- Persist each account's custom countdown order without changing event contents.
ALTER TABLE home_widget_preferences ADD COLUMN countdown_order TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(countdown_order) AND json_type(countdown_order)='array');
