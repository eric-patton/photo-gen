import type { FastifyInstance } from 'fastify';
import {
  projectPatchSchema,
  projectUpsertSchema,
  type ProjectDto,
  type ProjectStatsDto,
} from '@photo-gen/shared';
import { getDb } from '../db/db';
import { deleteImageFiles } from '../services/library';

interface ProjectRow {
  id: number;
  name: string;
  description: string;
  archived: number;
  created_at: string;
}

export function projectRowToDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived: row.archived === 1,
    createdAt: row.created_at,
  };
}

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async () => {
    const rows = getDb()
      .prepare('SELECT * FROM projects ORDER BY archived, name')
      .all() as ProjectRow[];
    return rows.map(projectRowToDto);
  });

  app.post('/api/projects', async (req, reply) => {
    const body = projectUpsertSchema.parse(req.body);
    const db = getDb();
    const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(body.name);
    if (existing) return reply.code(409).send({ error: `Project '${body.name}' already exists` });
    const info = db
      .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
      .run(body.name, body.description);
    const row = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as ProjectRow;
    return reply.code(201).send(projectRowToDto(row));
  });

  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const body = projectPatchSchema.parse(req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Project not found' });
    db.prepare('UPDATE projects SET name = ?, description = ?, archived = ? WHERE id = ?').run(
      body.name ?? row.name,
      body.description ?? row.description,
      body.archived === undefined ? row.archived : body.archived ? 1 : 0,
      id,
    );
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow;
    return projectRowToDto(updated);
  });

  // Empty projects delete outright. ?force=true archives the project and
  // soft-deletes its images instead (rows keep their history/lineage).
  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/api/projects/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const db = getDb();
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
      if (!row) return reply.code(404).send({ error: 'Project not found' });
      const imageCount = (
        db.prepare('SELECT COUNT(*) AS c FROM images WHERE project_id = ? AND deleted_at IS NULL').get(id) as { c: number }
      ).c;
      const genCount = (
        db.prepare('SELECT COUNT(*) AS c FROM generations WHERE project_id = ?').get(id) as { c: number }
      ).c;
      let conflict = `Project has ${imageCount} image(s) and ${genCount} generation(s). Use ?force=true to archive it and soft-delete its images.`;
      if (imageCount === 0 && genCount === 0) {
        // Only trashed (soft-deleted) images can remain; they go with the project.
        const trashed = db
          .prepare('SELECT file_path, thumb_path FROM images WHERE project_id = ?')
          .all(id) as { file_path: string; thumb_path: string | null }[];
        try {
          db.transaction(() => {
            db.prepare('DELETE FROM images WHERE project_id = ?').run(id);
            db.prepare('DELETE FROM folders WHERE project_id = ?').run(id);
            db.prepare('DELETE FROM characters WHERE project_id = ?').run(id);
            db.prepare('DELETE FROM projects WHERE id = ?').run(id);
          })();
          for (const img of trashed) deleteImageFiles(img.file_path, img.thumb_path);
          return reply.code(204).send();
        } catch {
          // A trashed image is still referenced from another project's lineage; fall through to archive.
          conflict = `A trashed image in this project is referenced by other generations. Use ?force=true to archive the project instead.`;
        }
      }
      if (req.query.force !== 'true') {
        return reply.code(409).send({ error: conflict });
      }
      db.transaction(() => {
        db.prepare(
          `UPDATE images SET deleted_at = datetime('now') WHERE project_id = ? AND deleted_at IS NULL`,
        ).run(id);
        db.prepare('UPDATE projects SET archived = 1 WHERE id = ?').run(id);
      })();
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>('/api/projects/:id/stats', async (req, reply) => {
    const id = Number(req.params.id);
    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const stats: ProjectStatsDto = {
      imageCount: (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM images WHERE project_id = ? AND deleted_at IS NULL AND source != 'mask'`,
          )
          .get(id) as { c: number }
      ).c,
      generationCount: (
        db.prepare('SELECT COUNT(*) AS c FROM generations WHERE project_id = ?').get(id) as { c: number }
      ).c,
      costTotal:
        ((
          db
            .prepare(
              `SELECT SUM(COALESCE(cost_actual, cost_estimated)) AS total FROM generations
               WHERE project_id = ? AND status = 'succeeded'`,
            )
            .get(id) as { total: number | null }
        ).total ?? 0) +
        ((
          db
            .prepare(`SELECT SUM(COALESCE(cost_usd, 0)) AS total FROM improvements WHERE project_id = ?`)
            .get(id) as { total: number | null }
        ).total ?? 0),
    };
    return stats;
  });
}

/** Creates the initial project on a fresh library so the UI always has a target. */
export function ensureDefaultProject(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c;
  if (count === 0) {
    db.prepare(`INSERT INTO projects (name, description) VALUES ('Default', 'Default project')`).run();
  }
}
