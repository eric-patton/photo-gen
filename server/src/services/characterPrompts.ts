import { getDb } from '../db/db';

export interface CharacterRow {
  id: number;
  project_id: number;
  name: string;
  description: string;
  style_notes: string;
  created_at: string;
}

export interface CharacterViewRow {
  id: number;
  character_id: number;
  slot: string;
  label: string;
  prompt_hint: string;
  approved_image_id: string | null;
  sort_order: number;
}

export const DEFAULT_SLOTS: { slot: string; label: string; angleClause: string; sortOrder: number }[] = [
  { slot: 'front', label: 'Front', angleClause: 'viewed directly from the front', sortOrder: 0 },
  {
    slot: 'three_quarter',
    label: '3/4 view',
    angleClause: 'in three-quarter view, body turned 45 degrees to the left',
    sortOrder: 1,
  },
  {
    slot: 'side_left',
    label: 'Side (left)',
    angleClause: 'in full profile side view, facing left, showing the left side of the body',
    sortOrder: 2,
  },
  {
    slot: 'side_right',
    label: 'Side (right)',
    angleClause: 'in full profile side view, facing right, showing the right side of the body',
    sortOrder: 3,
  },
  { slot: 'back', label: 'Back', angleClause: 'viewed directly from behind', sortOrder: 4 },
];

const MAX_VIEW_REFS = 4;

function angleClauseFor(view: CharacterViewRow): string {
  const preset = DEFAULT_SLOTS.find((s) => s.slot === view.slot);
  // Custom slots describe their angle through label + prompt_hint.
  return preset ? preset.angleClause : `shown as: ${view.label}`;
}

/**
 * Reference images for generating one view: approved images from the other
 * slots in canonical order (front → 3/4 → side → back → customs), plus this
 * slot's own approval last when regenerating. Capped for payload sanity.
 */
export function gatherViewRefs(view: CharacterViewRow, extraRefIds: string[] = []): string[] {
  const db = getDb();
  const siblings = db
    .prepare(
      `SELECT cv.approved_image_id FROM character_views cv
       JOIN images i ON i.id = cv.approved_image_id
       WHERE cv.character_id = ? AND cv.id != ? AND cv.approved_image_id IS NOT NULL
         AND i.deleted_at IS NULL
       ORDER BY cv.sort_order`,
    )
    .all(view.character_id, view.id) as { approved_image_id: string }[];

  const refs: string[] = [];
  for (const id of extraRefIds) if (!refs.includes(id)) refs.push(id);
  for (const row of siblings) {
    if (!refs.includes(row.approved_image_id)) refs.push(row.approved_image_id);
  }
  if (view.approved_image_id && !refs.includes(view.approved_image_id)) {
    refs.push(view.approved_image_id);
  }
  return refs.slice(0, MAX_VIEW_REFS);
}

/** Composed prompt for the edits endpoint (reference images present). */
export function composeViewEditPrompt(
  character: CharacterRow,
  view: CharacterViewRow,
  extraPrompt: string,
): string {
  const parts = [
    `The reference images all show the same character: ${character.name}.`,
    character.description,
    character.style_notes ? `Art style: ${character.style_notes}.` : '',
    `Generate this exact same character — identical face, hairstyle, outfit, colors, proportions, and equipment — ${angleClauseFor(view)}.`,
    view.prompt_hint,
    extraPrompt,
    'Full body, neutral standing pose, plain solid background matching the reference images.',
  ];
  return parts.filter((p) => p.trim().length > 0).join(' ');
}

/** Composed prompt for the very first view (no approvals exist yet). */
export function composeViewAnchorPrompt(
  character: CharacterRow,
  view: CharacterViewRow,
  extraPrompt: string,
): string {
  const parts = [
    `Character design of ${character.name}.`,
    character.description,
    character.style_notes ? `Art style: ${character.style_notes}.` : '',
    `The character is ${angleClauseFor(view)}.`,
    view.prompt_hint,
    extraPrompt,
    'Full body, neutral standing pose, plain solid neutral background.',
  ];
  return parts.filter((p) => p.trim().length > 0).join(' ');
}
