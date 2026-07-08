import type { FastifyInstance } from 'fastify';
import type { CostSummaryDto } from '@photo-gen/shared';
import { getDb } from '../db/db';

export function registerCostRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { project?: string; from?: string; to?: string } }>(
    '/api/costs/summary',
    async (req) => {
      const where: string[] = [`g.status = 'succeeded'`];
      const params: unknown[] = [];
      if (req.query.project) {
        where.push('g.project_id = ?');
        params.push(Number(req.query.project));
      }
      if (req.query.from) {
        where.push(`date(g.created_at) >= date(?)`);
        params.push(req.query.from);
      }
      if (req.query.to) {
        where.push(`date(g.created_at) <= date(?)`);
        params.push(req.query.to);
      }
      const whereSql = where.join(' AND ');
      const db = getDb();
      const cost = `COALESCE(g.cost_actual, g.cost_estimated)`;

      const total =
        (
          db.prepare(`SELECT SUM(${cost}) AS total FROM generations g WHERE ${whereSql}`).get(...params) as {
            total: number | null;
          }
        ).total ?? 0;

      const byProject = db
        .prepare(
          `SELECT g.project_id, p.name, SUM(${cost}) AS total
           FROM generations g JOIN projects p ON p.id = g.project_id
           WHERE ${whereSql} GROUP BY g.project_id ORDER BY total DESC`,
        )
        .all(...params) as { project_id: number; name: string; total: number }[];

      const byDay = db
        .prepare(
          `SELECT date(g.created_at) AS day, SUM(${cost}) AS total
           FROM generations g WHERE ${whereSql} GROUP BY day ORDER BY day`,
        )
        .all(...params) as { day: string; total: number }[];

      const byQuality = db
        .prepare(
          `SELECT json_extract(g.params_json, '$.quality') AS quality, SUM(${cost}) AS total, COUNT(*) AS count
           FROM generations g WHERE ${whereSql} GROUP BY quality ORDER BY total DESC`,
        )
        .all(...params) as { quality: string; total: number; count: number }[];

      const summary: CostSummaryDto = {
        total,
        byProject: byProject.map((r) => ({ projectId: r.project_id, projectName: r.name, total: r.total })),
        byDay: byDay.map((r) => ({ day: r.day, total: r.total })),
        byQuality,
      };
      return summary;
    },
  );
}
