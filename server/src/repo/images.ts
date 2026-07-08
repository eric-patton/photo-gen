import type { ImageDetailDto, ImageDto, ImagePageDto, TagDto } from '@photo-gen/shared';
import { getDb } from '../db/db';
import { generationToDto, type GenerationRowFull } from './generations';

export interface ImageRow {
  id: string;
  project_id: number;
  folder_id: number | null;
  generation_id: number | null;
  source: ImageDto['source'];
  file_path: string;
  thumb_path: string | null;
  width: number;
  height: number;
  format: ImageDto['format'];
  size_bytes: number;
  title: string;
  notes: string;
  starred: number;
  created_at: string;
  deleted_at: string | null;
}

function tagsForImages(imageIds: string[]): Map<string, TagDto[]> {
  const map = new Map<string, TagDto[]>();
  if (imageIds.length === 0) return map;
  const rows = getDb()
    .prepare(
      `SELECT it.image_id, t.id, t.name FROM image_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.image_id IN (${imageIds.map(() => '?').join(',')})
       ORDER BY t.name`,
    )
    .all(...imageIds) as { image_id: string; id: number; name: string }[];
  for (const row of rows) {
    const list = map.get(row.image_id) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.image_id, list);
  }
  return map;
}

export function imageRowToDto(row: ImageRow, tags: TagDto[]): ImageDto {
  return {
    id: row.id,
    projectId: row.project_id,
    folderId: row.folder_id,
    generationId: row.generation_id,
    source: row.source,
    width: row.width,
    height: row.height,
    format: row.format,
    sizeBytes: row.size_bytes,
    title: row.title,
    notes: row.notes,
    starred: row.starred === 1,
    createdAt: row.created_at,
    tags,
  };
}

export interface ListImagesFilters {
  projectId?: number;
  folderId?: number;
  source?: string;
  starred?: boolean;
  q?: string;
  tagIds?: number[];
  characterId?: number;
  includeMasks?: boolean;
  cursor?: string;
  limit?: number;
}

export function listImages(filters: ListImagesFilters): ImagePageDto {
  const where: string[] = ['i.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (!filters.includeMasks && filters.source !== 'mask') {
    where.push(`i.source != 'mask'`);
  }
  if (filters.projectId !== undefined) {
    where.push('i.project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.folderId !== undefined) {
    where.push('i.folder_id = ?');
    params.push(filters.folderId);
  }
  if (filters.source) {
    where.push('i.source = ?');
    params.push(filters.source);
  }
  if (filters.starred) {
    where.push('i.starred = 1');
  }
  if (filters.q) {
    where.push(
      `(i.title LIKE ? ESCAPE '\\' OR i.notes LIKE ? ESCAPE '\\' OR EXISTS (
         SELECT 1 FROM generations g WHERE g.id = i.generation_id
         AND (g.prompt LIKE ? ESCAPE '\\' OR g.user_prompt LIKE ? ESCAPE '\\')))`,
    );
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like, like);
  }
  if (filters.tagIds && filters.tagIds.length > 0) {
    // AND semantics: image must carry every requested tag
    where.push(
      `(SELECT COUNT(*) FROM image_tags it WHERE it.image_id = i.id
        AND it.tag_id IN (${filters.tagIds.map(() => '?').join(',')})) = ?`,
    );
    params.push(...filters.tagIds, filters.tagIds.length);
  }
  if (filters.characterId !== undefined) {
    where.push(
      `EXISTS (SELECT 1 FROM generations g JOIN character_views cv ON cv.id = g.character_view_id
       WHERE g.id = i.generation_id AND cv.character_id = ?)`,
    );
    params.push(filters.characterId);
  }
  if (filters.cursor) {
    // ULIDs are time-ordered, so keyset pagination on id works for newest-first
    where.push('i.id < ?');
    params.push(filters.cursor);
  }

  const limit = Math.min(filters.limit ?? 100, 500);
  const rows = getDb()
    .prepare(
      `SELECT i.* FROM images i WHERE ${where.join(' AND ')} ORDER BY i.id DESC LIMIT ?`,
    )
    .all(...params, limit + 1) as ImageRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const tagMap = tagsForImages(page.map((r) => r.id));
  return {
    items: page.map((r) => imageRowToDto(r, tagMap.get(r.id) ?? [])),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export function getImageRow(id: string): ImageRow | null {
  const row = getDb().prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  return row ?? null;
}

export function getImageDetail(id: string): ImageDetailDto | null {
  const row = getImageRow(id);
  if (!row || row.deleted_at) return null;
  const tagMap = tagsForImages([id]);
  const db = getDb();

  const genRow = row.generation_id
    ? (db.prepare('SELECT * FROM generations WHERE id = ?').get(row.generation_id) as
        | GenerationRowFull
        | undefined)
    : undefined;

  const usedInRows = db
    .prepare(
      `SELECT g.* FROM generations g
       JOIN generation_inputs gi ON gi.generation_id = g.id
       WHERE gi.image_id = ?
       GROUP BY g.id ORDER BY g.id DESC`,
    )
    .all(id) as GenerationRowFull[];

  return {
    ...imageRowToDto(row, tagMap.get(id) ?? []),
    filePath: row.file_path,
    generation: genRow ? generationToDto(genRow) : null,
    usedIn: usedInRows.map(generationToDto),
  };
}
