import { describe, expect, it } from 'vitest';
import { ART_STYLES } from '../shared/src/art-styles';
import { buildPrompt, resolveStyle } from '../cli/src/scaffold';

describe('resolveStyle', () => {
  const first = ART_STYLES[0]!;

  it('finds a style by its exact id', () => {
    expect(resolveStyle(first.id)).toBe(first);
  });

  it('is case-insensitive, because ids come off a command line', () => {
    expect(resolveStyle(first.id.toUpperCase())).toBe(first);
  });

  it('accepts an unambiguous prefix', () => {
    // A prefix long enough to match exactly one id, whatever the catalogue holds.
    const target = ART_STYLES.find(
      (s) => ART_STYLES.filter((o) => o.id.startsWith(s.id.slice(0, 4))).length === 1,
    );
    if (!target) return; // every 4-character prefix is shared; nothing to assert
    expect(resolveStyle(target.id.slice(0, 4))).toBe(target);
  });

  it('refuses an ambiguous prefix and names the candidates', () => {
    const shared = ART_STYLES.map((s) => s.id[0]).find(
      (c) => ART_STYLES.filter((s) => s.id.startsWith(c!)).length > 1,
    );
    if (!shared) return; // no two ids share a first letter
    expect(() => resolveStyle(shared)).toThrow(/ambiguous/);
  });

  it('reports an unknown style with the command that lists them', () => {
    expect(() => resolveStyle('definitely-not-a-style')).toThrow(/not found/);
    expect(() => resolveStyle('definitely-not-a-style')).toThrow(/pgen styles/);
  });
});

describe('buildPrompt', () => {
  const base = { cutout: false };

  it('passes a bare prompt through when nothing is asked of it', () => {
    expect(buildPrompt('a rusty key', base)).toBe('a rusty key');
  });

  describe('the scaffolds, which all exist to survive downscaling', () => {
    it.each([
      ['icon', 'Game UI icon', 'scaled down'],
      ['sprite', 'Game character sprite', 'scaling down'],
      ['portrait', 'Game character portrait', 'small sizes'],
    ] as const)('%s names its kind and asks the look to hold up small', (kind, label, small) => {
      const prompt = buildPrompt('a rusty key', { ...base, scaffold: kind });
      expect(prompt).toContain(label);
      expect(prompt).toContain('a rusty key');
      expect(prompt).toContain(small);
    });

    it.each(['icon', 'sprite', 'portrait'] as const)('%s bans baked-in text', (kind) => {
      expect(buildPrompt('a rusty key', { ...base, scaffold: kind })).toContain('no text');
    });
  });

  describe('sheets', () => {
    it('asks for exactly rows times cols assets, and says both numbers', () => {
      const prompt = buildPrompt('potions', { ...base, sheet: { rows: 3, cols: 4 } });
      expect(prompt).toContain('12 distinct game assets');
      expect(prompt).toContain('exactly 3 rows and 4 columns');
    });

    it('demands even spacing and no crossing of cell edges, so a slice op can cut it', () => {
      const prompt = buildPrompt('potions', { ...base, sheet: { rows: 2, cols: 2 } });
      expect(prompt).toContain('nothing touching or crossing cell edges');
      expect(prompt).toContain('no grid lines');
    });

    it('wins over a scaffold when both are given', () => {
      const prompt = buildPrompt('potions', {
        ...base,
        sheet: { rows: 2, cols: 2 },
        scaffold: 'icon',
      });
      expect(prompt).toContain('distinct game assets');
      expect(prompt).not.toContain('Game UI icon');
    });
  });

  describe('cutout backgrounds', () => {
    it('asks for a flood-fill-friendly background, since the API rejects transparency', () => {
      const prompt = buildPrompt('a rusty key', { cutout: true, scaffold: 'icon' });
      expect(prompt).toContain('completely uniform flat solid pale gray');
      expect(prompt).toContain('no gradients, textures, drop shadows, or vignetting');
    });

    it('asks for an ordinary neutral background when no cutout is wanted', () => {
      const prompt = buildPrompt('a rusty key', { cutout: false, scaffold: 'icon' });
      expect(prompt).toContain('plain solid neutral background');
      expect(prompt).not.toContain('pale gray');
    });

    it.each(['icon', 'sprite', 'portrait'] as const)('applies to the %s scaffold too', (kind) => {
      expect(buildPrompt('a rusty key', { cutout: true, scaffold: kind })).toContain('pale gray');
    });
  });

  describe('style', () => {
    it('appends the style prompt last, so it steers everything before it', () => {
      const style = ART_STYLES[0]!;
      const prompt = buildPrompt('a rusty key', { ...base, scaffold: 'icon', style });
      expect(prompt.endsWith(style.prompt)).toBe(true);
    });

    it('applies to a bare prompt with no scaffold', () => {
      const style = ART_STYLES[0]!;
      expect(buildPrompt('a rusty key', { ...base, style })).toBe(`a rusty key ${style.prompt}`);
    });
  });
});
