import { ART_STYLES } from '@photo-gen/shared';
import { getDb } from '@photo-gen/server/db/db';
import { usd } from './lib.js';
import { resolveStyle } from './scaffold.js';

export function runProjects(opts: { create?: string }): void {
  const db = getDb();
  if (opts.create) {
    const info = db.prepare('INSERT INTO projects (name) VALUES (?)').run(opts.create);
    console.log(`Created project ${Number(info.lastInsertRowid)}: ${opts.create}`);
    return;
  }
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.archived,
              (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id AND i.deleted_at IS NULL) AS images,
              (SELECT COALESCE(SUM(COALESCE(g.cost_actual, g.cost_estimated)), 0)
               FROM generations g WHERE g.project_id = p.id AND g.status = 'succeeded') AS spent
       FROM projects p ORDER BY p.id`,
    )
    .all() as { id: number; name: string; archived: number; images: number; spent: number }[];
  if (rows.length === 0) {
    console.log('No projects yet. Create one with: pgen projects --create <name>');
    return;
  }
  for (const row of rows) {
    const flags = row.archived ? '  (archived)' : '';
    console.log(`${String(row.id).padStart(3)}  ${row.name.padEnd(28)} ${String(row.images).padStart(4)} images  ${usd(row.spent)}${flags}`);
  }
}

export function runStyles(query?: string): void {
  if (query) {
    const style = resolveStyle(query);
    console.log(`${style.id} - ${style.label}`);
    console.log(style.description);
    console.log(`\nPrompt fragment:\n${style.prompt}`);
    console.log(`\nExample games: ${style.games.map((g) => g.title).join(', ')}`);
    return;
  }
  for (const style of ART_STYLES) {
    console.log(`${style.id.padEnd(24)} ${style.label.padEnd(26)} ${style.description}`);
  }
}

export function runRecent(opts: { count: string; project?: string }): void {
  const db = getDb();
  const limit = Number(opts.count);
  const rows = db
    .prepare(
      `SELECT g.id, g.status, g.user_prompt, g.created_at, g.cost_actual, g.cost_estimated,
              g.error_message, p.name AS project,
              (SELECT GROUP_CONCAT(i.id) FROM images i WHERE i.generation_id = g.id AND i.deleted_at IS NULL) AS image_ids
       FROM generations g JOIN projects p ON p.id = g.project_id
       ORDER BY g.id DESC LIMIT ?`,
    )
    .all(limit) as {
    id: number;
    status: string;
    user_prompt: string;
    created_at: string;
    cost_actual: number | null;
    cost_estimated: number;
    error_message: string | null;
    project: string;
    image_ids: string | null;
  }[];
  if (rows.length === 0) {
    console.log('No generations yet.');
    return;
  }
  for (const row of rows) {
    const prompt = row.user_prompt.length > 60 ? `${row.user_prompt.slice(0, 57)}...` : row.user_prompt;
    console.log(
      `${String(row.id).padStart(4)}  ${row.created_at}  ${row.status.padEnd(9)} ${usd(row.cost_actual ?? row.cost_estimated).padStart(8)}  [${row.project}] ${prompt}`,
    );
    if (row.status === 'succeeded' && row.image_ids) console.log(`      -> ${row.image_ids}`);
    if (row.status === 'failed' && row.error_message) console.log(`      !! ${row.error_message}`);
  }
}
