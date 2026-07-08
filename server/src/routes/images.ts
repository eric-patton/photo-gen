import fs from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { imagePatchSchema, tagUpsertSchema } from '@photo-gen/shared';
import { getImageDetail, getImageRow, listImages } from '../repo/images';
import { getDb } from '../db/db';
import { deleteImageFiles } from '../services/library';
import { getOrCreateTag } from './tags';
import { libraryPath } from '../config';

const MIME_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function registerImageRoutes(app: FastifyInstance): void {
  app.get<{
    Querystring: {
      project?: string;
      folder?: string;
      source?: string;
      starred?: string;
      q?: string;
      tags?: string;
      character?: string;
      cursor?: string;
      limit?: string;
    };
  }>('/api/images', async (req) => {
    const q = req.query;
    return listImages({
      projectId: q.project ? Number(q.project) : undefined,
      folderId: q.folder ? Number(q.folder) : undefined,
      source: q.source,
      starred: q.starred === 'true',
      q: q.q,
      tagIds: q.tags ? q.tags.split(',').map(Number).filter(Number.isFinite) : undefined,
      characterId: q.character ? Number(q.character) : undefined,
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });

  app.get<{ Params: { id: string } }>('/api/images/:id', async (req, reply) => {
    const detail = getImageDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: 'Image not found' });
    return detail;
  });

  app.patch<{ Params: { id: string } }>('/api/images/:id', async (req, reply) => {
    const row = getImageRow(req.params.id);
    if (!row || row.deleted_at) return reply.code(404).send({ error: 'Image not found' });
    const body = imagePatchSchema.parse(req.body);
    const db = getDb();
    if (body.folderId != null) {
      const folder = db
        .prepare('SELECT id FROM folders WHERE id = ? AND project_id = ?')
        .get(body.folderId, row.project_id);
      if (!folder) return reply.code(404).send({ error: 'Folder not found in this project' });
    }
    db.prepare(
      'UPDATE images SET title = ?, notes = ?, folder_id = ?, starred = ? WHERE id = ?',
    ).run(
      body.title ?? row.title,
      body.notes ?? row.notes,
      body.folderId === undefined ? row.folder_id : body.folderId,
      body.starred === undefined ? row.starred : body.starred ? 1 : 0,
      row.id,
    );
    return getImageDetail(row.id);
  });

  app.delete<{ Params: { id: string }; Querystring: { hard?: string } }>(
    '/api/images/:id',
    async (req, reply) => {
      const row = getImageRow(req.params.id);
      if (!row || row.deleted_at) return reply.code(404).send({ error: 'Image not found' });
      const db = getDb();
      if (req.query.hard === 'true') {
        // Hard delete only when nothing references the image.
        const usedIn = (
          db.prepare('SELECT COUNT(*) AS c FROM generation_inputs WHERE image_id = ?').get(row.id) as { c: number }
        ).c;
        const approvedIn = (
          db.prepare('SELECT COUNT(*) AS c FROM character_views WHERE approved_image_id = ?').get(row.id) as { c: number }
        ).c;
        if (usedIn > 0 || approvedIn > 0) {
          return reply.code(409).send({
            error: 'Image is referenced by generations or character views; soft-deleting instead is safe',
          });
        }
        db.prepare('DELETE FROM images WHERE id = ?').run(row.id);
        deleteImageFiles(row.file_path, row.thumb_path);
      } else {
        db.prepare(`UPDATE images SET deleted_at = datetime('now') WHERE id = ?`).run(row.id);
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>('/api/images/:id/tags', async (req, reply) => {
    const row = getImageRow(req.params.id);
    if (!row || row.deleted_at) return reply.code(404).send({ error: 'Image not found' });
    const body = tagUpsertSchema.parse(req.body);
    const tag = getOrCreateTag(body.name);
    getDb()
      .prepare('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)')
      .run(row.id, tag.id);
    return reply.code(201).send(tag);
  });

  app.delete<{ Params: { id: string; tagId: string } }>(
    '/api/images/:id/tags/:tagId',
    async (req, reply) => {
      getDb()
        .prepare('DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?')
        .run(req.params.id, Number(req.params.tagId));
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>('/api/images/:id/file', async (req, reply) => {
    const row = getImageRow(req.params.id);
    if (!row || row.deleted_at) return reply.code(404).send({ error: 'Image not found' });
    return sendLibraryFile(reply, row.file_path, MIME_BY_FORMAT[row.format] ?? 'application/octet-stream');
  });

  app.get<{ Params: { id: string } }>('/api/images/:id/thumb', async (req, reply) => {
    const row = getImageRow(req.params.id);
    if (!row || row.deleted_at) return reply.code(404).send({ error: 'Image not found' });
    // Fall back to the full file when the thumbnail is missing.
    const rel = row.thumb_path ?? row.file_path;
    const mime = row.thumb_path ? 'image/webp' : (MIME_BY_FORMAT[row.format] ?? 'application/octet-stream');
    return sendLibraryFile(reply, rel, mime);
  });
}

function sendLibraryFile(reply: FastifyReply, relPath: string, mime: string) {
  const abs = libraryPath(relPath);
  if (!fs.existsSync(abs)) return reply.code(404).send({ error: 'File missing from library' });
  return reply
    .header('Content-Type', mime)
    // Image ids are ULIDs and content never changes for an id.
    .header('Cache-Control', 'public, max-age=31536000, immutable')
    .send(fs.createReadStream(abs));
}
