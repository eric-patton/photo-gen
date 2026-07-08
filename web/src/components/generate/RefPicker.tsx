import { useState } from 'react';
import { useImages } from '../../api/queries';
import { useAppStore } from '../../stores/appStore';

/** Ordered tray of chosen reference images + a modal mini-gallery to pick them. */
export default function RefPicker({
  refIds,
  onChange,
}: {
  refIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        Reference images{' '}
        <span className="normal-case text-neutral-600">
          — the model matches their subject &amp; style (edits endpoint)
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {refIds.map((id, index) => (
          <div key={id} className="group relative">
            <img
              src={`/api/images/${id}/thumb`}
              alt={`reference ${index + 1}`}
              className="h-16 w-16 rounded border border-neutral-700 object-cover"
            />
            <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] text-neutral-300">
              {index + 1}
            </span>
            <button
              onClick={() => onChange(refIds.filter((r) => r !== id))}
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-700 text-[10px] text-white group-hover:flex"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {refIds.length < 8 && (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-neutral-700 text-xl text-neutral-600 hover:border-neutral-500 hover:text-neutral-400"
            title="Add reference image"
          >
            +
          </button>
        )}
      </div>
      {pickerOpen && (
        <RefPickerModal
          selected={refIds}
          onToggle={(id) =>
            onChange(refIds.includes(id) ? refIds.filter((r) => r !== id) : [...refIds, id])
          }
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function RefPickerModal({
  selected,
  onToggle,
  onClose,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [q, setQ] = useState('');
  const images = useImages({ project: projectId ?? undefined, q: q || undefined });
  const items = images.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-neutral-700 bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-800 p-3">
          <h2 className="text-sm font-medium text-neutral-200">Pick reference images</h2>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-56 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          />
          <button
            onClick={onClose}
            className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Done ({selected.length})
          </button>
        </div>
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5 overflow-y-auto p-3">
          {items.map((img) => {
            const isSelected = selected.includes(img.id);
            const order = selected.indexOf(img.id);
            return (
              <button
                key={img.id}
                onClick={() => onToggle(img.id)}
                className={`relative aspect-square overflow-hidden rounded ${
                  isSelected ? 'ring-2 ring-indigo-500' : 'hover:opacity-80'
                }`}
              >
                <img
                  src={`/api/images/${img.id}/thumb`}
                  alt={img.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {isSelected && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-medium text-white">
                    {order + 1}
                  </span>
                )}
              </button>
            );
          })}
          {items.length === 0 && (
            <p className="col-span-full py-6 text-center text-xs text-neutral-600">
              No images in this project match.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
