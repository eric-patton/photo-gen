import type { SseEvent } from '@photo-gen/shared';

type Subscriber = (event: SseEvent) => void;

const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function emit(event: SseEvent): void {
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch {
      // one bad subscriber must not break the rest
    }
  }
}
