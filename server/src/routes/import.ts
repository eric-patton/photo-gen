import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { ulid } from 'ulid';
import type { ImageDto, OutputFormat } from '@photo-gen/shared';
import { getDb } from '../db/db';
import { LIBRARY_ROOT } from '../config';
import { insertImageRow, persistFile } from '../services/library';
import { getImageDetail } from '../repo/images';
import { getOrCreateTag } from './tags';

const NATIVE_FORMATS: Record<string, OutputFormat> = {
  png: 'png',
  jpeg: 'jpeg',
  jpg: 'jpeg',
  webp: 'webp',
};

interface PendingFile {
  filename: string;
  bytes: Buffer;
}

export function registerImportRoutes(app: FastifyInstance): void {
  app.post('/api/import', async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Expected multipart form data' });

    const files: PendingFile[] = [];
    const fields: Record<string, string> = {};
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        files.push({ filename: part.filename ?? 'import', bytes: await part.toBuffer() });
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }

    const projectId = Number(fields.projectId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return reply.code(400).send({ error: 'projectId field is required' });
    }
    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
      return reply.code(404).send({ error: `Project ${projectId} not found` });
    }
    const folderId = fields.folderId ? Number(fields.folderId) : null;
    if (folderId != null) {
      const folder = db
        .prepare('SELECT id FROM folders WHERE id = ? AND project_id = ?')
        .get(folderId, projectId);
      if (!folder) return reply.code(404).send({ error: 'Folder not found in this project' });
    }
    const tagNames = (fields.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (files.length === 0) return reply.code(400).send({ error: 'No files provided' });

    const imported: ImageDto[] = [];
    const failed: { filename: string; error: string }[] = [];
    for (const file of files) {
      try {
        imported.push(await importOne(file, { projectId, folderId, tagNames }));
      } catch (err) {
        failed.push({ filename: file.filename, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return reply.code(failed.length > 0 && imported.length === 0 ? 400 : 201).send({ imported, failed });
  });
}

async function importOne(
  file: PendingFile,
  opts: { projectId: number; folderId: number | null; tagNames: string[] },
): Promise<ImageDto> {
  const meta = await sharp(file.bytes).metadata();
  if (!meta.format || !meta.width || !meta.height) {
    throw new Error('Unrecognized or corrupt image file');
  }

  let bytes = file.bytes;
  let format = NATIVE_FORMATS[meta.format];
  if (!format) {
    // Non-native formats (bmp, tiff, gif…) are converted to PNG for the
    // library copy; the untouched original is preserved alongside.
    const originalName = `${ulid()}${path.extname(file.filename) || `.${meta.format}`}`;
    const originalsDir = path.join(LIBRARY_ROOT, 'imports', 'originals');
    fs.mkdirSync(originalsDir, { recursive: true });
    fs.writeFileSync(path.join(originalsDir, originalName), file.bytes);
    bytes = await sharp(file.bytes).png().toBuffer();
    format = 'png';
  }

  const persisted = await persistFile(bytes, 'images', format);
  const db = getDb();
  const title = path.basename(file.filename, path.extname(file.filename));
  db.transaction(() => {
    insertImageRow({
      file: persisted,
      projectId: opts.projectId,
      folderId: opts.folderId,
      source: 'imported',
      format: format!,
      title,
    });
    for (const name of opts.tagNames) {
      const tag = getOrCreateTag(name);
      db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)').run(
        persisted.id,
        tag.id,
      );
    }
  })();
  const detail = getImageDetail(persisted.id);
  if (!detail) throw new Error('Import failed to register image');
  return detail;
}
