import type { FastifyInstance } from 'fastify';
import { tagUpsertSchema, type TagDto } from '@photo-gen/shared';
import { getDb } from '../db/db';

export function registerTagRoutes(app: FastifyInstance): void {
  app.get('/api/tags', async () => {
    const rows = getDb()
      .prepare(
        `SELECT t.id, t.name, COUNT(it.image_id) AS usage_count
         FROM tags t LEFT JOIN image_tags it ON it.tag_id = t.id
         GROUP BY t.id ORDER BY t.name`,
      )
      .all() as { id: number; name: string; usage_count: number }[];
    return rows.map(
      (r): TagDto => ({ id: r.id, name: r.name, usageCount: r.usage_count }),
    );
  });

  app.post('/api/tags', async (req, reply) => {
    const body = tagUpsertSchema.parse(req.body);
    const tag = getOrCreateTag(body.name);
    return reply.code(201).send(tag);
  });

  app.patch<{ Params: { id: string } }>('/api/tags/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const body = tagUpsertSchema.parse(req.body);
    const db = getDb();
    if (!db.prepare('SELECT id FROM tags WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'Tag not found' });
    }
    const dup = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(body.name, id);
    if (dup) return reply.code(409).send({ error: `Tag '${body.name}' already exists` });
    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(body.name, id);
    return { id, name: body.name } satisfies TagDto;
  });

  app.delete<{ Params: { id: string } }>('/api/tags/:id', async (req, reply) => {
    const result = getDb().prepare('DELETE FROM tags WHERE id = ?').run(Number(req.params.id));
    if (result.changes === 0) return reply.code(404).send({ error: 'Tag not found' });
    return reply.code(204).send();
  });
}

export function getOrCreateTag(name: string): TagDto {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db.prepare('SELECT id, name FROM tags WHERE name = ?').get(trimmed) as
    | { id: number; name: string }
    | undefined;
  if (existing) return existing;
  const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(trimmed);
  return { id: Number(info.lastInsertRowid), name: trimmed };
}
