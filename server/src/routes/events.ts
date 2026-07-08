import type { FastifyInstance } from 'fastify';
import { subscribe } from '../services/events';
import type { SseEvent } from '@photo-gen/shared';

const HEARTBEAT_MS = 15_000;

export function registerEventRoutes(app: FastifyInstance): void {
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(':connected\n\n');

    const send = (event: SseEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = subscribe(send);
    const heartbeat = setInterval(
      () => send({ type: 'heartbeat', at: new Date().toISOString() }),
      HEARTBEAT_MS,
    );

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
