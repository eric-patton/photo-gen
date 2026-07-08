import type { GenerationDto, GenerationInputDto } from '@photo-gen/shared';
import { getDb } from '../db/db';

export interface GenerationRowFull {
  id: number;
  project_id: number;
  character_view_id: number | null;
  endpoint: 'generations' | 'edits';
  prompt: string;
  user_prompt: string;
  params_json: string;
  status: GenerationDto['status'];
  error_code: string | null;
  error_message: string | null;
  moderation_json: string | null;
  usage_json: string | null;
  cost_estimated: number;
  cost_actual: number | null;
  attempt: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export function generationToDto(row: GenerationRowFull): GenerationDto {
  const db = getDb();
  const inputs = db
    .prepare(
      `SELECT image_id, role, position FROM generation_inputs
       WHERE generation_id = ?
       ORDER BY CASE role WHEN 'base' THEN 0 WHEN 'reference' THEN 1 ELSE 2 END, position`,
    )
    .all(row.id) as { image_id: string; role: GenerationInputDto['role']; position: number }[];
  const outputs = db
    .prepare(`SELECT id FROM images WHERE generation_id = ? AND deleted_at IS NULL ORDER BY id`)
    .all(row.id) as { id: string }[];

  return {
    id: row.id,
    projectId: row.project_id,
    characterViewId: row.character_view_id,
    endpoint: row.endpoint,
    prompt: row.prompt,
    userPrompt: row.user_prompt,
    params: JSON.parse(row.params_json),
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    moderationDetails: row.moderation_json ? JSON.parse(row.moderation_json) : null,
    costEstimated: row.cost_estimated,
    costActual: row.cost_actual,
    attempt: row.attempt,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    inputs: inputs.map((i) => ({ imageId: i.image_id, role: i.role, position: i.position })),
    outputImageIds: outputs.map((o) => o.id),
  };
}

export function getGeneration(id: number): GenerationDto | null {
  const row = getDb().prepare('SELECT * FROM generations WHERE id = ?').get(id) as
    | GenerationRowFull
    | undefined;
  return row ? generationToDto(row) : null;
}

export interface ListGenerationsFilters {
  projectId?: number;
  statuses?: string[];
  viewId?: number;
  characterId?: number;
  limit?: number;
}

export function listGenerations(filters: ListGenerationsFilters): GenerationDto[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.projectId !== undefined) {
    where.push('project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.viewId !== undefined) {
    where.push('character_view_id = ?');
    params.push(filters.viewId);
  }
  if (filters.characterId !== undefined) {
    where.push(
      'character_view_id IN (SELECT id FROM character_views WHERE character_id = ?)',
    );
    params.push(filters.characterId);
  }
  if (filters.statuses && filters.statuses.length > 0) {
    where.push(`status IN (${filters.statuses.map(() => '?').join(',')})`);
    params.push(...filters.statuses);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(`SELECT * FROM generations ${whereSql} ORDER BY id DESC LIMIT ?`)
    .all(...params, filters.limit ?? 50) as GenerationRowFull[];
  return rows.map(generationToDto);
}
