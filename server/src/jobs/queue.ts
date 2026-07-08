import type { OutputFormat } from '@photo-gen/shared';
import { getDb } from '../db/db';
import { emit } from '../services/events';
import { getSettings } from '../services/settings';
import {
  classifyError,
  editImages,
  generateImages,
  type ImageCallResult,
  type InputImage,
} from '../services/openaiImages';
import { insertImageRow, persistFile, type PersistedFile } from '../services/library';
import { libraryPath } from '../config';
import fs from 'node:fs';
import path from 'node:path';

interface RunningJob {
  abort: AbortController;
  partial: Buffer | null;
  partialIndex: number;
}

interface GenerationRow {
  id: number;
  project_id: number;
  character_view_id: number | null;
  endpoint: 'generations' | 'edits';
  prompt: string;
  params_json: string;
  status: string;
}

interface StoredParams {
  size: string;
  quality: string;
  n: number;
  outputFormat: OutputFormat;
  outputCompression?: number;
  moderation: 'auto' | 'low';
  stream: boolean;
  partialImages: number;
  folderId?: number | null;
}

const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];
const MAX_ATTEMPTS = 1 + RETRY_DELAYS_MS.length;

const pending: number[] = [];
const running = new Map<number, RunningJob>();

export function enqueue(generationId: number): void {
  pending.push(generationId);
  emit({ type: 'generation:queued', generationId });
  pump();
}

export function cancel(generationId: number): boolean {
  const idx = pending.indexOf(generationId);
  if (idx >= 0) {
    pending.splice(idx, 1);
    markCanceled(generationId);
    return true;
  }
  const job = running.get(generationId);
  if (job) {
    job.abort.abort();
    return true;
  }
  return false;
}

export function getPartial(generationId: number): { buffer: Buffer; index: number } | null {
  const job = running.get(generationId);
  if (!job?.partial) return null;
  return { buffer: job.partial, index: job.partialIndex };
}

/** Boot recovery: interrupted running jobs fail; queued jobs re-enqueue. */
export function recoverOnBoot(): void {
  const db = getDb();
  const interrupted = db
    .prepare(
      `UPDATE generations
       SET status = 'failed', error_message = 'Interrupted by server restart', finished_at = datetime('now')
       WHERE status = 'running'`,
    )
    .run();
  if (interrupted.changes > 0) {
    console.log(`[queue] marked ${interrupted.changes} interrupted generation(s) as failed`);
  }
  const queued = db
    .prepare(`SELECT id FROM generations WHERE status = 'queued' ORDER BY id`)
    .all() as { id: number }[];
  for (const row of queued) pending.push(row.id);
  if (queued.length > 0) console.log(`[queue] re-enqueued ${queued.length} queued generation(s)`);
  pump();
}

function pump(): void {
  const limit = getSettings().queueConcurrency;
  while (running.size < limit && pending.length > 0) {
    const id = pending.shift()!;
    void run(id);
  }
}

async function run(generationId: number): Promise<void> {
  const db = getDb();
  const gen = db
    .prepare('SELECT * FROM generations WHERE id = ?')
    .get(generationId) as GenerationRow | undefined;
  if (!gen || gen.status !== 'queued') {
    pump();
    return;
  }

  const abort = new AbortController();
  running.set(generationId, { abort, partial: null, partialIndex: -1 });
  const params = JSON.parse(gen.params_json) as StoredParams;
  const startedMs = Date.now();
  db.prepare(`UPDATE generations SET status = 'running', started_at = datetime('now') WHERE id = ?`).run(
    generationId,
  );

  let attempt = 0;
  for (;;) {
    attempt++;
    db.prepare('UPDATE generations SET attempt = ? WHERE id = ?').run(attempt, generationId);
    emit({ type: 'generation:started', generationId, attempt });
    try {
      const result = await callOpenAi(gen, params, abort.signal);
      const imageIds = await persistOutputs(gen, params, result, startedMs);
      emit({ type: 'generation:succeeded', generationId, imageIds });
      break;
    } catch (err) {
      if (abort.signal.aborted) {
        markCanceled(generationId, Date.now() - startedMs);
        break;
      }
      const classified = classifyError(err);
      if (classified.retryable && attempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS_MS[attempt - 1]! + Math.floor(Math.random() * 1_000);
        console.warn(
          `[queue] generation ${generationId} attempt ${attempt} failed (${classified.message}); retrying in ${delay}ms`,
        );
        await sleep(delay, abort.signal);
        if (abort.signal.aborted) {
          markCanceled(generationId, Date.now() - startedMs);
          break;
        }
        continue;
      }
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
      emit({
        type: 'generation:failed',
        generationId,
        errorCode: classified.code,
        errorMessage: classified.message,
        moderationDetails: classified.moderationDetails,
      });
      break;
    }
  }

  running.delete(generationId);
  pump();
}

