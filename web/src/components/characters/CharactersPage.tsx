import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../layout/PageHeader';
import { useCharacters, useCreateCharacter } from '../../api/queries';
import { useAppStore } from '../../stores/appStore';

export default function CharactersPage() {
  const projectId = useAppStore((s) => s.currentProjectId);
  const characters = useCharacters(projectId ?? undefined);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Characters"
        actions={
          !creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              New character
            </button>
          )
        }
      />
      {creating && projectId != null && (
        <CreateCharacterForm projectId={projectId} onDone={() => setCreating(false)} />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-4">
        {(characters.data ?? []).map((character) => {
          const approved = character.views.filter((v) => v.approvedImageId);
          const cover = approved[0]?.approvedImageId;
          return (
            <Link
              key={character.id}
              to={`/characters/${character.id}`}
              className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/60 transition-colors hover:border-neutral-600"
            >
              <div className="flex h-40 items-center justify-center bg-neutral-900">
                {cover ? (
                  <img
                    src={`/api/images/${cover}/thumb`}
                    alt={character.name}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <span className="text-3xl text-neutral-700">?</span>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-medium text-neutral-200">{character.name}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                  {character.description || 'No description yet'}
                </div>
                <div className="mt-1.5 text-[11px] text-neutral-600">
                  {approved.length}/{character.views.length} views approved
                </div>
              </div>
            </Link>
          );
        })}
        {characters.data?.length === 0 && !creating && (
          <p className="text-sm text-neutral-500">
            No characters in this project yet. Create one to start a turnaround board.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateCharacterForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const createCharacter = useCreateCharacter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [styleNotes, setStyleNotes] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    createCharacter.mutate(
      { projectId, name: name.trim(), description: description.trim(), styleNotes: styleNotes.trim() },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="border-b border-neutral-800 p-4">
      <div className="flex max-w-2xl flex-col gap-3">
        <FormField label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
            className="block w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm"
          />
        </FormField>
        <FormField label="Appearance description" hint="Face, hair, outfit, colors, equipment — this anchors every view generation, so be specific.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="block w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
          />
        </FormField>
        <FormField label="Art style notes" hint="e.g. 'hand-painted stylized fantasy, muted palette, thick outlines'">
          <textarea
            value={styleNotes}
            onChange={(e) => setStyleNotes(e.target.value)}
            rows={2}
            className="block w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
          />
        </FormField>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onDone}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || createCharacter.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            Create
          </button>
          {createCharacter.isError && (
            <span className="text-xs text-red-400">{createCharacter.error.message}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({
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
