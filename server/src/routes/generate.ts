import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import {
  estimateCost,
  generateRequestSchema,
  type GenerateAcceptedDto,
} from '@photo-gen/shared';
import { getDb } from '../db/db';
import { getSettings } from '../services/settings';
import { insertImageRow, persistFile } from '../services/library';
import { getImageRow } from '../repo/images';
import { enqueue } from '../jobs/queue';

export function registerGenerateRoutes(app: FastifyInstance): void {
  app.post('/api/generate', async (req, reply) => {
    const body = generateRequestSchema.parse(req.body);

    if (body.characterViewId) {
      return reply
        .code(400)
        .send({ error: 'Use POST /api/character-views/:id/generate for character views' });
    }
    if (body.baseImageId && body.promoteFromImageId) {
      return reply.code(400).send({ error: 'Provide either baseImageId or promoteFromImageId, not both' });
    }
    const baseImageId = body.baseImageId ?? body.promoteFromImageId;
    if ((body.maskImageId || body.maskDataUrl) && !baseImageId) {
      return reply.code(400).send({ error: 'A mask requires a base image (baseImageId)' });
    }
    if (body.maskImageId && body.maskDataUrl) {
      return reply.code(400).send({ error: 'Provide either maskImageId or maskDataUrl, not both' });
    }

    const db = getDb();

    // Resolve input images: base first (mask applies to it), refs follow in order.
    const inputs: { imageId: string; role: 'base' | 'reference' | 'mask'; position: number }[] = [];
    if (baseImageId) {
      inputs.push({ imageId: baseImageId, role: 'base', position: 0 });
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

    // Mask: an existing mask image, or a freshly painted data URL persisted as one.
    if (body.maskImageId) {
      const mask = getImageRow(body.maskImageId);
      if (!mask || mask.deleted_at) return reply.code(404).send({ error: 'Mask image not found' });
      inputs.push({ imageId: body.maskImageId, role: 'mask', position: 0 });
    } else if (body.maskDataUrl) {
      const base = getImageRow(baseImageId!);
      if (!base) return reply.code(404).send({ error: 'Base image not found' });
      const maskBytes = Buffer.from(body.maskDataUrl.split(',', 2)[1] ?? '', 'base64');
      const meta = await sharp(maskBytes).metadata();
      if (meta.format !== 'png' || !meta.hasAlpha) {
        return reply.code(400).send({ error: 'Mask must be a PNG with an alpha channel' });
      }
      if (meta.width !== base.width || meta.height !== base.height) {
        return reply.code(400).send({
          error: `Mask size ${meta.width}x${meta.height} must match the base image (${base.width}x${base.height})`,
        });
      }
      const maskFile = await persistFile(maskBytes, 'masks', 'png');
      insertImageRow({
        file: maskFile,
        projectId: body.projectId,
        source: 'mask',
        format: 'png',
        title: 'Inpaint mask',
      });
      inputs.push({ imageId: maskFile.id, role: 'mask', position: 0 });
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

    // Promoting a character-view candidate inherits the view linkage: the
    // high-quality result lands in the slot and replaces the approved image.
    let characterViewId: number | null = null;
    if (body.promoteFromImageId) {
      const src = db
        .prepare(
          `SELECT g.character_view_id AS viewId
           FROM images i JOIN generations g ON g.id = i.generation_id
           WHERE i.id = ?`,
        )
        .get(body.promoteFromImageId) as { viewId: number | null } | undefined;
      if (src?.viewId && db.prepare('SELECT id FROM character_views WHERE id = ?').get(src.viewId)) {
        characterViewId = src.viewId;
      }
    }

    const settings = getSettings();
    const estimatedCost = estimateCost(body.size, body.quality, body.n);
    const canStream = endpoint === 'generations' && body.n === 1 && settings.partialImages > 0;
    const params = {
      size: body.size,
      quality: body.quality,
      n: body.n,
      outputFormat: body.outputFormat,
      outputCompression: body.outputCompression,
      moderation: settings.moderation,
      stream: canStream,
      partialImages: canStream ? settings.partialImages : 0,
      folderId: body.folderId ?? null,
      ...(characterViewId != null ? { autoApproveView: true } : {}),
    };

    let generationId = 0;
    db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO generations (project_id, character_view_id, endpoint, prompt, user_prompt, params_json, cost_estimated)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.projectId,
          characterViewId,
          endpoint,
          body.prompt,
          body.prompt,
          JSON.stringify(params),
          estimatedCost,
        );
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
