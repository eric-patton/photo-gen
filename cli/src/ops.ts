import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { opOutPath, parseGrid, parseHexColor } from './lib.js';

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

async function loadRaw(input: string | Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Bounding box of pixels with alpha above threshold, or null if none. */
function alphaBox(img: RawImage, threshold: number): Box | null {
  const { data, width, height } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Flood-fills transparency inward from every border pixel whose color is
 * within tolerance of the key color. Interior pixels of the same color
 * survive (unlike a global chroma key), so a white sword on a white
 * background keeps its blade.
 */
function removeBackground(img: RawImage, key: { r: number; g: number; b: number }, tolerance: number): void {
  const { data, width, height } = img;
  const matches = (i: number): boolean =>
    Math.abs(data[i * 4]! - key.r) <= tolerance &&
    Math.abs(data[i * 4 + 1]! - key.g) <= tolerance &&
    Math.abs(data[i * 4 + 2]! - key.b) <= tolerance;

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (i: number): void => {
    if (!visited[i] && matches(i)) {
      visited[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++]!;
    data[i * 4 + 3] = 0;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < width * (height - 1)) push(i + width);
  }
}

/** Most common exact color among the border pixels; the sane auto key for generated flat backgrounds. */
function autoKey(img: RawImage): { r: number; g: number; b: number } {
  const { data, width, height } = img;
  const counts = new Map<number, number>();
  const tally = (i: number): void => {
    const c = (data[i * 4]! << 16) | (data[i * 4 + 1]! << 8) | data[i * 4 + 2]!;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    tally(x);
    tally((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    tally(y * width);
    tally(y * width + width - 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [c, count] of counts) {
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return { r: (best >> 16) & 0xff, g: (best >> 8) & 0xff, b: best & 0xff };
}

export interface CutoutParams {
  key?: string; // 'auto' | '#rrggbb' | undefined (alpha-trim only)
  tolerance: number;
  threshold: number;
  pad: number;
}

/** Background removal + alpha trim + pad for one file; returns the result size, or null if nothing remains. */
export async function cutoutFile(
  input: string,
  outFile: string,
  params: CutoutParams,
): Promise<{ width: number; height: number } | null> {
  const img = await loadRaw(input);
  if (params.key) {
    const key = params.key === 'auto' ? autoKey(img) : parseHexColor(params.key);
    removeBackground(img, key, params.tolerance);
  }
  const box = alphaBox(img, params.threshold);
  if (!box) return null;
  let pipeline = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).extract(box);
  if (params.pad > 0) {
    const p = params.pad;
    pipeline = pipeline.extend({ top: p, bottom: p, left: p, right: p, background: TRANSPARENT });
  }
  await pipeline.png().toFile(outFile);
  return { width: box.width + params.pad * 2, height: box.height + params.pad * 2 };
}

export interface CutoutOptions {
  key?: string;
  tolerance: string;
  threshold: string;
  pad: string;
  out?: string;
}

export async function runCutout(inputs: string[], opts: CutoutOptions): Promise<void> {
  const params: CutoutParams = {
    key: opts.key,
    tolerance: Number(opts.tolerance),
    threshold: Number(opts.threshold),
    pad: Number(opts.pad),
  };
  for (const input of inputs) {
    const outFile = opOutPath(input, opts.out, '-cut');
    const size = await cutoutFile(input, outFile, params);
    if (!size) {
      console.warn(`${input}: fully transparent after cutout, skipped`);
      continue;
    }
    console.log(`${outFile}  (${size.width}x${size.height})`);
  }
}

export interface SliceOptions {
  grid: string;
  trim?: boolean;
  padTo?: string;
  key?: string;
  tolerance: string;
  threshold: string;
  out?: string;
  name?: string;
}

export async function runSlice(input: string, opts: SliceOptions): Promise<void> {
  const { rows, cols } = parseGrid(opts.grid);
  const threshold = Number(opts.threshold);
  const padTo = opts.padTo ? Number(opts.padTo) : null;
  const img = await loadRaw(input);
  // Background removal happens on the whole sheet (cutout would trim it
  // and misalign the grid); cells then trim individually.
  if (opts.key) {
    const key = opts.key === 'auto' ? autoKey(img) : parseHexColor(opts.key);
    removeBackground(img, key, Number(opts.tolerance));
  }
  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const base = opts.name ?? path.basename(input, path.extname(input));
  const outDir = opts.out ?? path.dirname(input);
  fs.mkdirSync(outDir, { recursive: true });

  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      const cellBuf = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .png()
        .toBuffer();
      let cell = sharp(cellBuf);
      if (opts.trim) {
        const rawCell = await loadRaw(cellBuf);
        const box = alphaBox(rawCell, threshold);
        if (!box) {
          console.warn(`  cell ${n}: empty, skipped`);
          continue;
        }
        cell = sharp(rawCell.data, { raw: { width: rawCell.width, height: rawCell.height, channels: 4 } }).extract(
          box,
        );
      }
      if (padTo) {
        cell = cell.resize(padTo, padTo, { fit: 'contain', background: TRANSPARENT, kernel: 'lanczos3' });
      }
      const outFile = path.join(outDir, `${base}-${n}.png`);
      await cell.png().toFile(outFile);
      console.log(`  ${outFile}`);
    }
  }
}

export interface ResizeOptions {
  size: string;
  fit: string;
  kernel: string;
  out?: string;
}

export async function runResize(inputs: string[], opts: ResizeOptions): Promise<void> {
  if (!['contain', 'inside', 'cover'].includes(opts.fit)) {
    throw new Error(`--fit must be contain|inside|cover, got '${opts.fit}'`);
  }
  if (!['lanczos3', 'nearest'].includes(opts.kernel)) {
    throw new Error(`--kernel must be lanczos3|nearest, got '${opts.kernel}'`);
  }
  const fit = opts.fit as 'contain' | 'inside' | 'cover';
  const kernel = opts.kernel as 'lanczos3' | 'nearest';
  const specs = opts.size.split(',').map((s) => s.trim()).filter(Boolean);
  if (specs.length === 0) throw new Error('--size requires at least one size (e.g. 128 or 128,96,64)');
  for (const input of inputs) {
    for (const spec of specs) {
      const m = /^(\d+)(?:x(\d+))?$/.exec(spec);
      if (!m) throw new Error(`Size must be N or WxH, got '${spec}'`);
      const w = Number(m[1]);
      const h = m[2] ? Number(m[2]) : w;
      const outFile = opOutPath(input, opts.out, `-${spec}`);
      await sharp(input)
        .resize(w, h, { fit, background: TRANSPARENT, kernel })
        .png()
        .toFile(outFile);
      console.log(`${outFile}`);
    }
  }
}

/**
 * Mode-based grid snap: each target cell takes the dominant color of its
 * source region (averaged within the winning bucket) with hard binary
 * alpha. Unlike an averaging kernel this never anti-aliases, so chunky
 * flat art comes out as crisp squares instead of fuzz.
 */
function modeSnap(img: RawImage, targetH: number): RawImage {
  const targetW = Math.max(1, Math.round((img.width * targetH) / img.height));
  const out = Buffer.alloc(targetW * targetH * 4);
  for (let ty = 0; ty < targetH; ty++) {
    const y0 = Math.floor((ty * img.height) / targetH);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.height) / targetH));
    for (let tx = 0; tx < targetW; tx++) {
      const x0 = Math.floor((tx * img.width) / targetW);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.width) / targetW));
      const counts = new Map<number, number>();
      const sums = new Map<number, [number, number, number, number]>();
      let opaque = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4;
          total++;
          if (img.data[i + 3]! < 128) continue;
          opaque++;
          const key = ((img.data[i]! >> 3) << 10) | ((img.data[i + 1]! >> 3) << 5) | (img.data[i + 2]! >> 3);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          let s = sums.get(key);
          if (!s) {
            s = [0, 0, 0, 0];
            sums.set(key, s);
          }
          s[0] += img.data[i]!;
          s[1] += img.data[i + 1]!;
          s[2] += img.data[i + 2]!;
          s[3]++;
        }
      }
      const o = (ty * targetW + tx) * 4;
      if (opaque * 2 < total) continue; // majority-transparent cell stays clear
      let bestKey = 0;
      let bestCount = -1;
      for (const [k, c] of counts) {
        if (c > bestCount) {
          bestCount = c;
          bestKey = k;
        }
      }
      const s = sums.get(bestKey)!;
      out[o] = Math.round(s[0] / s[3]);
      out[o + 1] = Math.round(s[1] / s[3]);
      out[o + 2] = Math.round(s[2] / s[3]);
      out[o + 3] = 255;
    }
  }
  return { data: out, width: targetW, height: targetH };
}

