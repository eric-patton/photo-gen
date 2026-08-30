import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOTS,
  composeViewAnchorPrompt,
  composeViewEditPrompt,
  type CharacterRow,
  type CharacterViewRow,
} from '../server/src/services/characterPrompts';

const character: CharacterRow = {
  id: 1,
  project_id: 1,
  name: 'Bramblewick',
  description: 'A stout badger tinker in a patched leather coat.',
  style_notes: 'hand-painted stylised realism',
  created_at: '2026-01-01T00:00:00Z',
};

function view(over: Partial<CharacterViewRow> = {}): CharacterViewRow {
  return {
    id: 10,
    character_id: 1,
    slot: 'front',
    label: 'Front',
    prompt_hint: '',
    approved_image_id: null,
    sort_order: 0,
    ...over,
  };
}

describe('the default turnaround slots', () => {
  it('covers the five angles a modeller needs to block out a character', () => {
    expect(DEFAULT_SLOTS.map((s) => s.slot)).toEqual([
      'front',
      'three_quarter',
      'side_left',
      'side_right',
      'back',
    ]);
  });

  it('numbers them front to back, so a board reads left to right', () => {
    expect(DEFAULT_SLOTS.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives every slot an angle clause, since that clause is the whole instruction', () => {
    for (const slot of DEFAULT_SLOTS) {
      expect(slot.angleClause.trim().length).toBeGreaterThan(0);
      expect(slot.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('distinguishes left from right explicitly, which the model otherwise mirrors', () => {
    const left = DEFAULT_SLOTS.find((s) => s.slot === 'side_left')!;
    const right = DEFAULT_SLOTS.find((s) => s.slot === 'side_right')!;
    expect(left.angleClause).not.toBe(right.angleClause);
    expect(left.angleClause).toContain('left');
    expect(right.angleClause).toContain('right');
  });
});

describe('composeViewAnchorPrompt, the first view with nothing to match', () => {
  it('names the character and carries its description', () => {
    const prompt = composeViewAnchorPrompt(character, view(), '');
    expect(prompt).toContain('Bramblewick');
    expect(prompt).toContain('stout badger tinker');
  });

  it('states the art style when the character has one', () => {
    expect(composeViewAnchorPrompt(character, view(), '')).toContain(
      'Art style: hand-painted stylised realism.',
    );
  });

  it('omits the style sentence entirely when there is none', () => {
    const plain = { ...character, style_notes: '' };
    expect(composeViewAnchorPrompt(plain, view(), '')).not.toContain('Art style:');
  });

  it('asks for a neutral background, because this view sets what the others must match', () => {
    expect(composeViewAnchorPrompt(character, view(), '')).toContain(
      'plain solid neutral background',
    );
  });

  it('uses the preset angle clause for a known slot', () => {
    const prompt = composeViewAnchorPrompt(character, view({ slot: 'back', label: 'Back' }), '');
    expect(prompt).toContain('viewed directly from behind');
  });
});

describe('composeViewEditPrompt, every view after the first', () => {
  it('tells the model the references are all one character', () => {
    const prompt = composeViewEditPrompt(character, view(), '');
    expect(prompt).toContain('all show the same character');
    expect(prompt).toContain('Bramblewick');
  });

  it('spells out what must not drift, which is the point of a turnaround', () => {
    const prompt = composeViewEditPrompt(character, view(), '');
    for (const trait of ['face', 'hairstyle', 'outfit', 'colors', 'proportions', 'equipment']) {
      expect(prompt).toContain(trait);
    }
  });

  it('matches the reference background rather than inventing a new one', () => {
    const prompt = composeViewEditPrompt(character, view(), '');
    expect(prompt).toContain('matching the reference images');
    expect(prompt).not.toContain('plain solid neutral background');
  });

  it('carries the per-view hint and the caller extra through', () => {
    const prompt = composeViewEditPrompt(
      character,
      view({ prompt_hint: 'goggles pushed up on the forehead' }),
      'lantern held low',
    );
    expect(prompt).toContain('goggles pushed up on the forehead');
    expect(prompt).toContain('lantern held low');
  });
});

describe('both composers, on the parts that may be absent', () => {
  const bare: CharacterRow = { ...character, description: '', style_notes: '' };

  it.each([
    ['anchor', composeViewAnchorPrompt],
    ['edit', composeViewEditPrompt],
  ])('the %s prompt leaves no double spaces when everything optional is empty', (_name, compose) => {
    const prompt = compose(bare, view(), '');
    expect(prompt).not.toMatch(/ {2}/);
    expect(prompt.trim()).toBe(prompt);
  });

  it.each([
    ['anchor', composeViewAnchorPrompt],
    ['edit', composeViewEditPrompt],
  ])('the %s prompt describes a custom slot by its label', (_name, compose) => {
    const prompt = compose(
      character,
      view({ slot: 'seated', label: 'Seated on a crate', sort_order: 5 }),
      '',
    );
    expect(prompt).toContain('shown as: Seated on a crate');
  });

  it.each([
    ['anchor', composeViewAnchorPrompt],
    ['edit', composeViewEditPrompt],
  ])('the %s prompt always asks for a full body neutral pose', (_name, compose) => {
    const prompt = compose(character, view(), '');
    expect(prompt).toContain('Full body, neutral standing pose');
  });
});
