import type { FastifyInstance } from 'fastify';
import {
  characterUpsertSchema,
  characterViewGenerateSchema,
  characterViewUpsertSchema,
  estimateCost,
  type CharacterDto,
  type CharacterViewDto,
  type GenerateAcceptedDto,
} from '@photo-gen/shared';
import { z } from 'zod';
import { getDb } from '../db/db';
import { getSettings } from '../services/settings';
import {
  composeViewAnchorPrompt,
  composeViewEditPrompt,
  DEFAULT_SLOTS,
  gatherViewRefs,
  type CharacterRow,
  type CharacterViewRow,
} from '../services/characterPrompts';
import { enqueue } from '../jobs/queue';

function viewRowToDto(row: CharacterViewRow): CharacterViewDto {
  return {
    id: row.id,
    characterId: row.character_id,
    slot: row.slot,
    label: row.label,
    promptHint: row.prompt_hint,
    approvedImageId: row.approved_image_id,
    sortOrder: row.sort_order,
  };
}

function characterToDto(row: CharacterRow): CharacterDto {
  const views = getDb()
    .prepare('SELECT * FROM character_views WHERE character_id = ? ORDER BY sort_order, id')
    .all(row.id) as CharacterViewRow[];
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    styleNotes: row.style_notes,
    createdAt: row.created_at,
    views: views.map(viewRowToDto),
  };
}

function getCharacterRow(id: number): CharacterRow | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id) as CharacterRow | undefined;
}

function getViewRow(id: number): CharacterViewRow | undefined {
  return getDb().prepare('SELECT * FROM character_views WHERE id = ?').get(id) as
    | CharacterViewRow
    | undefined;
}

