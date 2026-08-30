import { describe, expect, it } from 'vitest';
import {
  ART_STYLES,
  STYLE_FRAMING,
  STYLE_SAMPLE_SUBJECT,
  composeSamplePrompt,
  composeStylePrompt,
} from '../shared/src/art-styles';

describe('the art-style catalogue', () => {
  it('is not empty', () => {
    expect(ART_STYLES.length).toBeGreaterThan(0);
  });

  it('keeps ids unique, because a character stores the id and not the label', () => {
    const ids = ART_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses stable lowercase-hyphen ids, so a stored id survives a relabel', () => {
    for (const style of ART_STYLES) {
      expect(style.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(ART_STYLES.map((s) => [s.id, s] as const))(
    '%s carries everything a picker and a prompt both need',
    (_id, style) => {
      expect(style.label.trim()).not.toBe('');
      expect(style.description.trim()).not.toBe('');
      expect(style.prompt.trim()).not.toBe('');
      // The pipeline note is what makes this a game-art catalogue rather than a mood board:
      // it says how the look is actually built, not only what it looks like.
      expect(style.pipeline.trim()).not.toBe('');
    },
  );

  it.each(ART_STYLES.map((s) => [s.id, s] as const))(
    '%s cites shipping games, each with a note explaining the citation',
    (_id, style) => {
      expect(style.games.length).toBeGreaterThan(0);
      for (const game of style.games) {
        expect(game.title.trim()).not.toBe('');
        expect(game.note.trim()).not.toBe('');
      }
    },
  );

  it('does not cite the same game twice within one style', () => {
    for (const style of ART_STYLES) {
      const titles = style.games.map((g) => g.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});

describe('composeStylePrompt', () => {
  const style = ART_STYLES[0]!;

  it('puts the subject first, then the framing, then the style', () => {
    const prompt = composeStylePrompt('A dwarf smith', style);
    expect(prompt.indexOf('A dwarf smith')).toBeLessThan(prompt.indexOf(STYLE_FRAMING));
    expect(prompt.indexOf(STYLE_FRAMING)).toBeLessThan(prompt.indexOf(style.prompt));
  });

  it('always applies the shared framing, which is what makes styles comparable', () => {
    for (const s of ART_STYLES) {
      expect(composeStylePrompt('A dwarf smith', s)).toContain(STYLE_FRAMING);
    }
  });

  it('appends freeform steering last, so it can override what came before', () => {
    const prompt = composeStylePrompt('A dwarf smith', style, 'holding a lantern');
    expect(prompt.endsWith('holding a lantern')).toBe(true);
  });

  it('leaves no double spaces when the extra is absent or blank', () => {
    expect(composeStylePrompt('A dwarf smith', style)).not.toMatch(/ {2}/);
    expect(composeStylePrompt('A dwarf smith', style, '   ')).not.toMatch(/ {2}/);
  });

  it('trims a description that arrived with stray whitespace', () => {
    const prompt = composeStylePrompt('   A dwarf smith   ', style);
    expect(prompt.startsWith('A dwarf smith ')).toBe(true);
  });

  it('bans text, watermarks and UI in every prompt it builds', () => {
    const prompt = composeStylePrompt('A dwarf smith', style);
    expect(prompt).toContain('no text');
    expect(prompt).toContain('no watermark');
    expect(prompt).toContain('no UI');
  });
});

describe('composeSamplePrompt, the style previews', () => {
  it('renders the one shared subject for every style, so previews compare like for like', () => {
    for (const style of ART_STYLES) {
      expect(composeSamplePrompt(style)).toContain(STYLE_SAMPLE_SUBJECT);
    }
  });

  it('still applies that style, not just the subject', () => {
    for (const style of ART_STYLES) {
      expect(composeSamplePrompt(style)).toContain(style.prompt);
    }
  });

  it("includes a style's own sample hint when it has one", () => {
    const withHint = ART_STYLES.find((s) => s.sampleHint);
    if (!withHint) return; // no style currently needs extra preview steering
    expect(composeSamplePrompt(withHint)).toContain(withHint.sampleHint!);
  });

  it('produces a different prompt per style, so no two previews are the same request', () => {
    const prompts = ART_STYLES.map((s) => composeSamplePrompt(s));
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});
