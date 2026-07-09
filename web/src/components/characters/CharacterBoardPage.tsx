import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { estimateCost } from '@photo-gen/shared';
import type { CharacterDto, CharacterViewDto, GenerationDto } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import {
  useApproveView,
  useCharacter,
  useCreateView,
  useDeleteCharacter,
  useDeleteView,
  useGenerate,
  useGenerateView,
  useGenerations,
  usePatchCharacter,
} from '../../api/queries';
import { formatUsd } from '../../lib/format';
import { promotePayload } from '../../lib/promote';
import { navState } from '../../lib/imageNav';
import PromptImprover from '../common/PromptImprover';
import RefPicker from '../generate/RefPicker';

export default function CharacterBoardPage() {
  const { id } = useParams<{ id: string }>();
  const characterId = id ? Number(id) : undefined;
  const character = useCharacter(characterId);
  const generations = useGenerations({ character: characterId, limit: 200 });
  const deleteCharacter = useDeleteCharacter();
  const navigate = useNavigate();
  const [addingView, setAddingView] = useState(false);

  if (character.isLoading) {
    return (
      <div>
        <PageHeader title="Character" />
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }
  const data = character.data;
  if (!data) {
    return (
      <div>
        <PageHeader title="Character" />
        <div className="p-6 text-sm text-red-400">Character not found.</div>
      </div>
    );
  }

  const generationsByView = new Map<number, GenerationDto[]>();
  for (const gen of generations.data ?? []) {
    if (gen.characterViewId == null) continue;
    const list = generationsByView.get(gen.characterViewId) ?? [];
    list.push(gen);
    generationsByView.set(gen.characterViewId, list);
  }

  const hasAnyApproval = data.views.some((v) => v.approvedImageId);

  // Ordered list of every image belonging to this character (approved first,
  // then candidates, in view order) so the detail view can cycle within just
  // this character.
  const characterImageIds: string[] = [];
  for (const view of data.views) {
    if (view.approvedImageId && !characterImageIds.includes(view.approvedImageId)) {
      characterImageIds.push(view.approvedImageId);
    }
    for (const gen of generationsByView.get(view.id) ?? []) {
      if (gen.status !== 'succeeded') continue;
      for (const imgId of gen.outputImageIds) {
        if (!characterImageIds.includes(imgId)) characterImageIds.push(imgId);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title={data.name}
        actions={
          <>
            <button
              onClick={() => setAddingView((v) => !v)}
              className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
            >
              {addingView ? 'Cancel' : 'Add view'}
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete character '${data.name}' and all its view slots?`)) {
                  deleteCharacter.mutate(data.id, { onSuccess: () => navigate('/characters') });
                }
              }}
              className="rounded-md border border-red-900 px-2.5 py-1.5 text-xs text-red-400 hover:border-red-700"
            >
              Delete
            </button>
          </>
        }
      />

      <CharacterSheet character={data} />
      {addingView && <AddViewForm character={data} onDone={() => setAddingView(false)} />}

      {!hasAnyApproval && (
        <div className="mx-4 mt-3 rounded-md border border-indigo-900/60 bg-indigo-950/20 p-3 text-xs text-indigo-300">
          Start by generating and approving one view (usually the front) — every other view then uses
          approved views as reference images to keep the character consistent.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-4">
        {data.views.map((view) => (
          <ViewSlotCard
            key={view.id}
            view={view}
            generations={generationsByView.get(view.id) ?? []}
            canDelete={data.views.length > 1}
            navIds={characterImageIds}
            characterName={data.name}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterSheet({ character }: { character: CharacterDto }) {
  const patchCharacter = usePatchCharacter();
  const [description, setDescription] = useState(character.description);
  const [styleNotes, setStyleNotes] = useState(character.styleNotes);
  const [conceptRefIds, setConceptRefIds] = useState<string[]>([]);

  const commit = () => {
    if (description !== character.description || styleNotes !== character.styleNotes) {
      patchCharacter.mutate({ id: character.id, description, styleNotes });
    }
  };

  return (
    <div className="space-y-2 border-b border-neutral-800 px-4 py-3">
      <div>
        <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-neutral-600">
          Appearance description (anchors every generation)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commit}
          rows={2}
          placeholder="Face, hair, outfit, colors, equipment…"
          className="w-full max-w-3xl rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-neutral-600">
          Style notes
        </label>
        <input
          value={styleNotes}
          onChange={(e) => setStyleNotes(e.target.value)}
          onBlur={commit}
          placeholder="e.g. hand-painted stylized fantasy, muted palette"
          className="w-full max-w-3xl rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
        />
      </div>
      <div className="max-w-3xl space-y-2">
        <RefPicker
          refIds={conceptRefIds}
          onChange={setConceptRefIds}
          compact
          max={3}
          label="Concept / reference image — “Suggest from image” writes the sheet from it"
        />
        <PromptImprover
          mode="character"
          character={{ name: character.name, description, styleNotes }}
          imageIds={conceptRefIds}
          onApply={({ description: newDescription, styleNotes: newStyleNotes }) => {
            setDescription(newDescription);
            setStyleNotes(newStyleNotes);
            patchCharacter.mutate({
              id: character.id,
              description: newDescription,
              styleNotes: newStyleNotes,
            });
          }}
        />
      </div>
    </div>
  );
}

function AddViewForm({ character, onDone }: { character: CharacterDto; onDone: () => void }) {
  const createView = useCreateView();
  const [label, setLabel] = useState('');
  const [promptHint, setPromptHint] = useState('');

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const slot = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    createView.mutate(
      {
        characterId: character.id,
        slot,
        label: trimmed,
        promptHint: promptHint.trim(),
        sortOrder: character.views.length,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-3">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="View label, e.g. 'Action pose' or 'Top-down'"
        className="w-64 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
      />
      <input
        value={promptHint}
        onChange={(e) => setPromptHint(e.target.value)}
        placeholder="Prompt hint describing the angle/pose"
        className="w-96 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
      />
      <button
        onClick={submit}
        disabled={!label.trim() || createView.isPending}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800"
      >
        Add
      </button>
      {createView.isError && <span className="text-xs text-red-400">{createView.error.message}</span>}
    </div>
  );
}

function ViewSlotCard({
  view,
  generations,
  canDelete,
  navIds,
  characterName,
}: {
  view: CharacterViewDto;
  generations: GenerationDto[];
  canDelete: boolean;
  navIds: string[];
  characterName: string;
}) {
  const generateView = useGenerateView();
  const approveView = useApproveView();
  const deleteView = useDeleteView();
  const promote = useGenerate();
  const [extraPrompt, setExtraPrompt] = useState('');
  const [quality, setQuality] = useState('medium');
  const [n, setN] = useState(1);
  const [refIds, setRefIds] = useState<string[]>([]);

  const active = generations.filter((g) => g.status === 'queued' || g.status === 'running');
  const busy = active.length > 0 || promote.isPending;
  const candidates = useMemo(
    () =>
      generations
        .filter((g) => g.status === 'succeeded')
        .flatMap((g) => g.outputImageIds.map((imgId) => ({ imgId, gen: g })))
        .filter((c) => c.imgId !== view.approvedImageId),
    [generations, view.approvedImageId],
  );
  const approvedGen = view.approvedImageId
    ? generations.find((g) => g.outputImageIds.includes(view.approvedImageId!))
    : undefined;

  const estimate = formatUsd(
    // 1024x1536 portrait is the view default on the server side
    quality === 'low' ? 0.005 * n : quality === 'high' ? 0.165 * n : 0.041 * n,
  );

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <span className="text-xs font-medium text-neutral-300">{view.label}</span>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <span className="animate-pulse rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] text-indigo-300">
              {active.some((g) => g.params.autoApproveView) ? 'promoting…' : 'generating…'}
            </span>
          )}
          {view.approvedImageId && (
            <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-300">
              approved
            </span>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirm(`Remove view slot '${view.label}'?`)) deleteView.mutate(view.id);
              }}
              className="text-xs text-neutral-600 hover:text-red-400"
              title="Remove slot"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex aspect-[2/3] items-center justify-center bg-neutral-950/60 p-2">
        {view.approvedImageId ? (
          <div className="group relative h-full w-full">
            <Link
              to={`/images/${view.approvedImageId}`}
              state={navState(navIds, characterName)}
              className="block h-full w-full"
            >
              <img
                src={`/api/images/${view.approvedImageId}/file`}
                alt={view.label}
                className="h-full w-full rounded object-contain"
              />
            </Link>
            {approvedGen && (
              <button
                onClick={() => promote.mutate(promotePayload(approvedGen, view.approvedImageId!))}
                disabled={busy}
                className="absolute inset-x-2 bottom-2 hidden rounded bg-indigo-600/95 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 group-hover:block"
                title="Re-render this exact image at high quality; the result becomes the approved view"
              >
                Promote to high · {formatUsd(estimateCost(approvedGen.params.size, 'high', 1))}
              </button>
            )}
          </div>
        ) : active.length > 0 ? (
          <div className="text-center text-xs text-indigo-400">
            <div className="mb-1 animate-pulse">Generating…</div>
            <div className="text-neutral-600">attempt {active[0]?.attempt}</div>
          </div>
        ) : (
          <span className="text-xs text-neutral-700">No approved image</span>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="border-t border-neutral-800 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-600">Candidates</div>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map(({ imgId, gen }) => (
              <div key={imgId} className="group relative">
                <Link to={`/images/${imgId}`} state={navState(navIds, characterName)}>
                  <img
                    src={`/api/images/${imgId}/thumb`}
                    alt=""
                    className="h-16 w-12 rounded object-cover"
                  />
                </Link>
                <button
                  onClick={() => promote.mutate(promotePayload(gen, imgId))}
                  disabled={busy}
                  className="absolute inset-x-0 top-0 hidden rounded-t bg-indigo-700/90 py-0.5 text-[9px] text-white disabled:bg-neutral-800 group-hover:block"
                  title={`Promote to high quality (${formatUsd(estimateCost(gen.params.size, 'high', 1))}); the result becomes the approved view`}
                >
                  High ⬆
                </button>
                <button
                  onClick={() => approveView.mutate({ viewId: view.id, imageId: imgId })}
                  className="absolute inset-x-0 bottom-0 hidden rounded-b bg-emerald-700/90 py-0.5 text-[9px] text-white group-hover:block"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5 border-t border-neutral-800 p-2">
        <RefPicker
          refIds={refIds}
          onChange={setRefIds}
          compact
          max={3}
          label={
            view.approvedImageId
              ? 'Extra reference image(s)'
              : 'Reference image(s) — anchor this view to existing art'
          }
        />
        <input
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          placeholder="Extra prompt (optional)"
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px]"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[11px]"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <input
            type="number"
            min={1}
            max={4}
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
            className="w-12 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-[11px]"
            title="Candidates to generate"
          />
          <button
            onClick={() =>
              generateView.mutate(
                {
                  viewId: view.id,
                  extraPrompt: extraPrompt.trim(),
                  quality,
                  n,
                  extraRefIds: refIds.length > 0 ? refIds : undefined,
                },
                { onSuccess: () => setExtraPrompt('') },
              )
            }
            disabled={generateView.isPending || active.length > 0}
            className="ml-auto rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {view.approvedImageId ? 'Regenerate' : 'Generate'} · {estimate}
          </button>
        </div>
        {generateView.isError && (
          <p className="text-[11px] text-red-400">{generateView.error.message}</p>
        )}
        {promote.isError && <p className="text-[11px] text-red-400">{promote.error.message}</p>}
      </div>
    </div>
  );
}
