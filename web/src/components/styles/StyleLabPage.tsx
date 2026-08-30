import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ART_STYLES,
  artStyleById,
  composeStylePrompt,
  estimateCost,
  type ArtStyle,
  type CharacterDto,
} from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import { ApiError } from '../../api/client';
import {
  useApproveView,
  useCreateCharacter,
  useGenerate,
  useGenerationDetail,
} from '../../api/queries';
import { useAppStore } from '../../stores/appStore';
import { formatUsd } from '../../lib/format';
import { navState } from '../../lib/imageNav';
import { stylePreviewUrl } from '../../lib/stylePreviews';
import PromptImprover from '../common/PromptImprover';
import StyleExamplesModal from './StyleExamplesModal';

// The turnaround anchor size used for every comparison render (portrait full-body).
const LAB_SIZE = '1024x1536';

type Quality = 'low' | 'medium' | 'high';

interface Run {
  styleId: string;
  generationId: number;
}

/** The persisted, per-project comparison: the concept plus its per-style runs. */
interface StyleLabSession {
  name: string;
  description: string;
  runs: Run[];
}
const EMPTY_SESSION: StyleLabSession = { name: '', description: '', runs: [] };
const sessionKey = (projectId: number) => `photo-gen:styleLab:${projectId}`;

function readSession(projectId: number): StyleLabSession {
  try {
    const raw = localStorage.getItem(sessionKey(projectId));
    if (!raw) return EMPTY_SESSION;
    const s = JSON.parse(raw) as Partial<StyleLabSession>;
    return {
      name: typeof s.name === 'string' ? s.name : '',
      description: typeof s.description === 'string' ? s.description : '',
      runs: Array.isArray(s.runs)
        ? s.runs.filter((r): r is Run => !!r && typeof r.generationId === 'number' && typeof r.styleId === 'string')
        : [],
    };
  } catch {
    return EMPTY_SESSION;
  }
}
function writeSession(projectId: number, session: StyleLabSession): void {
  try {
    localStorage.setItem(sessionKey(projectId), JSON.stringify(session));
  } catch {
    // storage unavailable/full — persistence is best-effort, never fatal
  }
}

/**
 * Style Lab: render one character concept across several video-game art styles
 * side by side, generate any number of variations within a style, and keep the
 * looks you like as real characters. The concept + runs persist per project so a
 * reload or a dev-server crash never loses an expensive comparison batch.
 */
