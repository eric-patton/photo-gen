import type { FastifyInstance } from 'fastify';
import type { CostSummaryDto } from '@photo-gen/shared';
import { getDb } from '../db/db';

export function registerCostRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { project?: string; from?: string; to?: string } }>(
    '/api/costs/summary',
    async (req) => {
      // Same project/date filters applied to both spend sources; the alias
      // parameter lets each query qualify columns with its own table alias.
      const buildWhere = (alias: string, extra: string[]) => {
        const where = [...extra];
        const params: unknown[] = [];
        if (req.query.project) {
          where.push(`${alias}.project_id = ?`);
          params.push(Number(req.query.project));
        }
        if (req.query.from) {
          where.push(`date(${alias}.created_at) >= date(?)`);
          params.push(req.query.from);
        }
        if (req.query.to) {
          where.push(`date(${alias}.created_at) <= date(?)`);
          params.push(req.query.to);
        }
        return { sql: where.join(' AND '), params };
      };
      const genWhere = buildWhere('g', [`g.status = 'succeeded'`]);
      const impWhere = buildWhere('i', ['1=1']);

      const db = getDb();
      const genCost = `COALESCE(g.cost_actual, g.cost_estimated)`;
      const impCost = `COALESCE(i.cost_usd, 0)`;

      const imagesTotal =
        (
          db
            .prepare(`SELECT SUM(${genCost}) AS total FROM generations g WHERE ${genWhere.sql}`)
            .get(...genWhere.params) as { total: number | null }
        ).total ?? 0;

      const improveRow = db
        .prepare(
          `SELECT SUM(${impCost}) AS total, COUNT(*) AS count FROM improvements i WHERE ${impWhere.sql}`,
        )
        .get(...impWhere.params) as { total: number | null; count: number };
      const improveTotal = improveRow.total ?? 0;

      const byProjectGen = db
        .prepare(
          `SELECT g.project_id, p.name, SUM(${genCost}) AS total
           FROM generations g JOIN projects p ON p.id = g.project_id
           WHERE ${genWhere.sql} GROUP BY g.project_id`,
        )
        .all(...genWhere.params) as { project_id: number; name: string; total: number }[];
      const byProjectImp = db
        .prepare(
          `SELECT i.project_id, p.name, SUM(${impCost}) AS total
           FROM improvements i JOIN projects p ON p.id = i.project_id
           WHERE ${impWhere.sql} GROUP BY i.project_id`,
        )
        .all(...impWhere.params) as { project_id: number; name: string; total: number }[];
      const projectTotals = new Map<number, { projectId: number; projectName: string; total: number }>();
      for (const row of [...byProjectGen, ...byProjectImp]) {
        const entry = projectTotals.get(row.project_id) ?? {
          projectId: row.project_id,
          projectName: row.name,
          total: 0,
        };
        entry.total += row.total;
        projectTotals.set(row.project_id, entry);
      }

      const byDayGen = db
        .prepare(
          `SELECT date(g.created_at) AS day, SUM(${genCost}) AS total
           FROM generations g WHERE ${genWhere.sql} GROUP BY day`,
        )
        .all(...genWhere.params) as { day: string; total: number }[];
      const byDayImp = db
        .prepare(
          `SELECT date(i.created_at) AS day, SUM(${impCost}) AS total
           FROM improvements i WHERE ${impWhere.sql} GROUP BY day`,
        )
        .all(...impWhere.params) as { day: string; total: number }[];
      const dayTotals = new Map<string, number>();
      for (const row of [...byDayGen, ...byDayImp]) {
        dayTotals.set(row.day, (dayTotals.get(row.day) ?? 0) + row.total);
      }

      const byQuality = db
        .prepare(
          `SELECT json_extract(g.params_json, '$.quality') AS quality, SUM(${genCost}) AS total, COUNT(*) AS count
           FROM generations g WHERE ${genWhere.sql} GROUP BY quality ORDER BY total DESC`,
        )
        .all(...genWhere.params) as { quality: string; total: number; count: number }[];

      const summary: CostSummaryDto = {
        total: imagesTotal + improveTotal,
        imagesTotal,
        improveTotal,
        improveCount: improveRow.count,
        byProject: [...projectTotals.values()].sort((a, b) => b.total - a.total),
        byDay: [...dayTotals.entries()]
          .map(([day, total]) => ({ day, total }))
          .sort((a, b) => a.day.localeCompare(b.day)),
        byQuality,
      };
      return summary;
    },
  );
}
