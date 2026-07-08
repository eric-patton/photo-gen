import { useState } from 'react';
import PageHeader from '../layout/PageHeader';
import { useCostSummary, useGenerations, useImprovements, useProjects } from '../../api/queries';
import { formatDuration, formatUsd, timeAgo } from '../../lib/format';

export default function CostsPage() {
  const projects = useProjects();
  const [projectFilter, setProjectFilter] = useState<number | undefined>(undefined);
  const summary = useCostSummary({ project: projectFilter });
  const recent = useGenerations({ project: projectFilter, limit: 25 });
  const improvements = useImprovements({ project: projectFilter, limit: 25 });

  const data = summary.data;

  return (
    <div>
      <PageHeader
        title="Costs"
        actions={
          <select
            value={projectFilter ?? ''}
            onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          >
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />
      <div className="max-w-5xl space-y-6 p-6">
        <div className="flex flex-wrap gap-4">
          <StatCard label="Total spend" value={formatUsd(data?.total ?? 0)} />
          <StatCard label="Images" value={formatUsd(data?.imagesTotal ?? 0)} />
          <StatCard
            label={`Prompt improvements × ${data?.improveCount ?? 0}`}
            value={formatUsd(data?.improveTotal ?? 0)}
          />
          {(data?.byQuality ?? []).map((q) => (
            <StatCard
              key={q.quality ?? 'auto'}
              label={`${q.quality ?? 'auto'} × ${q.count}`}
              value={formatUsd(q.total)}
            />
          ))}
        </div>

        {(data?.byDay.length ?? 0) > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Spend by day
            </h2>
            <DayChart days={data!.byDay} />
          </section>
        )}

        {(data?.byProject.length ?? 0) > 1 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              By project
            </h2>
            <table className="w-full max-w-md text-left text-xs">
              <tbody>
                {data!.byProject.map((p) => (
                  <tr key={p.projectId} className="border-b border-neutral-900">
                    <td className="py-1.5 text-neutral-300">{p.projectName}</td>
                    <td className="py-1.5 text-right text-neutral-400">{formatUsd(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Recent generations
          </h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500">
                <th className="py-1.5 font-medium">Prompt</th>
                <th className="py-1.5 font-medium">Params</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">Duration</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
                <th className="py-1.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {(recent.data ?? []).map((gen) => (
                <tr key={gen.id} className="border-b border-neutral-900">
                  <td className="max-w-sm truncate py-1.5 pr-3 text-neutral-300" title={gen.userPrompt}>
                    {gen.userPrompt}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-neutral-500">
                    {gen.params.size} · {gen.params.quality}
                    {gen.params.n > 1 ? ` ×${gen.params.n}` : ''}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-400">{gen.status}</td>
                  <td className="py-1.5 pr-3 text-neutral-500">
                    {gen.durationMs != null ? formatDuration(gen.durationMs) : '—'}
                  </td>
                  <td className="py-1.5 text-right text-neutral-300">
                    {gen.status === 'succeeded' ? formatUsd(gen.costActual ?? gen.costEstimated) : '—'}
                  </td>
                  <td className="py-1.5 text-right text-neutral-500">{timeAgo(gen.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {(improvements.data?.length ?? 0) > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Recent prompt improvements
            </h2>
            <table className="w-full max-w-2xl text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500">
                  <th className="py-1.5 font-medium">Mode</th>
                  <th className="py-1.5 font-medium">Model</th>
                  <th className="py-1.5 font-medium">Effort</th>
                  <th className="py-1.5 text-right font-medium">Tokens in / out</th>
                  <th className="py-1.5 text-right font-medium">Cost</th>
                  <th className="py-1.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {(improvements.data ?? []).map((imp) => (
                  <tr key={imp.id} className="border-b border-neutral-900">
                    <td className="py-1.5 pr-3 text-neutral-300">
                      {imp.mode === 'generation' ? 'prompt' : 'character'}
                    </td>
                    <td className="py-1.5 pr-3 text-neutral-400">{imp.model}</td>
                    <td className="py-1.5 pr-3 text-neutral-500">{imp.effort}</td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {imp.inputTokens != null && imp.outputTokens != null
                        ? `${imp.inputTokens} / ${imp.outputTokens}`
                        : '—'}
                    </td>
                    <td className="py-1.5 text-right text-neutral-300">
                      {imp.costUsd != null ? formatUsd(imp.costUsd) : '—'}
                    </td>
                    <td className="py-1.5 text-right text-neutral-500">{timeAgo(imp.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-36 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function DayChart({ days }: { days: { day: string; total: number }[] }) {
  const max = Math.max(...days.map((d) => d.total), 0.001);
  const barWidth = 28;
  const height = 120;
  const width = days.length * (barWidth + 8);

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <svg width={Math.max(width, 200)} height={height + 30}>
        {days.map((d, i) => {
          const h = Math.max(2, (d.total / max) * height);
          const x = i * (barWidth + 8);
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={height - h}
                width={barWidth}
                height={h}
                rx={3}
                className="fill-indigo-600"
              >
                <title>{`${d.day}: ${formatUsd(d.total)}`}</title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                className="fill-neutral-500 text-[9px]"
              >
                {d.day.slice(5)}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - h - 4}
                textAnchor="middle"
                className="fill-neutral-400 text-[9px]"
              >
                {formatUsd(d.total)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
