import type { FastifyInstance } from 'fastify';
import { improvePromptRequestSchema } from '@photo-gen/shared';
import { improvePrompt } from '../services/promptImprover';

export function registerImproveRoutes(app: FastifyInstance): void {
  app.post('/api/improve-prompt', async (req) => {
    const body = improvePromptRequestSchema.parse(req.body);
    return improvePrompt(body);
  });
}
