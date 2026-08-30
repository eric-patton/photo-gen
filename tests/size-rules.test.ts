import { describe, expect, it } from 'vitest';
import {
  SIZE_PRESETS,
  SIZE_RULES,
  parseSize,
  validateSize,
} from '../shared/src/size-rules';

describe('parseSize', () => {
  it('reads a WIDTHxHEIGHT pair', () => {
    expect(parseSize('1536x1024')).toEqual({ width: 1536, height: 1024 });
  });

  it('tolerates surrounding whitespace, because these arrive from a text field', () => {
    expect(parseSize('  1024x1024  ')).toEqual({ width: 1024, height: 1024 });
  });

  it.each(['auto', '1024', '1024x', 'x1024', '1024*1024', '1024 x 1024', '1024x1024px', ''])(
    'returns null rather than guessing at %o',
    (input) => {
      expect(parseSize(input)).toBeNull();
    },
  );

  it('does not accept a negative or signed edge', () => {
    expect(parseSize('-1024x1024')).toBeNull();
  });
});

describe('validateSize', () => {
  it("accepts 'auto', which defers the choice to the model", () => {
    expect(validateSize('auto')).toEqual({ ok: true, errors: [] });
  });

  it('rejects an unparseable size with one error naming what was given', () => {
    const result = validateSize('big');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("'big'");
  });

  // Every rule below is a documented gpt-image-2 constraint. Each test names the rule it
  // guards so a future change to SIZE_RULES fails against the reason rather than a number.
  it('requires both edges to be multiples of the edge quantum', () => {
    const result = validateSize('1000x1024');
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      `Both edges must be multiples of ${SIZE_RULES.edgeMultiple}`,
    );
  });

  it('checks both edges, not only the first', () => {
    expect(validateSize('1024x1000').ok).toBe(false);
  });

  it('rejects an edge longer than the maximum', () => {
    const over = SIZE_RULES.maxEdge + SIZE_RULES.edgeMultiple;
    const result = validateSize(`${over}x1024`);
    expect(result.errors).toContainEqual(`Maximum edge length is ${SIZE_RULES.maxEdge}px`);
  });

  it('accepts an edge exactly at the maximum', () => {
    expect(validateSize('3840x2160').ok).toBe(true);
  });

  it('rejects an aspect ratio past the cap, in either orientation', () => {
    const landscape = validateSize('3840x896');
    const portrait = validateSize('896x3840');
    expect(landscape.ok).toBe(false);
    expect(portrait.ok).toBe(false);
    expect(landscape.errors.some((e) => e.includes('Aspect ratio'))).toBe(true);
    expect(portrait.errors.some((e) => e.includes('Aspect ratio'))).toBe(true);
  });

  it('rejects a size below the pixel floor', () => {
    const result = validateSize('512x512');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it('accepts the pixel ceiling exactly and rejects a step past it', () => {
    expect(validateSize('3840x2160').ok).toBe(true); // 8,294,400, the ceiling itself
    expect(validateSize('3840x2176').ok).toBe(false);
  });

  it('reports every broken rule at once rather than stopping at the first', () => {
    // 100x100: not a multiple of 16, and far under the pixel floor.
    const result = validateSize('100x100');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('the shipped presets', () => {
  it.each(SIZE_PRESETS.map((p) => [p.value, p.label] as const))(
    'preset %s satisfies the rules it is offered under',
    (value) => {
      expect(validateSize(value)).toEqual({ ok: true, errors: [] });
    },
  );

  it('offers each size once', () => {
    const values = SIZE_PRESETS.map((p) => p.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("leads with 'auto', which is the safe default", () => {
    expect(SIZE_PRESETS[0]?.value).toBe('auto');
  });
});
