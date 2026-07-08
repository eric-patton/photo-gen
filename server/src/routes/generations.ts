import type { FastifyInstance } from 'fastify';
import { getGeneration, listGenerations } from '../repo/generations';
import { cancel, getPartial } from '../jobs/queue';

export function registerGenerationRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { project?: string; status?: string; limit?: string } }>(
    '/api/generations',
    async (req) => {
      const { project, status, limit } = req.query;
      return listGenerations({
        projectId: project ? Number(project) : undefined,
        statuses: status ? status.split(',').filter(Boolean) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/generations/:id', async (req, reply) => {
    const gen = getGeneration(Number(req.params.id));
    if (!gen) return reply.code(404).send({ error: 'Generation not found' });
    return gen;
  });

  app.post<{ Params: { id: string } }>('/api/generations/:id/cancel', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getGeneration(id)) return reply.code(404).send({ error: 'Generation not found' });
    const canceled = cancel(id);
    if (!canceled) return reply.code(409).send({ error: 'Generation is not queued or running' });
    return reply.code(202).send({ ok: true });
  });

  app.get<{ Params: { id: string } }>('/api/generations/:id/partial', async (req, reply) => {
    const partial = getPartial(Number(req.params.id));
    if (!partial) return reply.code(404).send({ error: 'No partial image available' });
    return reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'no-store')
      .header('X-Partial-Index', String(partial.index))
      .send(partial.buffer);
  });
}
