import { Link, useParams } from 'react-router-dom';
import type { GenerationDto } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import { useGenerate, useGenerationDetail } from '../../api/queries';
import { formatDuration, formatUsd, timeAgo } from '../../lib/format';
import { promotePayload } from '../../lib/promote';
import { navState } from '../../lib/imageNav';

/** Batch compare grid: all candidates of one generation side by side. */
export default function GenerationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const gen = useGenerationDetail(id ? Number(id) : undefined);

  if (gen.isLoading) {
    return (
      <div>
        <PageHeader title="Generation" />
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }
  const data = gen.data;
  if (!data) {
    return (
      <div>
        <PageHeader title="Generation" />
        <div className="p-6 text-sm text-red-400">Generation not found.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Batch of ${data.params.n}`} />
      <div className="space-y-1 border-b border-neutral-800 px-6 py-3 text-xs text-neutral-500">
        <p className="max-w-4xl text-neutral-300">{data.userPrompt}</p>
        <p>
          {data.params.size} · {data.params.quality} · {formatUsd(data.costActual ?? data.costEstimated)}
          {data.durationMs != null && <> · {formatDuration(data.durationMs)}</>} · {timeAgo(data.createdAt)} ·{' '}
          {data.status}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.outputImageIds.map((imgId) => (
          <CandidateCard key={imgId} imageId={imgId} gen={data} />
        ))}
        {data.outputImageIds.length === 0 && (
          <p className="text-sm text-neutral-500">
            {data.status === 'queued' || data.status === 'running'
              ? 'Still generating…'
              : 'No outputs (generation failed or was canceled).'}
          </p>
        )}
      </div>
    </div>
  );
}

function CandidateCard({ imageId, gen }: { imageId: string; gen: GenerationDto }) {
  const generate = useGenerate();

  const state = navState(gen.outputImageIds, 'batch');
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/60">
      <Link to={`/images/${imageId}`} state={state}>
        <img src={`/api/images/${imageId}/file`} alt="" className="w-full object-contain" />
      </Link>
      <div className="flex items-center justify-between p-2">
        <Link to={`/images/${imageId}`} state={state} className="text-xs text-indigo-400 hover:underline">
          Open
        </Link>
        <button
          onClick={() => generate.mutate(promotePayload(gen, imageId))}
          disabled={generate.isPending}
          className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800"
          title={
            gen.characterViewId != null
              ? 'Re-run at high quality; the result replaces the approved image for its character view'
              : 'Re-run at high quality with this image as the base'
          }
        >
          {generate.isSuccess ? 'Promoting…' : 'Promote to high'}
        </button>
      </div>
    </div>
  );
}
