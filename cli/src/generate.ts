import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { estimateCost, validateSize, type OutputFormat, type Quality } from '@photo-gen/shared';
import { getDb } from '@photo-gen/server/db/db';
import { libraryPath } from '@photo-gen/server/config';
import { getSettings } from '@photo-gen/server/services/settings';
import { insertImageRow, persistFile, type PersistedFile } from '@photo-gen/server/services/library';
import {
  classifyError,
  editImages,
  generateImages,
  type ImageCallResult,
  type InputImage,
} from '@photo-gen/server/services/openaiImages';
import { resolveImageRef, resolveProject, usd, parseGrid, type ImageRow } from './lib.js';
import { cutoutFile } from './ops.js';
import { buildPrompt, resolveStyle, type ScaffoldKind } from './scaffold.js';

export interface GenOptions {
  project: string;
  ref: string[];
  base?: string;
  mask?: string;
  style?: string;
  scaffold?: string;
  sheet?: string;
  size: string;
  quality: string;
  n: string;
  cutout?: string | boolean;
  format: string;
  out?: string;
  name?: string;
  title?: string;
  dryRun?: boolean;
}

const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

export async function runGen(userPrompt: string, opts: GenOptions): Promise<void> {
  const project = resolveProject(opts.project);
  const n = Number(opts.n);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error(`-n must be 1-8, got '${opts.n}'`);
  const sizeCheck = validateSize(opts.size);
  if (!sizeCheck.ok) throw new Error(sizeCheck.errors.join('; '));
  if (!['low', 'medium', 'high', 'auto'].includes(opts.quality)) {
    throw new Error(`Quality must be low|medium|high|auto, got '${opts.quality}'`);
  }
  let outputFormat = opts.format as OutputFormat;
  if (!['png', 'jpeg', 'webp'].includes(outputFormat)) {
    throw new Error(`Format must be png|jpeg|webp, got '${opts.format}'`);
  }
  if (opts.cutout && outputFormat === 'jpeg') {
    outputFormat = 'png'; // jpeg compression noise breaks the cutout flood fill
  }
  if (opts.scaffold && !['icon', 'sprite', 'portrait'].includes(opts.scaffold)) {
    throw new Error(`Scaffold must be icon|sprite|portrait, got '${opts.scaffold}'`);
  }

  const style = opts.style ? resolveStyle(opts.style) : undefined;
  const sheet = opts.sheet ? parseGrid(opts.sheet) : undefined;
  const prompt = buildPrompt(userPrompt, {
    scaffold: opts.scaffold as ScaffoldKind | undefined,
    sheet,
    cutout: Boolean(opts.cutout),
    style,
  });

  const estimated = estimateCost(opts.size, opts.quality as Quality, n);
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Estimated cost: ${usd(estimated)} (${opts.size} ${opts.quality} x${n})`);
  if (opts.dryRun) return;

  // Resolve inputs after the dry-run gate so a dry run never imports anything.
  const inputs: { row: ImageRow; role: 'base' | 'reference' | 'mask'; position: number }[] = [];
  if (opts.base) {
    inputs.push({ row: await resolveImageRef(opts.base, project.id), role: 'base', position: 0 });
  }
  for (let i = 0; i < opts.ref.length; i++) {
    inputs.push({ row: await resolveImageRef(opts.ref[i]!, project.id), role: 'reference', position: i });
  }
  if (opts.mask) {
    if (!opts.base) throw new Error('--mask requires --base');
    const maskRow = await resolveImageRef(opts.mask, project.id, 'masks');
    const maskMeta = await sharp(libraryPath(maskRow.file_path)).metadata();
    if (maskMeta.format !== 'png' || !maskMeta.hasAlpha) {
      throw new Error('Mask must be a PNG with an alpha channel');
    }
    const base = inputs[0]!.row;
    if (maskRow.width !== base.width || maskRow.height !== base.height) {
      throw new Error(
        `Mask ${maskRow.width}x${maskRow.height} must match the base image (${base.width}x${base.height})`,
      );
    }
    inputs.push({ row: maskRow, role: 'mask', position: 0 });
  }
  const endpoint = inputs.length > 0 ? 'edits' : 'generations';

  const settings = getSettings();
  const params = {
    size: opts.size,
    quality: opts.quality,
    n,
    outputFormat,
    moderation: settings.moderation,
    stream: false,
    partialImages: 0,
    folderId: null,
  };

  // The CLI runs synchronously, so the row goes straight to 'running'
  // (a 'queued' row would be re-enqueued if the web server booted mid-run).
  const db = getDb();
  let generationId = 0;
  db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO generations (project_id, endpoint, prompt, user_prompt, params_json, cost_estimated,
                                  status, attempt, started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', 1, datetime('now'))`,
      )
      .run(project.id, endpoint, prompt, userPrompt, JSON.stringify(params), estimated);
    generationId = Number(info.lastInsertRowid);
    const insertInput = db.prepare(
      'INSERT INTO generation_inputs (generation_id, image_id, role, position) VALUES (?, ?, ?, ?)',
    );
    for (const input of inputs) {
      insertInput.run(generationId, input.row.id, input.role, input.position);
    }
  })();

  const startedMs = Date.now();
  let result: ImageCallResult;
  try {
    result = await callWithRetries(generationId, prompt, params, inputs);
  } catch (err) {
    const classified = classifyError(err);
    db.prepare(
      `UPDATE generations
       SET status = 'failed', error_code = ?, error_message = ?, moderation_json = ?,
           finished_at = datetime('now'), duration_ms = ?
       WHERE id = ?`,
    ).run(
      classified.code,
      classified.message,
      classified.moderationDetails ? JSON.stringify(classified.moderationDetails) : null,
      Date.now() - startedMs,
      generationId,
    );
    let detail = classified.message;
    if (classified.moderationDetails?.categories?.length) {
      detail += ` (moderation: ${classified.moderationDetails.categories.join(', ')})`;
    }
    throw new Error(`Generation ${generationId} failed: ${detail}`);
  }

  const files: PersistedFile[] = [];
  for (const bytes of result.images) {
    files.push(await persistFile(bytes, 'images', outputFormat));
  }
  const costActual = computeActualCost(result.usage);
  const imageIds: string[] = [];
  db.transaction(() => {
    for (const file of files) {
      imageIds.push(
        insertImageRow({
          file,
          projectId: project.id,
          generationId,
          source: 'generated',
          format: outputFormat,
          title: opts.title ?? '',
        }),
      );
    }
    db.prepare(
      `UPDATE generations
       SET status = 'succeeded', usage_json = ?, cost_actual = ?,
           finished_at = datetime('now'), duration_ms = ?
       WHERE id = ?`,
    ).run(result.usage ? JSON.stringify(result.usage) : null, costActual, Date.now() - startedMs, generationId);
  })();

  console.log(`Generation ${generationId} succeeded in ${((Date.now() - startedMs) / 1000).toFixed(1)}s, cost ${usd(costActual ?? estimated)}`);
  const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
  const nameBase = opts.name ?? slug(opts.title ?? userPrompt);
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const abs = libraryPath(file.filePath);
    const stem = files.length > 1 ? `${nameBase}-${i + 1}` : nameBase;
    let shown = abs;
    if (opts.out) {
      fs.mkdirSync(opts.out, { recursive: true });
      shown = path.join(opts.out, `${stem}.${ext}`);
      fs.copyFileSync(abs, shown);
    }
    console.log(`  ${imageIds[i]}  ${shown}`);
    if (opts.cutout) {
      const key = typeof opts.cutout === 'string' ? opts.cutout : 'auto';
      const cutFile = path.join(opts.out ?? '.', `${stem}-cut.png`);
      const size = await cutoutFile(abs, cutFile, { key, tolerance: 24, threshold: 8, pad: 0 });
      if (size) console.log(`  cutout -> ${cutFile}  (${size.width}x${size.height})`);
      else console.warn('  cutout removed everything, skipped');
    }
  }
}

