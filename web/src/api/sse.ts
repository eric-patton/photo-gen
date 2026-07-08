import type { QueryClient } from '@tanstack/react-query';
import type { SseEvent } from '@photo-gen/shared';

let started = false;

type PartialListener = (partialIndex: number) => void;
const partialListeners = new Map<number, Set<PartialListener>>();

/** Subscribe to partial-image notifications for one generation. */
export function onPartial(generationId: number, fn: PartialListener): () => void {
  const set = partialListeners.get(generationId) ?? new Set();
  set.add(fn);
  partialListeners.set(generationId, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) partialListeners.delete(generationId);
  };
}

export function startSse(queryClient: QueryClient): void {
  if (started) return;
  started = true;
  connect(queryClient);
}

function connect(queryClient: QueryClient): void {
  const source = new EventSource('/api/events');
  source.onmessage = (e) => {
    let event: SseEvent;
    try {
      event = JSON.parse(e.data) as SseEvent;
    } catch {
      return;
    }
    handle(queryClient, event);
  };
  source.onerror = () => {
    source.close();
    setTimeout(() => connect(queryClient), 3_000);
  };
}

function handle(queryClient: QueryClient, event: SseEvent): void {
  switch (event.type) {
    case 'heartbeat':
      return;
    case 'generation:partial':
      partialListeners.get(event.generationId)?.forEach((fn) => fn(event.partialIndex));
      return;
    case 'generation:succeeded':
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['costs'] });
      break;
    default:
      break;
  }
  void queryClient.invalidateQueries({ queryKey: ['generations'] });
}
