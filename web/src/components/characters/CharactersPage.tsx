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
          <button
            onClick={() => setCreating((c) => !c)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            {creating ? 'Cancel' : 'New character'}
          </button>
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
    <div className="space-y-2 border-b border-neutral-800 p-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Character name"
        className="w-full max-w-md rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Canonical appearance description — face, hair, outfit, colors, equipment. This anchors every view generation, so be specific."
        rows={3}
        className="w-full max-w-2xl rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
      />
      <textarea
        value={styleNotes}
        onChange={(e) => setStyleNotes(e.target.value)}
        placeholder="Art style notes — e.g. 'hand-painted stylized fantasy, muted palette, thick outlines'"
        rows={2}
        className="w-full max-w-2xl rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs"
      />
      <div className="flex items-center gap-3">
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
  );
}
