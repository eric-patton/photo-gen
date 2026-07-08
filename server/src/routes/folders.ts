import type { FastifyInstance } from 'fastify';
import { folderUpsertSchema, type FolderDto } from '@photo-gen/shared';
import { z } from 'zod';
import { getDb } from '../db/db';

interface FolderRow {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
}

function folderRowToDto(row: FolderRow): FolderDto {
  return { id: row.id, projectId: row.project_id, name: row.name };
}

export function registerFolderRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/api/projects/:id/folders', async (req) => {
    const rows = getDb()
      .prepare('SELECT * FROM folders WHERE project_id = ? ORDER BY name')
      .all(Number(req.params.id)) as FolderRow[];
    return rows.map(folderRowToDto);
  });

  app.post('/api/folders', async (req, reply) => {
    const body = folderUpsertSchema.parse(req.body);
    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(body.projectId)) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const dup = db
      .prepare('SELECT id FROM folders WHERE project_id = ? AND parent_id IS NULL AND name = ?')
      .get(body.projectId, body.name);
    if (dup) return reply.code(409).send({ error: `Folder '${body.name}' already exists` });
    const info = db
      .prepare('INSERT INTO folders (project_id, name) VALUES (?, ?)')
      .run(body.projectId, body.name);
    const row = db
      .prepare('SELECT * FROM folders WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as FolderRow;
    return reply.code(201).send(folderRowToDto(row));
  });

  app.patch<{ Params: { id: string } }>('/api/folders/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const body = z.object({ name: z.string().min(1).max(200) }).parse(req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Folder not found' });
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(body.name, id);
    return folderRowToDto({ ...row, name: body.name });
  });

  // Deleting a folder moves its images back to the project root.
  app.delete<{ Params: { id: string } }>('/api/folders/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const db = getDb();
    if (!db.prepare('SELECT id FROM folders WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'Folder not found' });
    }
    db.transaction(() => {
      db.prepare('UPDATE images SET folder_id = NULL WHERE folder_id = ?').run(id);
      db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    })();
    return reply.code(204).send();
  });
}
