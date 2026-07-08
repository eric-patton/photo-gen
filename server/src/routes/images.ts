import fs from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { getImageDetail, getImageRow, listImages } from '../repo/images';
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
