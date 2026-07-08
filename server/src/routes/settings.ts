import type { FastifyInstance } from 'fastify';
import { settingsPatchSchema } from '@photo-gen/shared';
import { getSettings, patchSettings } from '../services/settings';

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async () => getSettings());

  app.patch('/api/settings', async (req) => {
    const patch = settingsPatchSchema.parse(req.body);
    return patchSettings(patch);
  });
}
