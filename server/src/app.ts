import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { WEB_DIST } from './config';

export interface AppOptions {
  serveStatic: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    // Generations can take up to ~2 minutes; never kill long requests.
    connectionTimeout: 0,
    requestTimeout: 0,
    keepAliveTimeout: 10 * 60 * 1000,
    // Painted masks arrive as base64 data URLs in JSON.
    bodyLimit: 64 * 1024 * 1024,
  });

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 32 },
  });

  app.get('/api/health', async () => ({ ok: true, name: 'photo-gen', version: '0.1.0' }));

  if (opts.serveStatic) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback: unknown non-API GETs get index.html.
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
