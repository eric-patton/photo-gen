import { useMemo, useState } from 'react';
import { estimateCost, SIZE_PRESETS, validateSize, type Quality } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import { useFolders, useGenerate } from '../../api/queries';
import { useAppStore } from '../../stores/appStore';
import { formatUsd } from '../../lib/format';
import GenerationList from './GenerationList';
import RefPicker from './RefPicker';

const QUALITIES: Quality[] = ['low', 'medium', 'high', 'auto'];

export default function GeneratePage() {
  const generate = useGenerate();
  const effectiveProjectId = useAppStore((s) => s.currentProjectId);
  const folders = useFolders(effectiveProjectId ?? undefined);

  const [prompt, setPrompt] = useState('');
  const [folderId, setFolderId] = useState<number | undefined>(undefined);
  const [sizeChoice, setSizeChoice] = useState('auto');
  const [customW, setCustomW] = useState('1024');
  const [customH, setCustomH] = useState('1024');
  const [quality, setQuality] = useState<Quality>('auto');
  const [n, setN] = useState(1);
  const [refIds, setRefIds] = useState<string[]>([]);
  const size = sizeChoice === 'custom' ? `${customW}x${customH}` : sizeChoice;
  const sizeCheck = useMemo(() => validateSize(size), [size]);
  const estimate = useMemo(
    () => (sizeCheck.ok ? estimateCost(size, quality, n) : null),
    [size, quality, n, sizeCheck.ok],
  );

  const canSubmit =
    !!effectiveProjectId && prompt.trim().length > 0 && sizeCheck.ok && !generate.isPending;

  const submit = () => {
    if (!canSubmit || !effectiveProjectId) return;
    generate.mutate(
      {
        projectId: effectiveProjectId,
        folderId,
        prompt: prompt.trim(),
        size,
        quality,
        n,
        referenceImageIds: refIds.length > 0 ? refIds : undefined,
      },
      { onSuccess: () => generate.reset() },
    );
  };

  return (
    <div>
      <PageHeader title="Generate" />
      <div className="grid max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
              rows={6}
              placeholder="Describe the image… (Ctrl+Enter to generate)"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {(folders.data?.length ?? 0) > 0 && (
              <Field label="Folder">
                <select
                  value={folderId ?? ''}
                  onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : undefined)}
                  className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                >
                  <option value="">Project root</option>
                  {(folders.data ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Size">
              <select
                value={sizeChoice}
                onChange={(e) => setSizeChoice(e.target.value)}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                {SIZE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </Field>

            {sizeChoice === 'custom' && (
              <Field label="W × H">
                <div className="flex items-center gap-1">
                  <input
                    value={customW}
                    onChange={(e) => setCustomW(e.target.value.replace(/\D/g, ''))}
                    className="w-20 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                  />
                  <span className="text-neutral-600">×</span>
                  <input
                    value={customH}
                    onChange={(e) => setCustomH(e.target.value.replace(/\D/g, ''))}
                    className="w-20 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                  />
                </div>
              </Field>
            )}

            <Field label="Quality">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Count">
              <input
                type="number"
                min={1}
                max={8}
                value={n}
                onChange={(e) => setN(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                className="w-16 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <RefPicker refIds={refIds} onChange={setRefIds} />

          {!sizeCheck.ok && (
            <ul className="space-y-0.5 text-xs text-red-400">
              {sizeCheck.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {generate.isPending ? 'Submitting…' : 'Generate'}
            </button>
            {estimate !== null && (
              <span className="text-xs text-neutral-500">
                estimated cost <span className="text-neutral-300">{formatUsd(estimate)}</span>
                {quality === 'auto' && ' (assumes medium)'}
              </span>
            )}
            {generate.isError && (
              <span className="text-xs text-red-400">{generate.error.message}</span>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Recent generations
          </h2>
          <GenerationList projectId={effectiveProjectId ?? undefined} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {children}
    </div>
  );
}
