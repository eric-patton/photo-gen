import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { WEB_DIST } from './config';
import { registerGenerateRoutes } from './routes/generate';
import { registerGenerationRoutes } from './routes/generations';
import { registerImageRoutes } from './routes/images';
import { registerEventRoutes } from './routes/events';
import { registerProjectRoutes } from './routes/projects';
import { registerFolderRoutes } from './routes/folders';
import { registerTagRoutes } from './routes/tags';
import { registerImportRoutes } from './routes/import';
import { registerCostRoutes } from './routes/costs';
import { registerSettingsRoutes } from './routes/settings';

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

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.log.error(err);
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
    return reply.code(status).send({ error: e.message ?? 'Internal server error' });
  });

  app.get('/api/health', async () => ({ ok: true, name: 'photo-gen', version: '0.1.0' }));

  registerProjectRoutes(app);
  registerFolderRoutes(app);
  registerTagRoutes(app);
  registerGenerateRoutes(app);
  registerGenerationRoutes(app);
  registerImageRoutes(app);
  registerImportRoutes(app);
  registerCostRoutes(app);
  registerSettingsRoutes(app);
  registerEventRoutes(app);

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
