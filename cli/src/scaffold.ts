import { ART_STYLES, type ArtStyle } from '@photo-gen/shared';

export type ScaffoldKind = 'icon' | 'sprite' | 'portrait';

export interface PromptOpts {
  scaffold?: ScaffoldKind;
  sheet?: { rows: number; cols: number };
  cutout: boolean;
  style?: ArtStyle;
}

/**
 * Wraps the user's prompt in game-asset steering. Everything here exists
 * to survive downscaling: bold silhouettes, simplified detail, centered
 * subjects, and clean backgrounds the cutout/slice ops can remove.
 * gpt-image-2 rejects the transparent-background API param, so cutout
 * asks for a flood-fill-friendly background instead.
 */
export function buildPrompt(userPrompt: string, opts: PromptOpts): string {
  const bg = opts.cutout
    ? 'on a completely uniform flat solid pale gray background with no gradients, textures, drop shadows, or vignetting'
    : 'on a plain solid neutral background';
  let prompt = userPrompt;
  if (opts.sheet) {
    const { rows, cols } = opts.sheet;
    prompt =
      `A sheet of ${rows * cols} distinct game assets: ${userPrompt}. ` +
      `Arranged in exactly ${rows} rows and ${cols} columns on an invisible uniform grid of equal cells, ` +
      `one subject centered per cell with generous even spacing, nothing touching or crossing cell edges, ` +
      `consistent style, scale, and lighting across all cells, bold readable silhouettes, ` +
      `no grid lines, no frames, no labels or text, ${bg}.`;
  } else if (opts.scaffold === 'icon') {
    prompt =
      `Game UI icon: ${userPrompt}. A single centered icon with a bold, instantly readable silhouette, ` +
      `thick simplified shapes, high contrast, minimal fine detail so it stays crisp when scaled down, ` +
      `no text, no frame or border, ${bg}.`;
  } else if (opts.scaffold === 'sprite') {
    prompt =
      `Game character sprite: ${userPrompt}. Full body, the whole figure inside the frame with clear margin ` +
      `on every side, neutral standing pose facing the viewer, centered, strong readable silhouette, ` +
      `simplified costume detail that survives scaling down, no text, ${bg}.`;
  } else if (opts.scaffold === 'portrait') {
    prompt =
      `Game character portrait: ${userPrompt}. Head and shoulders bust, centered, strong facial read at ` +
      `small sizes, confident simplified shapes, no text, no frame, ${bg}.`;
  }
  if (opts.style) prompt = `${prompt} ${opts.style.prompt}`;
  return prompt;
}

export function resolveStyle(ref: string): ArtStyle {
  const exact = ART_STYLES.find((s) => s.id === ref.toLowerCase());
  if (exact) return exact;
  const prefix = ART_STYLES.filter((s) => s.id.startsWith(ref.toLowerCase()));
  if (prefix.length === 1) return prefix[0]!;
  if (prefix.length > 1) {
    throw new Error(`Style '${ref}' is ambiguous: ${prefix.map((s) => s.id).join(', ')}`);
  }
  throw new Error(`Style '${ref}' not found (run: pgen styles)`);
}
