import { useEffect } from 'react';
import type { ArtStyle } from '@photo-gen/shared';
import { stylePreviewUrl } from '../../lib/stylePreviews';

/**
 * "See examples" dialog for one art style: the pre-baked sample render of the
 * shared reference character, how the look is built in a 3D pipeline, and the
 * list of shipping games that exemplify it. Optionally lets the user toggle the
 * style into the current comparison.
 */
export default function StyleExamplesModal({
  style,
  selected,
  onToggleSelect,
  onClose,
}: {
  style: ArtStyle;
  selected?: boolean;
  onToggleSelect?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = stylePreviewUrl(style.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${style.label} examples`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">{style.label}</h2>
            <p className="mt-0.5 max-w-xl text-xs text-neutral-400">{style.description}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,240px)_1fr]">
          <div>
            {preview ? (
              <img
                src={preview}
                alt={`${style.label} sample render`}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-dashed border-neutral-800 text-[11px] text-neutral-600">
                no preview baked
              </div>
            )}
            <p className="mt-2 text-[10px] leading-snug text-neutral-600">
              The same reference character, rendered in this style.
            </p>
          </div>

          <div className="space-y-4">
            <section>
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                How it's built in 3D
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-neutral-300">{style.pipeline}</p>
            </section>
            <section>
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                Games in this style
              </h3>
              <ul className="mt-2 space-y-2">
                {style.games.map((game) => (
                  <li key={game.title} className="text-xs leading-snug">
                    <span className="font-medium text-neutral-200">{game.title}</span>
                    <span className="text-neutral-500"> — {game.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {onToggleSelect && (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            <button
              onClick={onToggleSelect}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                selected
                  ? 'border border-indigo-500 bg-indigo-950/50 text-indigo-300'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {selected ? '✓ Selected for comparison' : 'Add to comparison'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
