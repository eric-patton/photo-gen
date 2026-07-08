import type { FastifyInstance } from 'fastify';
import { improvePromptRequestSchema, type ImprovementDto } from '@photo-gen/shared';
import { getDb } from '../db/db';
import { improvePrompt } from '../services/promptImprover';

interface ImprovementRow {
  id: number;
  project_id: number | null;
  mode: 'generation' | 'character';
  model: string;
  speed: 'fast' | 'smart';
  effort: ImprovementDto['effort'];
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

export function registerImproveRoutes(app: FastifyInstance): void {
  app.post('/api/improve-prompt', async (req) => {
    const body = improvePromptRequestSchema.parse(req.body);
    return improvePrompt(body);
  });

  app.get<{ Querystring: { project?: string; limit?: string } }>(
    '/api/improvements',
    async (req) => {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const where: string[] = [];
      const params: unknown[] = [];
      if (req.query.project) {
        where.push('project_id = ?');
        params.push(Number(req.query.project));
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const rows = getDb()
        .prepare(`SELECT * FROM improvements ${whereSql} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit) as ImprovementRow[];
      return rows.map(
        (row): ImprovementDto => ({
          id: row.id,
          projectId: row.project_id,
          mode: row.mode,
          model: row.model,
          speed: row.speed,
          effort: row.effort,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          costUsd: row.cost_usd,
          createdAt: row.created_at,
        }),
      );
    },
  );
}
