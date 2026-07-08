import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // server/src

export const REPO_ROOT = path.resolve(here, '..', '..');
export const SERVER_ROOT = path.resolve(here, '..');
export const WEB_DIST = path.join(REPO_ROOT, 'web', 'dist');

export const LIBRARY_ROOT = process.env.PHOTO_GEN_LIBRARY
  ? path.resolve(process.env.PHOTO_GEN_LIBRARY)
  : path.join(REPO_ROOT, 'library');

export const PORT = Number(process.env.PHOTO_GEN_PORT ?? 8787);

const LIBRARY_SUBDIRS = ['images', 'thumbs', 'masks', path.join('imports', 'originals'), 'tmp'];

export function ensureLibraryDirs(): void {
  fs.mkdirSync(LIBRARY_ROOT, { recursive: true });
  for (const sub of LIBRARY_SUBDIRS) {
    fs.mkdirSync(path.join(LIBRARY_ROOT, sub), { recursive: true });
  }
}

/** Resolve a library-relative path (stored with forward slashes) to an absolute path. */
export function libraryPath(relPath: string): string {
  return path.join(LIBRARY_ROOT, relPath);
}