export interface PixelOptions {
  height: string;
  colors?: string;
  scale: string;
  kernel: string;
  sample: string;
  out?: string;
}

/**
 * Collapses an image onto a true sprite grid: downscale to --height px
 * (averaging kernel by default, which flattens AI-rendered texture),
 * optionally quantize to a small palette, then write the tiny sprite
 * plus a nearest-upscaled preview. The tiny file IS the game asset.
 */
export async function runPixel(inputs: string[], opts: PixelOptions): Promise<void> {
  const height = Number(opts.height);
  const scale = Number(opts.scale);
  const colors = opts.colors ? Number(opts.colors) : null;
  if (!['lanczos3', 'nearest'].includes(opts.kernel)) {
    throw new Error(`--kernel must be lanczos3|nearest, got '${opts.kernel}'`);
  }
  if (!['mode', 'kernel'].includes(opts.sample)) {
    throw new Error(`--sample must be mode|kernel, got '${opts.sample}'`);
  }
  const kernel = opts.kernel as 'lanczos3' | 'nearest';
  for (const input of inputs) {
    let small: Buffer;
    if (opts.sample === 'mode') {
      const snapped = modeSnap(await loadRaw(input), height);
      small = await sharp(snapped.data, {
        raw: { width: snapped.width, height: snapped.height, channels: 4 },
      })
        .png()
        .toBuffer();
    } else {
      small = await sharp(input).resize({ height, kernel }).png().toBuffer();
    }
    if (colors) {
      small = await sharp(small).png({ palette: true, colors, dither: 0 }).toBuffer();
    }
    const tinyFile = opOutPath(input, opts.out, `-px${height}`);
    fs.writeFileSync(tinyFile, small);
    console.log(tinyFile);
    if (scale > 1) {
      const previewFile = opOutPath(input, opts.out, `-px${height}x${scale}`);
      await sharp(small).resize({ height: height * scale, kernel: 'nearest' }).png().toFile(previewFile);
      console.log(previewFile);
    }
  }
}

