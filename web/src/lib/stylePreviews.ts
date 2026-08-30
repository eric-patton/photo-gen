// Pre-baked style preview thumbnails, bundled as web assets. Each file is named
// after its art-style id (e.g. `cel-shaded-toon.webp`). Vite content-hashes the
// URLs (immutable caching) and this map works identically in dev and prod. A
// style with no baked preview simply resolves to `undefined`.
const modules = import.meta.glob('../assets/style-previews/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId: Record<string, string> = {};
for (const [filePath, url] of Object.entries(modules)) {
  const match = filePath.match(/\/([^/]+)\.webp$/);
  if (match) byId[match[1]!] = url;
}

/** Bundled preview thumbnail URL for an art-style id, or undefined if none baked. */
export function stylePreviewUrl(id: string): string | undefined {
  return byId[id];
}
