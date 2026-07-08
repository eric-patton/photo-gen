import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GenerationDto } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import {
  useAddImageTag,
  useDeleteImage,
  useFolders,
  useGenerate,
  useImageDetail,
  usePatchImage,
  useRemoveImageTag,
  useTags,
} from '../../api/queries';
import { formatBytes, formatDuration, formatUsd, timeAgo } from '../../lib/format';

export default function ImageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useImageDetail(id);
  const patchImage = usePatchImage();
  const deleteImage = useDeleteImage();
  const generate = useGenerate();
  const navigate = useNavigate();

  if (detail.isLoading) {
    return (
      <div>
        <PageHeader title="Image" />
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }
  const img = detail.data;
  if (!img) {
    return (
      <div>
        <PageHeader title="Image" />
        <div className="p-6 text-sm text-red-400">Image not found.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={img.title || 'Untitled image'}
        actions={
          <>
            <button
              onClick={() => navigate(`/images/${img.id}/edit`)}
              className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
              title="Paint a mask and regenerate part of this image"
            >
              Inpaint
            </button>
            {img.generation && (
              <button
                onClick={() =>
                  generate.mutate(
                    {
                      projectId: img.projectId,
                      prompt: `${img.generation!.userPrompt}. Keep the composition, subject, and colors of the base image identical; increase detail, sharpness, and rendering quality.`,
                      size: img.generation!.params.size,
                      quality: 'high',
                      n: 1,
                      promoteFromImageId: img.id,
                    },
                    { onSuccess: () => navigate('/generate') },
                  )
                }
                disabled={generate.isPending}
                className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
                title="Re-run at high quality using this image as the base"
              >
                Promote to high
              </button>
            )}
            <button
              onClick={() => patchImage.mutate({ id: img.id, starred: !img.starred })}
              title={img.starred ? 'Unstar' : 'Star'}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${
                img.starred
                  ? 'border-amber-600 bg-amber-950/40 text-amber-300'
                  : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
              }`}
            >
              ★
            </button>
            <button
              onClick={() => {
                deleteImage.mutate(
                  { id: img.id },
                  { onSuccess: () => navigate('/') },
                );
              }}
              className="rounded-md border border-red-900 px-2.5 py-1.5 text-xs text-red-400 hover:border-red-700"
            >
              Delete
            </button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center justify-center bg-neutral-950 p-6">
          <a href={`/api/images/${img.id}/file`} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={`/api/images/${img.id}/file`}
              alt={img.title}
              className="max-h-[80vh] max-w-full rounded object-contain shadow-2xl"
            />
          </a>
        </div>

        <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l border-neutral-800 p-4 text-sm">
          <EditableMeta img={img} />

          <Section title="Details">
            <MetaRow label="Source" value={img.source} />
            <MetaRow label="Dimensions" value={`${img.width} × ${img.height}`} />
            <MetaRow label="Format" value={img.format} />
            <MetaRow label="File size" value={formatBytes(img.sizeBytes)} />
            <MetaRow label="Created" value={timeAgo(img.createdAt)} />
          </Section>

          <TagEditor imageId={img.id} tags={img.tags} />

          {img.generation && <GenerationSection gen={img.generation} currentImageId={img.id} />}

          {img.usedIn.length > 0 && (
            <Section title={`Used as input (${img.usedIn.length})`}>
              <div className="space-y-1.5">
                {img.usedIn.map((gen) => (
                  <div key={gen.id} className="rounded border border-neutral-800 p-2">
                    <p className="line-clamp-2 text-xs text-neutral-400">{gen.userPrompt}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {gen.outputImageIds.map((outId) => (
                        <Link key={outId} to={`/images/${outId}`}>
                          <img
                            src={`/api/images/${outId}/thumb`}
                            alt=""
                            className="h-10 w-10 rounded object-cover hover:opacity-80"
                          />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function EditableMeta({
  img,
}: {
  img: { id: string; projectId: number; folderId: number | null; title: string; notes: string };
}) {
  const patchImage = usePatchImage();
  const folders = useFolders(img.projectId);
  const [title, setTitle] = useState(img.title);
  const [notes, setNotes] = useState(img.notes);

  useEffect(() => {
    setTitle(img.title);
    setNotes(img.notes);
  }, [img.id, img.title, img.notes]);

  const commit = () => {
    if (title !== img.title || notes !== img.notes) {
      patchImage.mutate({ id: img.id, title, notes });
    }
  };

  return (
    <Section title="Title & notes">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        placeholder="Title"
        className="mb-1.5 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commit}
        placeholder="Notes"
        rows={2}
        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
      />
      {(folders.data?.length ?? 0) > 0 && (
        <select
          value={img.folderId ?? ''}
          onChange={(e) =>
            patchImage.mutate({
              id: img.id,
              folderId: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="mt-1.5 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
        >
          <option value="">No folder</option>
          {(folders.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

function TagEditor({ imageId, tags }: { imageId: string; tags: { id: number; name: string }[] }) {
  const addTag = useAddImageTag();
  const removeTag = useRemoveImageTag();
  const allTags = useTags();
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addTag.mutate({ imageId, name: trimmed }, { onSuccess: () => setName('') });
  };

  return (
    <Section title="Tags">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="group flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
          >
            {tag.name}
            <button
              onClick={() => removeTag.mutate({ imageId, tagId: tag.id })}
              className="text-neutral-500 hover:text-red-400"
              title="Remove tag"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          list="all-tags"
          placeholder="Add tag…"
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
        />
        <datalist id="all-tags">
          {(allTags.data ?? []).map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </Section>
  );
}

function GenerationSection({ gen, currentImageId }: { gen: GenerationDto; currentImageId: string }) {
  const siblings = gen.outputImageIds.filter((outId) => outId !== currentImageId);
  return (
    <>
      <Section title="Prompt">
        <p className="whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 text-xs text-neutral-300">
          {gen.prompt}
        </p>
        <button
          onClick={() => void navigator.clipboard.writeText(gen.prompt)}
          className="mt-1 text-xs text-indigo-400 hover:underline"
        >
          Copy prompt
        </button>
      </Section>

      <Section title="Generation">
        <MetaRow label="Endpoint" value={gen.endpoint} />
        <MetaRow label="Size" value={gen.params.size} />
        <MetaRow label="Quality" value={gen.params.quality} />
        {gen.params.n > 1 && <MetaRow label="Batch" value={`${gen.params.n} images`} />}
        <MetaRow label="Cost" value={formatUsd(gen.costActual ?? gen.costEstimated)} />
        {gen.durationMs != null && <MetaRow label="Duration" value={formatDuration(gen.durationMs)} />}
      </Section>

      {gen.inputs.length > 0 && (
        <Section title="Inputs (lineage)">
          <div className="flex flex-wrap gap-1.5">
            {gen.inputs.map((input) => (
              <Link
                key={`${input.role}-${input.position}`}
                to={`/images/${input.imageId}`}
                title={input.role}
                className="relative"
              >
                <img
                  src={`/api/images/${input.imageId}/thumb`}
                  alt={input.role}
                  className="h-12 w-12 rounded object-cover hover:opacity-80"
                />
                <span className="absolute bottom-0 left-0 right-0 rounded-b bg-black/70 text-center text-[9px] text-neutral-300">
                  {input.role}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {siblings.length > 0 && (
        <Section title="From the same batch">
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((outId) => (
              <Link key={outId} to={`/images/${outId}`}>
                <img
                  src={`/api/images/${outId}/thumb`}
                  alt=""
                  className="h-12 w-12 rounded object-cover hover:opacity-80"
                />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right text-neutral-300">{value}</span>
    </div>
  );
}
