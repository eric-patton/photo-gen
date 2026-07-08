import { Link, useParams } from 'react-router-dom';
import type { GenerationDto } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import { useImageDetail } from '../../api/queries';
import { formatBytes, formatDuration, formatUsd, timeAgo } from '../../lib/format';

export default function ImageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useImageDetail(id);

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
      <PageHeader title={img.title || 'Untitled image'} />
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
          <Section title="Details">
            <MetaRow label="Source" value={img.source} />
            <MetaRow label="Dimensions" value={`${img.width} × ${img.height}`} />
            <MetaRow label="Format" value={img.format} />
            <MetaRow label="File size" value={formatBytes(img.sizeBytes)} />
            <MetaRow label="Created" value={timeAgo(img.createdAt)} />
          </Section>

          {img.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {img.tags.map((tag) => (
                  <span key={tag.id} className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                    {tag.name}
                  </span>
                ))}
              </div>
            </Section>
          )}

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
                          <img src={`/api/images/${outId}/thumb`} alt="" className="h-10 w-10 rounded object-cover hover:opacity-80" />
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
                <img src={`/api/images/${input.imageId}/thumb`} alt={input.role} className="h-12 w-12 rounded object-cover hover:opacity-80" />
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
                <img src={`/api/images/${outId}/thumb`} alt="" className="h-12 w-12 rounded object-cover hover:opacity-80" />
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
