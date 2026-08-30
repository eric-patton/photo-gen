import { describe, expect, it } from 'vitest';
import { IMPROVER_MODELS, estimateCost, estimateTextCost } from '../shared/src/pricing';

describe('estimateCost, on the published anchor sizes', () => {
  it('uses the table exactly for an anchor size', () => {
    expect(estimateCost('1024x1024', 'high', 1)).toBe(0.211);
    expect(estimateCost('1536x1024', 'medium', 1)).toBe(0.041);
    expect(estimateCost('1024x1536', 'low', 1)).toBe(0.005);
  });

  it('multiplies by the number of images', () => {
    expect(estimateCost('1024x1024', 'low', 4)).toBe(0.024);
  });

  it('costs nothing for zero images', () => {
    expect(estimateCost('1024x1024', 'high', 0)).toBe(0);
  });

  it("prices 'auto' quality as medium, which is what the model tends to pick", () => {
    expect(estimateCost('1024x1024', 'auto', 1)).toBe(estimateCost('1024x1024', 'medium', 1));
  });

  it("prices 'auto' size as the square anchor", () => {
    expect(estimateCost('auto', 'high', 1)).toBe(estimateCost('1024x1024', 'high', 1));
  });

  it('rises with quality at a fixed size', () => {
    const low = estimateCost('1024x1024', 'low', 1);
    const medium = estimateCost('1024x1024', 'medium', 1);
    const high = estimateCost('1024x1024', 'high', 1);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });
});

describe('estimateCost, off the anchor sizes', () => {
  it('scales the square anchor by pixel count for a larger square', () => {
    // 2048x2048 is four times the pixels of the 1024x1024 anchor.
    expect(estimateCost('2048x2048', 'medium', 1)).toBeCloseTo(0.053 * 4, 6);
  });

  it('picks the anchor nearest in aspect ratio, not nearest in size', () => {
    // 3840x2160 is 1.78:1, so the 1.5:1 landscape anchor is nearer than the square one.
    const landscapeAnchorPrice = 0.041;
    const scale = (3840 * 2160) / (1536 * 1024);
    expect(estimateCost('3840x2160', 'medium', 1)).toBeCloseTo(landscapeAnchorPrice * scale, 6);
  });

  it('treats a portrait size as portrait rather than folding it into landscape', () => {
    const portrait = estimateCost('1024x2048', 'high', 1);
    const landscape = estimateCost('2048x1024', 'high', 1);
    // Same pixel count and the two anchors are priced alike, so these agree; the point is
    // that neither silently falls back to the square anchor, which would price differently.
    expect(portrait).toBeCloseTo(landscape, 6);
    expect(portrait).not.toBeCloseTo(estimateCost('1448x1448', 'high', 1), 6);
  });

  it('grows with area', () => {
    expect(estimateCost('2048x2048', 'medium', 1)).toBeGreaterThan(
      estimateCost('1024x1024', 'medium', 1),
    );
  });

  it('falls back to the square anchor rather than throwing on an unreadable size', () => {
    expect(estimateCost('not-a-size', 'medium', 1)).toBe(estimateCost('1024x1024', 'medium', 1));
  });

  it('rounds to six decimal places, so a quote never shows float noise', () => {
    const value = estimateCost('3840x2160', 'medium', 1);
    expect(value).toBe(Number(value.toFixed(6)));
  });
});

describe('estimateTextCost, for the prompt improver', () => {
  it('charges input and output at their separate per-million rates', () => {
    const cost = estimateTextCost('fast', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(
      IMPROVER_MODELS.fast.inputPerMTok + IMPROVER_MODELS.fast.outputPerMTok,
      6,
    );
  });

  it('costs nothing for an unused improver', () => {
    expect(estimateTextCost('smart', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('prices output above input, as the provider does', () => {
    const input = estimateTextCost('smart', { inputTokens: 1_000_000, outputTokens: 0 });
    const output = estimateTextCost('smart', { inputTokens: 0, outputTokens: 1_000_000 });
    expect(output).toBeGreaterThan(input);
  });

  it('prices the smart model above the fast one for identical usage', () => {
    const usage = { inputTokens: 500_000, outputTokens: 200_000 };
    expect(estimateTextCost('smart', usage)).toBeGreaterThan(estimateTextCost('fast', usage));
  });

  it('carries a model id for every speed, so a quote names what it priced', () => {
    for (const speed of ['fast', 'smart'] as const) {
      expect(IMPROVER_MODELS[speed].id).toBeTruthy();
      expect(IMPROVER_MODELS[speed].inputPerMTok).toBeGreaterThan(0);
      expect(IMPROVER_MODELS[speed].outputPerMTok).toBeGreaterThan(0);
    }
  });
});
