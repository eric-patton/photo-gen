import fs from 'node:fs';
import sharp from 'sharp';
import {
  estimateTextCost,
  IMPROVER_MODELS,
  type ImprovePromptRequest,
  type ImproveResultDto,
} from '@photo-gen/shared';
import { getDb } from '../db/db';
import { libraryPath } from '../config';
import { getImageRow } from '../repo/images';
import { getOpenAIClient } from './openaiImages';

const GENERATION_INSTRUCTIONS = `You are an expert prompt engineer for the gpt-image-2 image generation model, working on game development art (concept art, game assets, characters, environments, props, icons).
Rewrite the user's image prompt to produce a better image:
- Keep their intent and every explicit constraint they stated.
- Add concrete visual specifics where the prompt is vague: subject details, materials, lighting, composition/framing, style.
- Remove contradictions and filler. Keep it under ~150 words.
Respond with ONLY a JSON object: {"improvedPrompt": string, "notes": string} where notes is one short sentence describing what you changed.`;

const CHARACTER_INSTRUCTIONS = `You are helping define a game character for consistent multi-angle image generation with gpt-image-2.
The "description" is the canonical appearance anchor injected into every view generation. It must be specific and unambiguous: face, hair, eyes, skin, build and proportions, complete outfit with colors and materials, equipment and where each piece is worn or carried. Call out asymmetric details explicitly with left/right (e.g. "scar over the RIGHT eyebrow", "hand axe on the LEFT hip") because separate left-side and right-side views are generated from it.
The "styleNotes" describe art style only: medium, technique, palette, lighting, rendering.
Improve the user's draft: keep every detail they specified, sharpen vague wording, move misplaced content to the right field, and add missing canonical attributes conservatively.
Respond with ONLY a JSON object: {"description": string, "styleNotes": string, "notes": string} where notes is one or two short sentences listing anything you added that the user should verify.`;

const CHARACTER_FROM_IMAGE_INSTRUCTIONS = `You are helping define a game character for consistent multi-angle image generation with gpt-image-2, working from one or more reference images of the character plus the user's optional draft text.
Look carefully at the reference image(s) and write the canonical "description": the appearance anchor injected into every view generation. Describe exactly what you see — face, hair, eyes, skin, build and proportions, the complete outfit with colors and materials, and equipment with where each piece is worn or carried. Be specific and unambiguous. Call out asymmetric details explicitly with left/right (e.g. "scar over the RIGHT eyebrow", "hand axe on the LEFT hip") because separate left-side and right-side views are generated from it.
Write "styleNotes" describing the art style visible in the image: medium, technique, palette, lighting, rendering.
If the user provided draft description or style text, reconcile it with what you observe — keep the details they specified that are consistent with the image, and prefer the image where they conflict.
Respond with ONLY a JSON object: {"description": string, "styleNotes": string, "notes": string} where notes is one or two short sentences flagging anything ambiguous or hidden in the image that the user should verify.`;

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export async function improvePrompt(req: ImprovePromptRequest): Promise<ImproveResultDto> {
  const model = IMPROVER_MODELS[req.speed];
  const fromImage = req.mode === 'character' && (req.imageIds?.length ?? 0) > 0;
  const instructions =
    req.mode === 'generation'
      ? GENERATION_INSTRUCTIONS
      : fromImage
        ? CHARACTER_FROM_IMAGE_INSTRUCTIONS
        : CHARACTER_INSTRUCTIONS;
  const textInput =
    req.mode === 'generation'
      ? `Image prompt to improve:\n${req.prompt}`
      : `Character name: ${req.character.name || '(unnamed)'}\n\nCurrent description:\n${req.character.description || '(empty)'}\n\nCurrent style notes:\n${req.character.styleNotes || '(empty)'}`;

  // With reference images we send a multimodal Responses input (text + images);
  // otherwise a plain string suffices.
  let input: unknown = textInput;
  if (fromImage && req.mode === 'character') {
    const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: textInput }];
    for (const imageId of req.imageIds ?? []) {
      const dataUrl = await loadImageAsDataUrl(imageId);
      if (dataUrl) content.push({ type: 'input_image', image_url: dataUrl });
    }
    if (content.length === 1) {
      throw Object.assign(new Error('None of the selected reference images could be read'), {
        statusCode: 400,
      });
    }
    input = [{ role: 'user', content }];
  }

  const client = getOpenAIClient();
  // reasoning.effort values none/xhigh may lag in SDK types — single loose seam.
  const res = (await client.responses.create({
    model: model.id,
    instructions,
    input,
    reasoning: { effort: req.effort },
  } as unknown as Parameters<typeof client.responses.create>[0])) as {
    output_text?: string;
    usage?: ResponsesUsage;
  };

  const text = res.output_text ?? '';
  const usage = res.usage;
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : null;
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : null;
  const costUsd =
    inputTokens != null && outputTokens != null
      ? estimateTextCost(req.speed, { inputTokens, outputTokens })
      : null;

  // Record spend before parsing — the tokens are billed even if the suggestion is unusable.
  recordImprovement(req, model.id, inputTokens, outputTokens, costUsd);

  if (req.mode === 'generation') {
    const parsed = parseJson<{ improvedPrompt?: string; notes?: string }>(text);
    return {
      mode: 'generation',
      // A model that ignored the JSON instruction still gave us a usable rewrite.
      improvedPrompt: parsed?.improvedPrompt?.trim() || text.trim(),
      notes: parsed?.notes?.trim() ?? '',
      model: model.id,
      costUsd,
      inputTokens,
      outputTokens,
    };
  }

  const parsed = parseJson<{ description?: string; styleNotes?: string; notes?: string }>(text);
  if (!parsed?.description) {
    throw Object.assign(new Error('The model returned an unparseable suggestion — try again'), {
      statusCode: 502,
    });
  }
  return {
    mode: 'character',
    description: parsed.description.trim(),
    styleNotes: parsed.styleNotes?.trim() ?? req.character.styleNotes,
    notes: parsed.notes?.trim() ?? '',
    model: model.id,
    costUsd,
    inputTokens,
    outputTokens,
  };
}

function recordImprovement(
  req: ImprovePromptRequest,
  modelId: string,
  inputTokens: number | null,
  outputTokens: number | null,
  costUsd: number | null,
): void {
  const db = getDb();
  // Guard the FK: a stale client tab can send a projectId that no longer exists.
  const projectId =
    req.projectId != null && db.prepare('SELECT id FROM projects WHERE id = ?').get(req.projectId)
      ? req.projectId
      : null;
  db.prepare(
    `INSERT INTO improvements (project_id, mode, model, speed, effort, input_tokens, output_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(projectId, req.mode, modelId, req.speed, req.effort, inputTokens, outputTokens, costUsd);
}

/**
 * Reads a library image and returns it as a downsized JPEG data URL for vision
 * input. Bounding the resolution normalizes the format and keeps input-image
 * token cost in check. Returns null if the image is missing/unreadable.
 */
async function loadImageAsDataUrl(imageId: string): Promise<string | null> {
  const row = getImageRow(imageId);
  if (!row || row.deleted_at) return null;
  try {
    const bytes = fs.readFileSync(libraryPath(row.file_path));
    const jpeg = await sharp(bytes)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

function parseJson<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