async function callOpenAi(
  gen: GenerationRow,
  params: StoredParams,
  signal: AbortSignal,
): Promise<ImageCallResult> {
  const common = {
    prompt: gen.prompt,
    size: params.size,
    quality: params.quality,
    n: params.n,
    outputFormat: params.outputFormat,
    outputCompression: params.outputCompression,
    moderation: params.moderation,
    signal,
  };
  if (gen.endpoint === 'generations') {
    return generateImages({
      ...common,
      partialImages: params.stream ? params.partialImages : 0,
      onPartial: (bytes, index) => {
        const job = running.get(gen.id);
        if (job) {
          job.partial = bytes;
          job.partialIndex = index;
        }
        emit({ type: 'generation:partial', generationId: gen.id, partialIndex: index });
      },
    });
  }
  const { inputImages, mask } = loadInputImages(gen.id);
  return editImages({ ...common, inputImages, mask });
}

/** Loads this generation's recorded inputs (base first, then references, then mask) from disk. */
function loadInputImages(generationId: number): { inputImages: InputImage[]; mask?: InputImage } {
  const rows = getDb()
    .prepare(
      `SELECT gi.role, gi.position, i.id, i.file_path, i.format
       FROM generation_inputs gi JOIN images i ON i.id = gi.image_id
       WHERE gi.generation_id = ?
       ORDER BY CASE gi.role WHEN 'base' THEN 0 WHEN 'reference' THEN 1 ELSE 2 END, gi.position`,
    )
    .all(generationId) as { role: string; position: number; id: string; file_path: string; format: string }[];

  const inputImages: InputImage[] = [];
  let mask: InputImage | undefined;
  for (const row of rows) {
    const input: InputImage = {
      bytes: fs.readFileSync(libraryPath(row.file_path)),
      name: path.basename(row.file_path),
      mimeType: row.format === 'png' ? 'image/png' : row.format === 'webp' ? 'image/webp' : 'image/jpeg',
    };
    if (row.role === 'mask') mask = input;
    else inputImages.push(input);
  }
  if (inputImages.length === 0) {
    throw new Error(`Generation ${generationId} uses the edits endpoint but has no input images`);
  }
  return { inputImages, mask };
}

async function persistOutputs(
  gen: GenerationRow,
  params: StoredParams,
  result: ImageCallResult,
  startedMs: number,
): Promise<string[]> {
  // Async file work first; then a synchronous transaction for the rows.
  const files: PersistedFile[] = [];
  for (const bytes of result.images) {
    files.push(await persistFile(bytes, 'images', params.outputFormat));
  }

  const costActual = computeActualCost(result.usage);
  const db = getDb();
  const imageIds: string[] = [];
  db.transaction(() => {
    for (const file of files) {
      imageIds.push(
        insertImageRow({
          file,
          projectId: gen.project_id,
          folderId: params.folderId ?? null,
          generationId: gen.id,
          source: 'generated',
          format: params.outputFormat,
        }),
      );
    }
    db.prepare(
      `UPDATE generations
       SET status = 'succeeded', usage_json = ?, cost_actual = ?,
           finished_at = datetime('now'), duration_ms = ?
       WHERE id = ?`,
    ).run(
      result.usage ? JSON.stringify(result.usage) : null,
      costActual,
      Date.now() - startedMs,
      gen.id,
    );
  })();
  return imageIds;
}

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

function markCanceled(generationId: number, durationMs?: number): void {
  getDb()
    .prepare(
      `UPDATE generations
       SET status = 'canceled', finished_at = datetime('now'), duration_ms = ?
       WHERE id = ? AND status IN ('queued','running')`,
    )
    .run(durationMs ?? null, generationId);
  emit({ type: 'generation:canceled', generationId });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      done();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