export function registerCharacterRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { project?: string } }>('/api/characters', async (req) => {
    const where = req.query.project ? 'WHERE project_id = ?' : '';
    const params = req.query.project ? [Number(req.query.project)] : [];
    const rows = getDb()
      .prepare(`SELECT * FROM characters ${where} ORDER BY name`)
      .all(...params) as CharacterRow[];
    return rows.map(characterToDto);
  });

  app.post('/api/characters', async (req, reply) => {
    const body = characterUpsertSchema.parse(req.body);
    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(body.projectId)) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const dup = db
      .prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?')
      .get(body.projectId, body.name);
    if (dup) return reply.code(409).send({ error: `Character '${body.name}' already exists in this project` });

    let characterId = 0;
    db.transaction(() => {
      const info = db
        .prepare('INSERT INTO characters (project_id, name, description, style_notes) VALUES (?, ?, ?, ?)')
        .run(body.projectId, body.name, body.description, body.styleNotes);
      characterId = Number(info.lastInsertRowid);
      const insertView = db.prepare(
        'INSERT INTO character_views (character_id, slot, label, sort_order) VALUES (?, ?, ?, ?)',
      );
      for (const slot of DEFAULT_SLOTS) {
        insertView.run(characterId, slot.slot, slot.label, slot.sortOrder);
      }
    })();
    return reply.code(201).send(characterToDto(getCharacterRow(characterId)!));
  });

  app.get<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const row = getCharacterRow(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'Character not found' });
    return characterToDto(row);
  });

  app.patch<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const row = getCharacterRow(id);
    if (!row) return reply.code(404).send({ error: 'Character not found' });
    const body = characterUpsertSchema.partial().parse(req.body);
    getDb()
      .prepare('UPDATE characters SET name = ?, description = ?, style_notes = ? WHERE id = ?')
      .run(body.name ?? row.name, body.description ?? row.description, body.styleNotes ?? row.style_notes, id);
    return characterToDto(getCharacterRow(id)!);
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const db = getDb();
    let changes = 0;
    db.transaction(() => {
      // Generations keep their history but drop the view link (FK is NO ACTION).
      db.prepare(
        `UPDATE generations SET character_view_id = NULL
         WHERE character_view_id IN (SELECT id FROM character_views WHERE character_id = ?)`,
      ).run(id);
      changes = db.prepare('DELETE FROM characters WHERE id = ?').run(id).changes;
    })();
    if (changes === 0) return reply.code(404).send({ error: 'Character not found' });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/views', async (req, reply) => {
    const characterId = Number(req.params.id);
    if (!getCharacterRow(characterId)) return reply.code(404).send({ error: 'Character not found' });
    const body = characterViewUpsertSchema.parse(req.body);
    const db = getDb();
    const dup = db
      .prepare('SELECT id FROM character_views WHERE character_id = ? AND slot = ?')
      .get(characterId, body.slot);
    if (dup) return reply.code(409).send({ error: `View slot '${body.slot}' already exists` });
    const info = db
      .prepare(
        'INSERT INTO character_views (character_id, slot, label, prompt_hint, sort_order) VALUES (?, ?, ?, ?, ?)',
      )
      .run(characterId, body.slot, body.label, body.promptHint, body.sortOrder);
    return reply.code(201).send(viewRowToDto(getViewRow(Number(info.lastInsertRowid))!));
  });

  app.patch<{ Params: { id: string } }>('/api/character-views/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const row = getViewRow(id);
    if (!row) return reply.code(404).send({ error: 'View not found' });
    const body = characterViewUpsertSchema.partial().parse(req.body);
    getDb()
      .prepare('UPDATE character_views SET label = ?, prompt_hint = ?, sort_order = ? WHERE id = ?')
      .run(body.label ?? row.label, body.promptHint ?? row.prompt_hint, body.sortOrder ?? row.sort_order, id);
    return viewRowToDto(getViewRow(id)!);
  });

  app.delete<{ Params: { id: string } }>('/api/character-views/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const db = getDb();
    let changes = 0;
    db.transaction(() => {
      db.prepare('UPDATE generations SET character_view_id = NULL WHERE character_view_id = ?').run(id);
      changes = db.prepare('DELETE FROM character_views WHERE id = ?').run(id).changes;
    })();
    if (changes === 0) return reply.code(404).send({ error: 'View not found' });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/character-views/:id/approve', async (req, reply) => {
    const id = Number(req.params.id);
    const view = getViewRow(id);
    if (!view) return reply.code(404).send({ error: 'View not found' });
    const body = z.object({ imageId: z.string().min(1).nullable() }).parse(req.body);
    const db = getDb();
    if (body.imageId) {
      const img = db
        .prepare('SELECT id FROM images WHERE id = ? AND deleted_at IS NULL')
        .get(body.imageId);
      if (!img) return reply.code(404).send({ error: 'Image not found' });
    }
    db.prepare('UPDATE character_views SET approved_image_id = ? WHERE id = ?').run(body.imageId, id);
    return viewRowToDto(getViewRow(id)!);
  });

  app.post<{ Params: { id: string } }>('/api/character-views/:id/generate', async (req, reply) => {
    const viewId = Number(req.params.id);
    const view = getViewRow(viewId);
    if (!view) return reply.code(404).send({ error: 'View not found' });
    const character = getCharacterRow(view.character_id)!;
    const body = characterViewGenerateSchema.parse(req.body ?? {});

    const refs = gatherViewRefs(view, body.extraRefIds ?? []);
    const isAnchor = refs.length === 0;
    const prompt = isAnchor
      ? composeViewAnchorPrompt(character, view, body.extraPrompt)
      : composeViewEditPrompt(character, view, body.extraPrompt);

    const settings = getSettings();
    const estimatedCost = estimateCost(body.size, body.quality, body.n);
    const params = {
      size: body.size,
      quality: body.quality,
      n: body.n,
      outputFormat: settings.defaultOutputFormat,
      moderation: settings.moderation,
      stream: false,
      partialImages: 0,
      folderId: null,
    };

    const db = getDb();
    let generationId = 0;
    db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO generations (project_id, character_view_id, endpoint, prompt, user_prompt, params_json, cost_estimated)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          character.project_id,
          viewId,
          isAnchor ? 'generations' : 'edits',
          prompt,
          body.extraPrompt,
          JSON.stringify(params),
          estimatedCost,
        );
      generationId = Number(info.lastInsertRowid);
      const insertInput = db.prepare(
        'INSERT INTO generation_inputs (generation_id, image_id, role, position) VALUES (?, ?, ?, ?)',
      );
      refs.forEach((imageId, position) => insertInput.run(generationId, imageId, 'reference', position));
    })();
    enqueue(generationId);

    return reply.code(202).send({ generationId, estimatedCost } satisfies GenerateAcceptedDto);
  });
}