export default function StyleLabPage() {
  const projectId = useAppStore((s) => s.currentProjectId);
  const generate = useGenerate();
  const createCharacter = useCreateCharacter();
  const approveView = useApproveView();
  const navigate = useNavigate();

  const [quality, setQuality] = useState<Quality>('medium');
  const [variations, setVariations] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [examplesStyle, setExamplesStyle] = useState<ArtStyle | null>(null);

  // Concept + runs live in one session object persisted per project. All writes
  // go through these setters (keyed by the active project) so a project switch or
  // a StrictMode double-render can never clobber another project's saved session.
  const [session, setSession] = useState<StyleLabSession>(EMPTY_SESSION);
  const { name, description, runs } = session;
  const setName = (value: string) =>
    setSession((prev) => {
      const next = { ...prev, name: value };
      if (projectId != null) writeSession(projectId, next);
      return next;
    });
  const setDescription = (value: string) =>
    setSession((prev) => {
      const next = { ...prev, description: value };
      if (projectId != null) writeSession(projectId, next);
      return next;
    });
  const setRuns = (updater: (prev: Run[]) => Run[]) =>
    setSession((prev) => {
      const next = { ...prev, runs: updater(prev.runs) };
      if (projectId != null) writeSession(projectId, next);
      return next;
    });

  // Rehydrate when the active project changes (pure load — never writes back).
  useEffect(() => {
    setSession(projectId == null ? EMPTY_SESSION : readSession(projectId));
  }, [projectId]);

  const canGenerate = projectId != null && description.trim().length > 0 && selected.length > 0;

  const toggleStyle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runStyles = (styleIds: string[], n: number) => {
    if (projectId == null || !description.trim() || styleIds.length === 0) return;
    for (const styleId of styleIds) {
      const style = artStyleById(styleId);
      if (!style) continue;
      generate.mutate(
        {
          projectId,
          prompt: composeStylePrompt(description, style),
          size: LAB_SIZE,
          quality,
          n,
        },
        {
          onSuccess: ({ generationId }) =>
            setRuns((prev) => [...prev, { styleId, generationId }]),
        },
      );
    }
  };

  const keepAsCharacter = async (imageId: string, style: ArtStyle) => {
    if (projectId == null) return;
    setKeepError(null);
    // Keeping several looks from the same style would collide on name, so retry
    // with an incrementing suffix: "… — Style", "… — Style 2", "… — Style 3", …
    const base = `${name.trim() || 'Character'} — ${style.label}`;
    try {
      let character: CharacterDto | null = null;
      for (let attempt = 1; attempt <= 50 && !character; attempt++) {
        const candidate = attempt === 1 ? base : `${base} ${attempt}`;
        try {
          character = await createCharacter.mutateAsync({
            projectId,
            name: candidate,
            description: description.trim(),
            styleNotes: style.prompt,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) continue; // name taken → next suffix
          throw err;
        }
      }
      if (!character) {
        setKeepError('Could not find an available name — rename the concept and try again.');
        return;
      }
      const front = character.views.find((v) => v.slot === 'front') ?? character.views[0];
      if (front) await approveView.mutateAsync({ viewId: front.id, imageId });
      navigate(`/characters/${character.id}`);
    } catch (err) {
      setKeepError(err instanceof Error ? err.message : 'Failed to keep as character');
    }
  };

  // Group generations by style, preserving catalog order for a stable layout.
  const runsByStyle = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const run of runs) {
      const list = map.get(run.styleId) ?? [];
      list.push(run.generationId);
      map.set(run.styleId, list);
    }
    return map;
  }, [runs]);
  const resultStyles = ART_STYLES.filter((s) => runsByStyle.has(s.id));

  const perStyleCost = estimateCost(LAB_SIZE, quality, variations);
  const totalCost = perStyleCost * selected.length;

  if (projectId == null) {
    return (
      <div>
        <PageHeader title="Style Lab" />
        <div className="p-6 text-sm text-neutral-500">Select or create a project first.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Style Lab"
        actions={
          runs.length > 0 && (
            <button
              onClick={() => setRuns(() => [])}
              className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
            >
              Clear results
            </button>
          )
        }
      />

      <div className="space-y-4 border-b border-neutral-800 p-4">
        <p className="max-w-3xl text-xs text-neutral-500">
          Describe a character once, pick the art styles to try, and render them side by side to
          compare. Every style shows a sample render and the games that use it — hit{' '}
          <span className="text-neutral-400">See examples</span> for details. Generate as many
          variations within a style as you like, then keep the looks you want as characters.
        </p>

        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <Field label="Name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ironbeard"
              className="block w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm"
            />
          </Field>
        </div>
        <Field
          label="Appearance description"
          hint="Face, hair, outfit, colors, equipment — this stays constant across every style."
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A stout dwarf paladin in dented gold plate armor, braided red beard, glowing warhammer…"
            className="block w-full max-w-3xl rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
          />
        </Field>
        <div className="max-w-3xl">
          <PromptImprover
            mode="generation"
            prompt={description}
            onApply={(improved) => setDescription(improved)}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Art styles ({selected.length} selected)
            </label>
            <button
              onClick={() =>
                setSelected((s) => (s.length === ART_STYLES.length ? [] : ART_STYLES.map((x) => x.id)))
              }
              className="text-[11px] text-indigo-400 hover:underline"
            >
              {selected.length === ART_STYLES.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {ART_STYLES.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                selected={selected.includes(style.id)}
                onToggle={() => toggleStyle(style.id)}
                onSeeExamples={() => setExamplesStyle(style)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Variations / style
            <input
              type="number"
              min={1}
              max={8}
              value={variations}
              onChange={(e) => setVariations(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              className="w-14 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Quality
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
              className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-xs"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <button
            onClick={() => runStyles(selected, variations)}
            disabled={!canGenerate || generate.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {generate.isPending
              ? 'Submitting…'
              : `Generate comparison · ${selected.length} style${selected.length === 1 ? '' : 's'} · ~${formatUsd(totalCost)}`}
          </button>
          {generate.isError && <span className="text-xs text-red-400">{generate.error.message}</span>}
          {keepError && <span className="text-xs text-red-400">{keepError}</span>}
        </div>
      </div>

      {resultStyles.length === 0 ? (
        <div className="p-6 text-sm text-neutral-600">
          No comparisons yet. Pick some styles and generate.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 p-4">
          {resultStyles.map((style) => (
            <StyleColumn
              key={style.id}
              style={style}
              generationIds={runsByStyle.get(style.id) ?? []}
              onMore={(n) => runStyles([style.id], n)}
              onKeep={(imageId) => keepAsCharacter(imageId, style)}
              onSeeExamples={() => setExamplesStyle(style)}
              busy={generate.isPending || createCharacter.isPending || approveView.isPending}
            />
          ))}
        </div>
      )}

      {examplesStyle && (
        <StyleExamplesModal
          style={examplesStyle}
          selected={selected.includes(examplesStyle.id)}
          onToggleSelect={() => toggleStyle(examplesStyle.id)}
          onClose={() => setExamplesStyle(null)}
        />
      )}
    </div>
  );
}

/** Selectable style tile: pre-baked preview, label, description, example games, See examples. */
function StyleCard({
  style,
  selected,
  onToggle,
  onSeeExamples,
}: {
  style: ArtStyle;
  selected: boolean;
  onToggle: () => void;
  onSeeExamples: () => void;
}) {
  const preview = stylePreviewUrl(style.id);
  const games = style.games.slice(0, 3).map((g) => g.title).join(' · ');
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ${
        selected
          ? 'border-indigo-500 bg-indigo-950/40'
          : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600'
      }`}
    >
      <div className="relative aspect-[3/4] bg-neutral-950/60">
        {preview ? (
          <img
            src={preview}
            alt={`${style.label} sample`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">
            no preview
          </div>
        )}
        <span
          className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
            selected
              ? 'border-indigo-300 bg-indigo-500 text-white'
              : 'border-neutral-400 bg-black/50 text-transparent group-hover:text-neutral-300'
          }`}
        >
          ✓
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSeeExamples();
          }}
          className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-neutral-100 ring-1 ring-white/20 backdrop-blur-sm hover:bg-black/90"
        >
          See examples
        </button>
      </div>
      <div className="flex flex-1 flex-col p-2">
        <div className="text-xs font-medium text-neutral-200">{style.label}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
          {style.description}
        </p>
        {games && <p className="mt-1 line-clamp-1 text-[10px] text-neutral-600">{games}</p>}
      </div>
    </div>
  );
}

function StyleColumn({
  style,
  generationIds,
  onMore,
  onKeep,
  onSeeExamples,
  busy,
}: {
  style: ArtStyle;
  generationIds: number[];
  onMore: (n: number) => void;
  onKeep: (imageId: string) => void;
  onSeeExamples: () => void;
  busy: boolean;
}) {
  const preview = stylePreviewUrl(style.id);
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-start gap-2 border-b border-neutral-800 px-3 py-2">
        {preview && (
          <img
            src={preview}
            alt=""
            className="h-9 w-7 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-neutral-200">{style.label}</div>
          <div className="mt-0.5 line-clamp-2 text-[10px] text-neutral-600">{style.description}</div>
        </div>
        <button
          type="button"
          onClick={onSeeExamples}
          title="See sample render and example games"
          className="shrink-0 text-[10px] text-indigo-400 hover:underline"
        >
          examples
        </button>
      </div>
      <div className="space-y-2 p-2">
        {generationIds.map((id) => (
          <GenerationImages key={id} generationId={id} styleLabel={style.label} onKeep={onKeep} busy={busy} />
        ))}
        <button
          onClick={() => onMore(1)}
          disabled={busy}
          className="w-full rounded border border-dashed border-neutral-700 py-1.5 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-50"
        >
          + More variations
        </button>
      </div>
    </div>
  );
}

function GenerationImages({
  generationId,
  styleLabel,
  onKeep,
  busy,
}: {
  generationId: number;
  styleLabel: string;
  onKeep: (imageId: string) => void;
  busy: boolean;
}) {
  const detail = useGenerationDetail(generationId);
  const gen = detail.data;

  if (!gen || gen.status === 'queued' || gen.status === 'running') {
    return (
      <div className="flex aspect-[2/3] items-center justify-center rounded bg-neutral-950/60 text-[11px] text-indigo-400">
        <span className="animate-pulse">generating…</span>
      </div>
    );
  }
  if (gen.status === 'failed') {
    return (
      <div className="rounded border border-red-900/60 bg-red-950/20 p-2 text-[11px] text-red-400">
        {gen.errorMessage || 'Generation failed'}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {gen.outputImageIds.map((imgId) => (
        <div key={imgId} className="group relative">
          <Link to={`/images/${imgId}`} state={navState(gen.outputImageIds, styleLabel)}>
            <img
              src={`/api/images/${imgId}/thumb`}
              alt={styleLabel}
              className="aspect-[2/3] w-full rounded object-cover"
            />
          </Link>
          <button
            onClick={() => onKeep(imgId)}
            disabled={busy}
            className="absolute inset-x-0 bottom-0 hidden rounded-b bg-emerald-700/90 py-0.5 text-[9px] font-medium text-white hover:bg-emerald-600 disabled:bg-neutral-800 group-hover:block"
            title="Create a character in this style with this image as the front view"
          >
            Keep as character
          </button>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
