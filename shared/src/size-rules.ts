// gpt-image-2 output size constraints (from OpenAI docs):
// both edges multiples of 16, max edge 3840px, aspect ratio <= 3:1,
// total pixels between 655,360 and 8,294,400.
export const SIZE_RULES = {
  edgeMultiple: 16,
  maxEdge: 3840,
  maxAspectRatio: 3,
  minPixels: 655_360,
  maxPixels: 8_294_400,
} as const;

export interface SizePreset {
  value: string;
  label: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1024x1024', label: '1024 × 1024 (square)' },
  { value: '1536x1024', label: '1536 × 1024 (landscape)' },
  { value: '1024x1536', label: '1024 × 1536 (portrait)' },
  { value: '2048x2048', label: '2048 × 2048 (2K square)' },
  { value: '2048x1152', label: '2048 × 1152 (2K landscape)' },
  { value: '3840x2160', label: '3840 × 2160 (4K landscape)' },
  { value: '2160x3840', label: '2160 × 3840 (4K portrait)' },
];

export function parseSize(size: string): { width: number; height: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

export interface SizeValidation {
  ok: boolean;
  errors: string[];
}

/** Validates a size string: 'auto' or 'WxH' within gpt-image-2 constraints. */
export function validateSize(size: string): SizeValidation {
  if (size === 'auto') return { ok: true, errors: [] };
  const parsed = parseSize(size);
  if (!parsed) {
    return { ok: false, errors: [`Size must be 'auto' or 'WIDTHxHEIGHT', got '${size}'`] };
  }
  const { width, height } = parsed;
  const errors: string[] = [];
  if (width % SIZE_RULES.edgeMultiple !== 0 || height % SIZE_RULES.edgeMultiple !== 0) {
    errors.push(`Both edges must be multiples of ${SIZE_RULES.edgeMultiple}`);
  }
  if (Math.max(width, height) > SIZE_RULES.maxEdge) {
    errors.push(`Maximum edge length is ${SIZE_RULES.maxEdge}px`);
  }
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > SIZE_RULES.maxAspectRatio) {
    errors.push(`Aspect ratio must not exceed ${SIZE_RULES.maxAspectRatio}:1 (got ${ratio.toFixed(2)}:1)`);
  }
  const pixels = width * height;
  if (pixels < SIZE_RULES.minPixels) {
    errors.push(`Total pixels must be at least ${SIZE_RULES.minPixels.toLocaleString()} (got ${pixels.toLocaleString()})`);
  }
  if (pixels > SIZE_RULES.maxPixels) {
    errors.push(`Total pixels must not exceed ${SIZE_RULES.maxPixels.toLocaleString()} (got ${pixels.toLocaleString()})`);
  }
  return { ok: errors.length === 0, errors };
}
