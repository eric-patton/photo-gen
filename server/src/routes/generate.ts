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

    // Mask flows arrive with the inpaint editor in a later phase; character
    // views have their own endpoint (/api/character-views/:id/generate).
    if (body.maskImageId || body.maskDataUrl) {
      return reply.code(501).send({ error: 'Mask inpainting is not available yet' });
    }
    if (body.characterViewId) {
      return reply
        .code(400)
        .send({ error: 'Use POST /api/character-views/:id/generate for character views' });
    }

    const db = getDb();

    // Resolve input images: promote source becomes the base, refs follow in order.
    const inputs: { imageId: string; role: 'base' | 'reference'; position: number }[] = [];
    if (body.promoteFromImageId) {
      inputs.push({ imageId: body.promoteFromImageId, role: 'base', position: 0 });
    }
    (body.referenceImageIds ?? []).forEach((imageId, position) => {
      if (!inputs.some((i) => i.imageId === imageId)) {
        inputs.push({ imageId, role: 'reference', position });
      }
    });
    for (const input of inputs) {
      const img = db
        .prepare('SELECT id FROM images WHERE id = ? AND deleted_at IS NULL')
        .get(input.imageId);
      if (!img) return reply.code(404).send({ error: `Input image ${input.imageId} not found` });
    }
    const endpoint = inputs.length > 0 ? 'edits' : 'generations';
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

    let generationId = 0;
    db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO generations (project_id, endpoint, prompt, user_prompt, params_json, cost_estimated)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(body.projectId, endpoint, body.prompt, body.prompt, JSON.stringify(params), estimatedCost);
      generationId = Number(info.lastInsertRowid);
      const insertInput = db.prepare(
        'INSERT INTO generation_inputs (generation_id, image_id, role, position) VALUES (?, ?, ?, ?)',
      );
      for (const input of inputs) {
        insertInput.run(generationId, input.imageId, input.role, input.position);
      }
    })();
    enqueue(generationId);

    const accepted: GenerateAcceptedDto = { generationId, estimatedCost };
    return reply.code(202).send(accepted);
  });
}
