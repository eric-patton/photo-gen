import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { OutputFormat } from '@photo-gen/shared';
import { getDb } from '@photo-gen/server/db/db';
import { libraryPath } from '@photo-gen/server/config';
import { insertImageRow, persistFile } from '@photo-gen/server/services/library';

export interface ProjectRow {
  id: number;
  name: string;
  archived: number;
}

/** Resolves a --project value: numeric id, exact name, or unique name prefix. */
export function resolveProject(ref: string): ProjectRow {
  const db = getDb();
  if (/^\d+$/.test(ref)) {
    const row = db.prepare('SELECT id, name, archived FROM projects WHERE id = ?').get(Number(ref)) as
      | ProjectRow
      | undefined;
    if (!row) throw new Error(`Project ${ref} not found (run: pgen projects)`);
    return row;
  }
  const all = db.prepare('SELECT id, name, archived FROM projects ORDER BY id').all() as ProjectRow[];
  const exact = all.find((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (exact) return exact;
  const prefix = all.filter((p) => p.name.toLowerCase().startsWith(ref.toLowerCase()));
  if (prefix.length === 1) return prefix[0]!;
  if (prefix.length > 1) {
    throw new Error(`Project name '${ref}' is ambiguous: ${prefix.map((p) => p.name).join(', ')}`);
  }
  throw new Error(`Project '${ref}' not found (run: pgen projects)`);
}

export interface ImageRow {
  id: string;
  file_path: string;
  format: string;
  width: number;
  height: number;
  title: string;
}

export function getImage(id: string): ImageRow | null {
  const row = getDb()
    .prepare('SELECT id, file_path, format, width, height, title FROM images WHERE id = ? AND deleted_at IS NULL')
    .get(id) as ImageRow | undefined;
  return row ?? null;
}

export function imageAbsPath(row: ImageRow): string {
  return libraryPath(row.file_path);
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const NATIVE_FORMATS: Record<string, OutputFormat> = { png: 'png', jpeg: 'jpeg', webp: 'webp' };

/**
 * Resolves a ref/base/mask argument: a library image id passes through,
 * a path on disk is imported into the library (so generation lineage
 * always points at real image rows). Prints the id so later runs can
 * reference the import instead of re-importing.
 */
export async function resolveImageRef(
  ref: string,
  projectId: number,
  kind: 'images' | 'masks' = 'images',
): Promise<ImageRow> {
  if (!fs.existsSync(ref)) {
    if (ULID_RE.test(ref)) {
      const row = getImage(ref);
      if (!row) throw new Error(`Image ${ref} not found in the library`);
      return row;
    }
    throw new Error(`'${ref}' is neither a file on disk nor a library image id`);
  }
  const raw = fs.readFileSync(ref);
  const meta = await sharp(raw).metadata();
  if (!meta.format || !meta.width || !meta.height) {
    throw new Error(`'${ref}' is not a readable image`);
  }
  let bytes = raw;
  let format = NATIVE_FORMATS[meta.format];
  if (!format) {
    bytes = await sharp(raw).png().toBuffer();
    format = 'png';
  }
  const file = await persistFile(bytes, kind, format);
  const title = path.basename(ref, path.extname(ref));
  insertImageRow({
    file,
    projectId,
    source: kind === 'masks' ? 'mask' : 'imported',
    format,
    title,
  });
  console.log(`  imported ${path.basename(ref)} -> ${file.id}`);
  const row = getImage(file.id);
  if (!row) throw new Error(`Import of '${ref}' failed to register`);
  return row;
}

/** Output location for an op: --out dir (created) keeping the name, else beside the input with a suffix. */
export function opOutPath(input: string, outDir: string | undefined, suffix: string, ext = '.png'): string {
  const stem = path.basename(input, path.extname(input));
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    return path.join(outDir, `${stem}${suffix}${ext}`);
  }
  return path.join(path.dirname(input), `${stem}${suffix}${ext}`);
}

export function parseGrid(spec: string): { rows: number; cols: number } {
  const m = /^(\d+)x(\d+)$/i.exec(spec.trim());
  if (!m) throw new Error(`Grid must be ROWSxCOLS (e.g. 3x3), got '${spec}'`);
  const rows = Number(m[1]);
  const cols = Number(m[2]);
  if (rows < 1 || cols < 1 || rows * cols > 64) throw new Error(`Grid ${spec} is out of range`);
  return { rows, cols };
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color must be #rrggbb, got '${hex}'`);
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

export function usd(amount: number | null | undefined): string {
  if (amount == null) return '?';
  return `$${amount.toFixed(4)}`;
}