export interface VectorOptions {
  raster?: string;
  out?: string;
}

/**
 * Converts a tiny pixel sprite into an SVG of run-length-merged rects
 * (shape-rendering crispEdges), the resolution-independent master for
 * the sprite: it rasterizes razor-sharp at ANY size, not just integer
 * multiples. --raster also emits PNGs at the given heights.
 */
export async function runVector(inputs: string[], opts: VectorOptions): Promise<void> {
  for (const input of inputs) {
    const img = await loadRaw(input);
    if (img.width > 512 || img.height > 512) {
      throw new Error(`${input} is ${img.width}x${img.height}; vectorize the tiny sprite (run pgen pixel first)`);
    }
    const rects: string[] = [];
    for (let y = 0; y < img.height; y++) {
      let x = 0;
      while (x < img.width) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3]! < 128) {
          x++;
          continue;
        }
        const r = img.data[i]!;
        const g = img.data[i + 1]!;
        const b = img.data[i + 2]!;
        let run = 1;
        while (x + run < img.width) {
          const j = (y * img.width + x + run) * 4;
          if (
            img.data[j + 3]! < 128 ||
            img.data[j]! !== r ||
            img.data[j + 1]! !== g ||
            img.data[j + 2]! !== b
          ) {
            break;
          }
          run++;
        }
        const hex = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
        rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${hex}"/>`);
        x += run;
      }
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}" ` +
      `width="${img.width}" height="${img.height}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
    const svgFile = opOutPath(input, opts.out, '', '.svg');
    fs.writeFileSync(svgFile, svg);
    console.log(`${svgFile}  (${rects.length} rects)`);
    if (opts.raster) {
      const sizes = opts.raster.split(',').map((s) => Number(s.trim())).filter((v) => Number.isInteger(v) && v > 0);
      for (const h of sizes) {
        const density = (72 * h) / img.height;
        const outFile = opOutPath(input, opts.out, `-v${h}`);
        await sharp(Buffer.from(svg), { density }).png().toFile(outFile);
        console.log(`  ${outFile}`);
      }
    }
  }
}

export interface RecolorOptions {
  map: string;
  fuzz: string;
  out?: string;
}

/**
 * Palette-slot remap for sprite masters. Each mapping from:to shifts
 * every color within --fuzz of `from` by the (to - from) delta, so a
 * slot's light and dark shades move together instead of flattening.
 * Works on SVG rect masters (fill attributes) and on PNGs.
 */
export async function runRecolor(inputs: string[], opts: RecolorOptions): Promise<void> {
  const maps = opts.map.split(',').map((pair) => {
    const [from, to] = pair.split(':');
    if (!from || !to) throw new Error(`--map entries must be from:to hex pairs, got '${pair}'`);
    return { from: parseHexColor(from), to: parseHexColor(to) };
  });
  const fuzz = Number(opts.fuzz);
  const shift = (r: number, g: number, b: number): [number, number, number] | null => {
    for (const m of maps) {
      const d = Math.hypot(r - m.from.r, g - m.from.g, b - m.from.b);
      if (d <= fuzz) {
        return [
          Math.max(0, Math.min(255, r + m.to.r - m.from.r)),
          Math.max(0, Math.min(255, g + m.to.g - m.from.g)),
          Math.max(0, Math.min(255, b + m.to.b - m.from.b)),
        ];
      }
    }
    return null;
  };
  for (const input of inputs) {
    if (input.toLowerCase().endsWith('.svg')) {
      const svg = fs.readFileSync(input, 'utf8');
      let hits = 0;
      const recolored = svg.replace(/fill="#([0-9a-fA-F]{6})"/g, (whole, hex: string) => {
        const v = parseInt(hex, 16);
        const s = shift((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
        if (!s) return whole;
        hits++;
        return `fill="#${((s[0] << 16) | (s[1] << 8) | s[2]).toString(16).padStart(6, '0')}"`;
      });
      const outFile = opOutPath(input, opts.out, '-rc', '.svg');
      fs.writeFileSync(outFile, recolored);
      console.log(`${outFile}  (${hits} fills shifted)`);
    } else {
      const img = await loadRaw(input);
      let hits = 0;
      for (let i = 0; i < img.width * img.height; i++) {
        if (img.data[i * 4 + 3]! === 0) continue;
        const s = shift(img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!);
        if (!s) continue;
        hits++;
        img.data[i * 4] = s[0];
        img.data[i * 4 + 1] = s[1];
        img.data[i * 4 + 2] = s[2];
      }
      const outFile = opOutPath(input, opts.out, '-rc');
      await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
        .png()
        .toFile(outFile);
      console.log(`${outFile}  (${hits} pixels shifted)`);
    }
  }
}

export interface PreviewOptions {
  sizes: string;
  bg: string;
  out: string;
}

/**
 * Renders each input at each target size, side by side over a solid
 * game-panel color: the honest answer to "does it scale down well".
 */
export async function runPreview(inputs: string[], opts: PreviewOptions): Promise<void> {
  const sizes = opts.sizes.split(',').map((s) => Number(s.trim())).filter((v) => Number.isInteger(v) && v > 0);
  if (sizes.length === 0) throw new Error(`--sizes must be a comma list of pixel sizes, got '${opts.sizes}'`);
  const bg = parseHexColor(opts.bg);
  const gap = 24;
  const rowH = Math.max(...sizes) + gap;
  const totalW = sizes.reduce((acc, s) => acc + s + gap, gap);
  const totalH = inputs.length * rowH + gap;

  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (let row = 0; row < inputs.length; row++) {
    let x = gap;
    for (const size of sizes) {
      const buf = await sharp(inputs[row]!)
        .resize(size, size, { fit: 'contain', background: TRANSPARENT, kernel: 'lanczos3' })
        .png()
        .toBuffer();
      composites.push({ input: buf, left: x, top: gap + row * rowH + Math.floor((rowH - gap - size) / 2) });
      x += size + gap;
    }
  }
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: bg } })
    .composite(composites)
    .png()
    .toFile(opts.out);
  console.log(opts.out);
}
