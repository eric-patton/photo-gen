import { useRef } from 'react';
import { useFolders, useImport, useTags } from '../../api/queries';
import { useAppStore } from '../../stores/appStore';

export interface GalleryFilters {
  folder?: number;
  source?: string;
  starred?: boolean;
  q: string;
  tags: number[];
}

export default function FilterBar({
  filters,
  onChange,
}: {
  filters: GalleryFilters;
  onChange: (next: GalleryFilters) => void;
}) {
  const projectId = useAppStore((s) => s.currentProjectId);
  const folders = useFolders(projectId ?? undefined);
  const tags = useTags();
  const importImages = useImport();
  const fileInput = useRef<HTMLInputElement>(null);

  const usedTags = (tags.data ?? []).filter((t) => (t.usageCount ?? 0) > 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2.5">
      <input
        value={filters.q}
        onChange={(e) => onChange({ ...filters, q: e.target.value })}
        placeholder="Search prompts, titles, notes…"
        className="w-56 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs placeholder:text-neutral-600"
      />

      <select
        value={filters.folder ?? ''}
        onChange={(e) =>
          onChange({ ...filters, folder: e.target.value ? Number(e.target.value) : undefined })
        }
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
      >
        <option value="">All folders</option>
        {(folders.data ?? []).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <select
        value={filters.source ?? ''}
        onChange={(e) => onChange({ ...filters, source: e.target.value || undefined })}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs"
      >
        <option value="">All sources</option>
        <option value="generated">Generated</option>
        <option value="imported">Imported</option>
      </select>

      <button
        onClick={() => onChange({ ...filters, starred: !filters.starred })}
        className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          filters.starred
            ? 'border-amber-600 bg-amber-950/40 text-amber-300'
            : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
        }`}
      >
        ★ Starred
      </button>

      {usedTags.length > 0 && (
        <div className="flex max-w-md flex-wrap items-center gap-1">
          {usedTags.map((tag) => {
            const active = filters.tags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() =>
                  onChange({
                    ...filters,
                    tags: active
                      ? filters.tags.filter((t) => t !== tag.id)
                      : [...filters.tags, tag.id],
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                    : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {importImages.isPending && <span className="text-xs text-neutral-500">Importing…</span>}
        {importImages.isError && (
          <span className="text-xs text-red-400">{importImages.error.message}</span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0 && projectId != null) {
              importImages.mutate({ projectId, folderId: filters.folder, files });
            }
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
        >
          Import…
        </button>
      </div>
    </div>
  );
}
