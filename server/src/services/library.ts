import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ulid } from 'ulid';
import type { ImageSource, OutputFormat } from '@photo-gen/shared';
import { LIBRARY_ROOT } from '../config';
import { getDb } from '../db/db';

const THUMB_LONG_EDGE = 384;
const THUMB_QUALITY = 72;

export interface PersistedFile {
  id: string;
  filePath: string; // library-relative, forward slashes
  thumbPath: string | null;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Writes image bytes (and a webp thumbnail) into the library tree.
 * Pure file work — no DB rows; call insertImageRow afterwards so row
 * creation can participate in a synchronous transaction.
 */
export async function persistFile(
  bytes: Buffer,
  kind: 'images' | 'masks',
  format: OutputFormat,
): Promise<PersistedFile> {
  const id = ulid();
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const ext = format === 'jpeg' ? 'jpg' : format;
  const relDir = `${kind}/${year}/${month}`;
  const relFile = `${relDir}/${id}.${ext}`;
  const relThumb = `thumbs/${year}/${month}/${id}.webp`;

  fs.mkdirSync(path.join(LIBRARY_ROOT, relDir), { recursive: true });
  fs.mkdirSync(path.join(LIBRARY_ROOT, 'thumbs', year, month), { recursive: true });

  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  fs.writeFileSync(path.join(LIBRARY_ROOT, relFile), bytes);

  let thumbPath: string | null = relThumb;
  try {
    await sharp(bytes)
      .resize({ width: THUMB_LONG_EDGE, height: THUMB_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(path.join(LIBRARY_ROOT, relThumb));
  } catch {
    thumbPath = null; // thumbnail failure is non-fatal; gallery regenerates lazily
  }

  return { id, filePath: relFile, thumbPath, width, height, sizeBytes: bytes.length };
}

export interface InsertImageOpts {
  file: PersistedFile;
  projectId: number;
  folderId?: number | null;
  generationId?: number | null;
  source: ImageSource;
  format: OutputFormat;
  title?: string;
}

/** Synchronous row insert — safe to call inside a better-sqlite3 transaction. */
export function insertImageRow(opts: InsertImageOpts): string {
  getDb()
    .prepare(
      `INSERT INTO images (id, project_id, folder_id, generation_id, source, file_path, thumb_path,
                           width, height, format, size_bytes, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.file.id,
      opts.projectId,
      opts.folderId ?? null,
      opts.generationId ?? null,
      opts.source,
      opts.file.filePath,
      opts.file.thumbPath,
      opts.file.width,
      opts.file.height,
      opts.format,
      opts.file.sizeBytes,
      opts.title ?? '',
    );
  return opts.file.id;
}

export function deleteImageFiles(filePath: string, thumbPath: string | null): void {
  for (const rel of [filePath, thumbPath]) {
    if (!rel) continue;
    try {
      fs.unlinkSync(path.join(LIBRARY_ROOT, rel));
    } catch {
      // already gone
    }
  }
}
