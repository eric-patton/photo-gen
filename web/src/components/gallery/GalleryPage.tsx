import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../layout/PageHeader';
import FilterBar, { type GalleryFilters } from './FilterBar';
import BatchBar from './BatchBar';
import { useImages } from '../../api/queries';
import { useAppStore, useSelectionStore } from '../../stores/appStore';
import { navState } from '../../lib/imageNav';

export default function GalleryPage() {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [filters, setFilters] = useState<GalleryFilters>({ q: '', tags: [] });
  const [debouncedQ, setDebouncedQ] = useState('');
  const navigate = useNavigate();
  const selection = useSelectionStore();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 250);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // Selection shouldn't leak across projects or filter changes.
  const clearSelection = selection.clear;
  useEffect(() => clearSelection(), [projectId, clearSelection]);

  const queryFilters = useMemo(
    () => ({
      project: projectId ?? undefined,
      folder: filters.folder,
      source: filters.source,
      starred: filters.starred,
      q: debouncedQ || undefined,
      tags: filters.tags.length > 0 ? filters.tags : undefined,
    }),
    [projectId, filters.folder, filters.source, filters.starred, debouncedQ, filters.tags],
  );
  const images = useImages(queryFilters);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = images;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = images.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader
        title="Gallery"
        actions={
          <button
            onClick={selection.toggleSelecting}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              selection.selecting
                ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
            }`}
          >
            {selection.selecting ? 'Done' : 'Select'}
          </button>
        }
      />
      <FilterBar filters={filters} onChange={setFilters} />
      {selection.selecting && selection.selected.size > 0 && <BatchBar />}

      {images.isLoading ? (
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-neutral-500">
          No images match.{' '}
          <Link to="/generate" className="text-indigo-400 hover:underline">
            Generate
          </Link>{' '}
          something new or import existing art.
        </div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {items.map((img) => {
              const isSelected = selection.selected.has(img.id);
              return (
                <button
                  key={img.id}
                  onClick={() =>
                    selection.selecting
                      ? selection.toggle(img.id)
                      : navigate(`/images/${img.id}`, {
                          state: navState(
                            items.map((i) => i.id),
                            'gallery',
                          ),
                        })
                  }
                  className={`group relative aspect-square overflow-hidden rounded-md bg-neutral-900 text-left ${
                    isSelected ? 'ring-2 ring-indigo-500' : ''
                  }`}
                >
                  <img
                    src={`/api/images/${img.id}/thumb`}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  {img.starred && (
                    <span className="absolute right-1.5 top-1.5 text-sm text-amber-500 drop-shadow">★</span>
                  )}
                  {img.source === 'imported' && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-neutral-300">
                      imported
                    </span>
                  )}
                  {selection.selecting && (
                    <span
                      className={`absolute left-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-600 text-white'
                          : 'border-neutral-500 bg-black/50 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div ref={sentinelRef} className="h-8" />
          {isFetchingNextPage && (
            <div className="pb-4 text-center text-xs text-neutral-600">Loading more…</div>
          )}
        </div>
      )}
    </div>
  );
}
