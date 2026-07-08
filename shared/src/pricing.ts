import { parseSize } from './size-rules';

export type EffectiveQuality = 'low' | 'medium' | 'high';
export type Quality = EffectiveQuality | 'auto';

interface PriceAnchor {
  width: number;
  height: number;
  prices: Record<EffectiveQuality, number>;
}

// Known gpt-image-2 per-image output prices (USD) from OpenAI's pricing table.
const ANCHORS: PriceAnchor[] = [
  { width: 1024, height: 1024, prices: { low: 0.006, medium: 0.053, high: 0.211 } },
  { width: 1536, height: 1024, prices: { low: 0.005, medium: 0.041, high: 0.165 } },
  { width: 1024, height: 1536, prices: { low: 0.005, medium: 0.041, high: 0.165 } },
];

const DEFAULT_SIZE = { width: 1024, height: 1024 };

/**
 * Estimated USD cost for one generation request of `n` images.
 * Exact anchor sizes use the published table; other sizes scale the
 * nearest-aspect anchor's price by output pixel count. 'auto' estimates
 * as medium quality / 1024x1024.
 */
export function estimateCost(size: string, quality: Quality, n: number): number {
  const q: EffectiveQuality = quality === 'auto' ? 'medium' : quality;
  const dims = size === 'auto' ? DEFAULT_SIZE : (parseSize(size) ?? DEFAULT_SIZE);

  const exact = ANCHORS.find((a) => a.width === dims.width && a.height === dims.height);
  if (exact) return round6(exact.prices[q] * n);

  // Nearest anchor by aspect-ratio distance (square vs landscape vs portrait),
  // then scale by pixel count.
  const aspect = dims.width / dims.height;
  const anchor = ANCHORS.reduce((best, a) =>
    Math.abs(a.width / a.height - aspect) < Math.abs(best.width / best.height - aspect) ? a : best,
  );
  const scale = (dims.width * dims.height) / (anchor.width * anchor.height);
  return round6(anchor.prices[q] * scale * n);
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
