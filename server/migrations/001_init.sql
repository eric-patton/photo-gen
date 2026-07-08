CREATE TABLE projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Folders: schema supports nesting (parent_id); V1 UI treats them as flat.
CREATE TABLE folders (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  UNIQUE (project_id, parent_id, name)
);

CREATE TABLE generations (
  id                 INTEGER PRIMARY KEY,
  project_id         INTEGER NOT NULL REFERENCES projects(id),
  character_view_id  INTEGER REFERENCES character_views(id),
  endpoint           TEXT NOT NULL CHECK (endpoint IN ('generations','edits')),
  prompt             TEXT NOT NULL,
  user_prompt        TEXT NOT NULL,
  params_json        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  error_code         TEXT,
  error_message      TEXT,
  moderation_json    TEXT,
  usage_json         TEXT,
  cost_estimated     REAL NOT NULL,
  cost_actual        REAL,
  attempt            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  started_at         TEXT,
  finished_at        TEXT,
  duration_ms        INTEGER
);
CREATE INDEX idx_generations_project_status ON generations(project_id, status);
CREATE INDEX idx_generations_view ON generations(character_view_id);

CREATE TABLE images (
  id            TEXT PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id),
  folder_id     INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  generation_id INTEGER REFERENCES generations(id),
  source        TEXT NOT NULL CHECK (source IN ('generated','imported','mask')),
  file_path     TEXT NOT NULL,
  thumb_path    TEXT,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  format        TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  starred       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);
CREATE INDEX idx_images_project ON images(project_id, deleted_at, created_at DESC);
CREATE INDEX idx_images_generation ON images(generation_id);

CREATE TABLE generation_inputs (
  generation_id INTEGER NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  image_id      TEXT NOT NULL REFERENCES images(id),
  role          TEXT NOT NULL CHECK (role IN ('base','reference','mask')),
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (generation_id, role, position)
);
CREATE INDEX idx_geninputs_image ON generation_inputs(image_id);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE image_tags (
  image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (image_id, tag_id)
);

CREATE TABLE characters (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  style_notes TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, name)
);

CREATE TABLE character_views (
  id                INTEGER PRIMARY KEY,
  character_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot              TEXT NOT NULL,
  label             TEXT NOT NULL,
  prompt_hint       TEXT NOT NULL DEFAULT '',
  approved_image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (character_id, slot)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
