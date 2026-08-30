/**
 * Bakes the Style Lab preview thumbnails. For every style in the shared catalog
 * it renders the SAME neutral sample subject (so styles compare apples-to-apples)
 * via the running app's /api/generate, downloads the result, and writes a small
 * webp into web/src/assets/style-previews/<id>.webp (bundled by Vite).
 *
 * Requires the server running (npm run dev / npm start) and OPENAI_API_KEY set.
 *
 *   npx tsx scripts/bake-style-previews.mts                 # bake all styles
 *   npx tsx scripts/bake-style-previews.mts voxel low-poly-flat   # bake a subset
 *   BAKE_QUALITY=high npx tsx scripts/bake-style-previews.mts     # override quality
 *
 * Renders land in a throwaway "Zzz Style Bake" project so real projects stay clean.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ART_STYLES, composeSamplePrompt } from '@photo-gen/shared';

const BASE = process.env.PHOTO_GEN_BASE ?? 'http://localhost:8787';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '..', 'web', 'src', 'assets', 'style-previews');
const PROJECT_NAME = 'Zzz Style Bake';
const SIZE = '1024x1536';
const QUALITY = process.env.BAKE_QUALITY ?? 'medium';
const PREVIEW_WIDTH = 640;

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const styles = wanted.length ? ART_STYLES.filter((s) => wanted.includes(s.id)) : ART_STYLES;
if (styles.length === 0) {
  console.error(`No matching styles for: ${wanted.join(', ')}`);
  process.exit(1);
}

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + pathname, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${pathname} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

async function ensureProject(): Promise<number> {
  const projects = await api<{ id: number; name: string }[]>('/api/projects');
  const existing = projects.find((p) => p.name === PROJECT_NAME);
  if (existing) return existing.id;
  const created = await api<{ id: number }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: PROJECT_NAME, description: 'Throwaway project for Style Lab preview baking' }),
  });
  return created.id;
}

async function pollGeneration(id: number): Promise<string[]> {
  for (;;) {
    const gen = await api<{ status: string; outputImageIds: string[]; errorMessage: string | null }>(
      `/api/generations/${id}`,
    );
    if (gen.status === 'succeeded') return gen.outputImageIds;
    if (gen.status === 'failed') throw new Error(gen.errorMessage ?? 'generation failed');
    await new Promise((r) => setTimeout(r, 2500));
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const projectId = await ensureProject();
  console.log(`Baking ${styles.length} style(s) at ${QUALITY} into project #${projectId}\n`);

  // Fire every generation first, then poll — the server queue drains them in parallel.
  const jobs = await Promise.all(
    styles.map(async (style) => {
      const { generationId } = await api<{ generationId: number }>('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          prompt: composeSamplePrompt(style),
          size: SIZE,
          quality: QUALITY,
          n: 1,
        }),
      });
      console.log(`  queued ${style.id} → generation #${generationId}`);
      return { style, generationId };
    }),
  );

  let ok = 0;
  for (const { style, generationId } of jobs) {
    try {
      const [imageId] = await pollGeneration(generationId);
      if (!imageId) throw new Error('no output image');
      const buf = Buffer.from(await (await fetch(`${BASE}/api/images/${imageId}/file`)).arrayBuffer());
      const outPath = path.join(OUT_DIR, `${style.id}.webp`);
      await sharp(buf).resize({ width: PREVIEW_WIDTH }).webp({ quality: 82 }).toFile(outPath);
      const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  ✓ ${style.id}.webp (${kb} KB)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${style.id}: ${(err as Error).message}`);
    }
  }
  console.log(`\nDone: ${ok}/${jobs.length} previews written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