async function callWithRetries(
  generationId: number,
  prompt: string,
  params: {
    size: string;
    quality: string;
    n: number;
    outputFormat: OutputFormat;
    moderation: 'auto' | 'low';
  },
  inputs: { row: ImageRow; role: string }[],
): Promise<ImageCallResult> {
  const db = getDb();
  const common = {
    prompt,
    size: params.size,
    quality: params.quality,
    n: params.n,
    outputFormat: params.outputFormat,
    moderation: params.moderation,
  };
  let attempt = 0;
  for (;;) {
    attempt++;
    if (attempt > 1) db.prepare('UPDATE generations SET attempt = ? WHERE id = ?').run(attempt, generationId);
    try {
      if (inputs.length === 0) return await generateImages(common);
      const inputImages: InputImage[] = [];
      let mask: InputImage | undefined;
      for (const input of inputs) {
        const img: InputImage = {
          bytes: fs.readFileSync(libraryPath(input.row.file_path)),
          name: path.basename(input.row.file_path),
          mimeType:
            input.row.format === 'png' ? 'image/png' : input.row.format === 'webp' ? 'image/webp' : 'image/jpeg',
        };
        if (input.role === 'mask') mask = img;
        else inputImages.push(img);
      }
      return await editImages({ ...common, inputImages, mask });
    } catch (err) {
      const classified = classifyError(err);
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (!classified.retryable || delay === undefined) throw err;
      console.warn(`  attempt ${attempt} failed (${classified.message}); retrying in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Mirrors the server queue's cost math: settings hold per-token prices.
function computeActualCost(usage: unknown): number | null {
  const settings = getSettings();
  if (settings.outputTokenPriceUsd <= 0 || !usage || typeof usage !== 'object') return null;
  const u = usage as {
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
  if (typeof u.output_tokens !== 'number') return null;
  const textIn = u.input_tokens_details?.text_tokens ?? 0;
  const imageIn = u.input_tokens_details?.image_tokens ?? 0;
  return (
    textIn * settings.textInputTokenPriceUsd +
    imageIn * settings.imageInputTokenPriceUsd +
    u.output_tokens * settings.outputTokenPriceUsd
  );
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s || 'asset';
}
