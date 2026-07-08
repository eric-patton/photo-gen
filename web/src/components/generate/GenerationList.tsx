import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GenerationDto } from '@photo-gen/shared';
import { useCancelGeneration, useGenerations } from '../../api/queries';
import { onPartial } from '../../api/sse';
import { formatDuration, formatUsd, parseDbDate, timeAgo } from '../../lib/format';

export default function GenerationList({ projectId }: { projectId?: number }) {
  const generations = useGenerations({ project: projectId, limit: 12 });

  if (generations.isLoading) {
    return <div className="text-sm text-neutral-600">Loading…</div>;
  }
  const items = generations.data ?? [];
  if (items.length === 0) {
    return <div className="text-sm text-neutral-600">Nothing generated yet.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((gen) => (
        <GenerationCard key={gen.id} gen={gen} />
      ))}
    </div>
  );
}

function GenerationCard({ gen }: { gen: GenerationDto }) {
  const cancel = useCancelGeneration();
  const active = gen.status === 'queued' || gen.status === 'running';

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-xs text-neutral-300" title={gen.userPrompt}>
          {gen.userPrompt}
        </p>
        <StatusBadge status={gen.status} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
        <span>{gen.params.size}</span>
        <span>{gen.params.quality}</span>
        {gen.params.n > 1 && <span>×{gen.params.n}</span>}
        <span>{formatUsd(gen.costActual ?? gen.costEstimated)}</span>
        {gen.durationMs != null && <span>{formatDuration(gen.durationMs)}</span>}
        <span>{timeAgo(gen.createdAt)}</span>
        {active && <Elapsed since={gen.startedAt ?? gen.createdAt} />}
      </div>

      {gen.status === 'failed' && (
        <FailureNote
          errorCode={gen.errorCode}
          errorMessage={gen.errorMessage}
          moderation={gen.moderationDetails}
        />
      )}

      {gen.outputImageIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gen.outputImageIds.map((id) => (
            <Link key={id} to={`/images/${id}`}>
              <img
                src={`/api/images/${id}/thumb`}
                alt=""
                className="h-16 w-16 rounded object-cover transition-opacity hover:opacity-80"
              />
            </Link>
          ))}
        </div>
      )}

      {gen.params.n > 1 && gen.status === 'succeeded' && (
        <Link
          to={`/generations/${gen.id}`}
          className="mt-1.5 inline-block text-[11px] text-indigo-400 hover:underline"
        >
          Compare batch →
        </Link>
      )}

      {active && <PartialPreview generationId={gen.id} />}

      {active && (
        <button
          onClick={() => cancel.mutate(gen.id)}
          disabled={cancel.isPending}
          className="mt-2 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/** Progressive preview fed by SSE partial-image events. */
function PartialPreview({ generationId }: { generationId: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let disposed = false;
    const unsubscribe = onPartial(generationId, () => {
      void (async () => {
        const res = await fetch(`/api/generations/${generationId}/partial`);
        if (!res.ok || disposed) return;
        const blob = await res.blob();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })();
    });
    return () => {
      disposed = true;
      unsubscribe();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [generationId]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt="partial preview"
      className="mt-2 w-full rounded opacity-90"
      title="Progressive preview — refines as the generation streams"
    />
  );
}

function StatusBadge({ status }: { status: GenerationDto['status'] }) {
  const styles: Record<GenerationDto['status'], string> = {
    queued: 'bg-neutral-800 text-neutral-400',
    running: 'bg-indigo-950 text-indigo-300 animate-pulse',
    succeeded: 'bg-emerald-950 text-emerald-300',
    failed: 'bg-red-950 text-red-300',
    canceled: 'bg-neutral-800 text-neutral-500',
  };
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((Date.now() - parseDbDate(since).getTime()) / 1000));
  return <span className="text-indigo-400">{seconds}s elapsed</span>;
}

function FailureNote({
  errorCode,
  errorMessage,
  moderation,
}: {
  errorCode: string | null;
  errorMessage: string | null;
  moderation: { moderation_stage?: string; categories?: string[] } | null;
}) {
  if (errorCode === 'moderation_blocked') {
    return (
      <div className="mt-2 rounded border border-amber-900 bg-amber-950/40 p-2 text-[11px] text-amber-300">
        <div className="font-medium">Blocked by content moderation — not retried.</div>
        {moderation?.categories && moderation.categories.length > 0 && (
          <div className="mt-0.5">Categories: {moderation.categories.join(', ')}</div>
        )}
        <div className="mt-0.5 text-amber-400/80">
          {moderation?.moderation_stage === 'output'
            ? 'The generated result tripped a safety check — try rewording and regenerating.'
            : 'Revise the prompt and try again.'}
        </div>
      </div>
    );
  }
  return <div className="mt-2 text-[11px] text-red-400">{errorMessage ?? 'Generation failed'}</div>;
}
