import type { FastifyInstance } from 'fastify';
import {
  estimateCost,
  generateRequestSchema,
  type GenerateAcceptedDto,
} from '@photo-gen/shared';
import { getDb } from '../db/db';
import { getSettings } from '../services/settings';
import { enqueue } from '../jobs/queue';

export function registerGenerateRoutes(app: FastifyInstance): void {
  app.post('/api/generate', async (req, reply) => {
    const body = generateRequestSchema.parse(req.body);

    // Reference/mask/promote flows arrive with the edits endpoint in later phases.
    if (
      body.referenceImageIds?.length ||
      body.maskImageId ||
      body.maskDataUrl ||
      body.promoteFromImageId ||
      body.characterViewId
    ) {
      return reply
        .code(501)
        .send({ error: 'Reference images, masks, and character views are not available yet' });
    }

    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(body.projectId);
    if (!project) return reply.code(404).send({ error: `Project ${body.projectId} not found` });
    if (body.folderId !== undefined) {
      const folder = db
        .prepare('SELECT id FROM folders WHERE id = ? AND project_id = ?')
        .get(body.folderId, body.projectId);
      if (!folder) return reply.code(404).send({ error: `Folder ${body.folderId} not found in project` });
    }

    const settings = getSettings();
    const estimatedCost = estimateCost(body.size, body.quality, body.n);
    const params = {
      size: body.size,
      quality: body.quality,
      n: body.n,
      outputFormat: body.outputFormat,
      outputCompression: body.outputCompression,
      moderation: settings.moderation,
      stream: false,
      partialImages: 0,
      folderId: body.folderId ?? null,
    };

    const info = db
      .prepare(
        `INSERT INTO generations (project_id, endpoint, prompt, user_prompt, params_json, cost_estimated)
         VALUES (?, 'generations', ?, ?, ?, ?)`,
      )
      .run(body.projectId, body.prompt, body.prompt, JSON.stringify(params), estimatedCost);
    const generationId = Number(info.lastInsertRowid);
    enqueue(generationId);

    const accepted: GenerateAcceptedDto = { generationId, estimatedCost };
    return reply.code(202).send(accepted);
  });
}
