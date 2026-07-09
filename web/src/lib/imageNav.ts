import type { Location } from 'react-router-dom';

/**
 * Ordered list of image ids the detail view can cycle through with prev/next,
 * carried via React Router navigation state so the "smart gallery" scope
 * matches how you arrived (the whole gallery, one batch, or one character).
 */
export interface ImageNavContext {
  ids: string[];
  /** Short human label for the source, e.g. 'gallery', 'batch', a character name. */
  label?: string;
}

export function readNavContext(location: Location): ImageNavContext | null {
  const state = location.state as { nav?: ImageNavContext } | null;
  const nav = state?.nav;
  if (!nav || !Array.isArray(nav.ids) || nav.ids.length === 0) return null;
  return nav;
}

/** Router `state` object to attach to a link/navigate into the image detail view. */
export function navState(ids: string[], label?: string): { nav: ImageNavContext } {
  return { nav: { ids, label } };
}
