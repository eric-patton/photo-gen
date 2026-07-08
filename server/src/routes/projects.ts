import type { FastifyInstance } from 'fastify';
import type { ProjectDto } from '@photo-gen/shared';
import { getDb } from '../db/db';

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
}

/** Creates the initial project on a fresh library so the UI always has a target. */
export function ensureDefaultProject(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c;
  if (count === 0) {
    db.prepare(`INSERT INTO projects (name, description) VALUES ('Default', 'Default project')`).run();
  }
}
