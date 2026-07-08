-- Prompt-improvement calls (GPT-5.4 / 5.4-mini) so their spend shows up in cost tracking.
-- project_id is SET NULL on project delete: the spend already happened, keep it in global totals.
CREATE TABLE improvements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('generation', 'character')),
  model TEXT NOT NULL,
  speed TEXT NOT NULL CHECK (speed IN ('fast', 'smart')),
  effort TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_improvements_project ON improvements(project_id);
CREATE INDEX idx_improvements_created ON improvements(created_at);
