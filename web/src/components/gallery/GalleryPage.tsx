import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../layout/PageHeader';
import { useImages } from '../../api/queries';

export default function GalleryPage() {
  const images = useImages({});
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
      <PageHeader title="Gallery" />
      {images.isLoading ? (
        <div className="p-6 text-sm text-neutral-600">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-neutral-500">
          No images yet. Head to <Link to="/generate" className="text-indigo-400 hover:underline">Generate</Link> to
          create your first one.
        </div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {items.map((img) => (
              <Link
                key={img.id}
                to={`/images/${img.id}`}
                className="group relative aspect-square overflow-hidden rounded-md bg-neutral-900"
              >
                <img
                  src={`/api/images/${img.id}/thumb`}
                  alt={img.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {img.starred && (
                  <span className="absolute right-1.5 top-1.5 text-sm text-amber-400 drop-shadow">★</span>
                )}
              </Link>
            ))}
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
