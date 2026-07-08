import { useEffect, useState } from 'react';
import type { Settings } from '@photo-gen/shared';
import { SIZE_PRESETS } from '@photo-gen/shared';
import PageHeader from '../layout/PageHeader';
import { usePatchSettings, useSettings } from '../../api/queries';

export default function SettingsPage() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  if (!draft) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft({ ...draft, [key]: value });

  const save = () => patch.mutate(draft);

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={
          <button
            onClick={save}
            disabled={patch.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-800"
          >
            {patch.isPending ? 'Saving…' : patch.isSuccess ? 'Saved ✓' : 'Save'}
          </button>
        }
      />
      <div className="max-w-lg space-y-5 p-6 text-sm">
        <Row label="Default quality" hint="Used when the generate form is reset.">
          <select
            value={draft.defaultQuality}
            onChange={(e) => set('defaultQuality', e.target.value as Settings['defaultQuality'])}
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          >
            {['low', 'medium', 'high', 'auto'].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Default size">
          <select
            value={draft.defaultSize}
            onChange={(e) => set('defaultSize', e.target.value)}
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          >
            {SIZE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Output format">
          <select
            value={draft.defaultOutputFormat}
            onChange={(e) =>
              set('defaultOutputFormat', e.target.value as Settings['defaultOutputFormat'])
            }
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          >
            {['png', 'jpeg', 'webp'].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Moderation"
          hint="'low' is less restrictive — useful for fantasy-violence game art that trips the default filter."
        >
          <select
            value={draft.moderation}
            onChange={(e) => set('moderation', e.target.value as Settings['moderation'])}
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          >
            <option value="auto">auto (standard)</option>
            <option value="low">low (less restrictive)</option>
          </select>
        </Row>

        <Row label="Queue concurrency" hint="How many generations run against the API at once.">
          <input
            type="number"
            min={1}
            max={8}
            value={draft.queueConcurrency}
            onChange={(e) => set('queueConcurrency', Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          />
        </Row>

        <Row
          label="Partial images"
          hint="Progressive preview frames while generating (0–3). Each costs ~100 extra output tokens."
        >
          <input
            type="number"
            min={0}
            max={3}
            value={draft.partialImages}
            onChange={(e) => set('partialImages', Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
            className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
          />
        </Row>

        <Row
          label="Token prices (USD per 1M tokens)"
          hint="From OpenAI's pricing page for gpt-image-2 — text input $5, image input $8, output $30. Used to compute exact per-generation costs from usage data; set output to 0 to fall back to size/quality estimates."
        >
          <div className="flex flex-wrap gap-3">
            <PriceInput
              label="Text in"
              value={draft.textInputTokenPriceUsd}
              onChange={(v) => set('textInputTokenPriceUsd', v)}
            />
            <PriceInput
              label="Image in"
              value={draft.imageInputTokenPriceUsd}
              onChange={(v) => set('imageInputTokenPriceUsd', v)}
            />
            <PriceInput
              label="Output"
              value={draft.outputTokenPriceUsd}
              onChange={(v) => set('outputTokenPriceUsd', v)}
            />
          </div>
        </Row>
      </div>
    </div>
  );
}

/** Edits a per-token USD rate, displayed as dollars per 1M tokens. */
function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (perTokenUsd: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-neutral-400">
      {label}
      <span className="text-neutral-600">$</span>
      <input
        type="number"
        min={0}
        step="0.25"
        value={Math.round(value * 1_000_000 * 100) / 100}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) / 1_000_000)}
        className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
      />
    </label>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</label>
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
