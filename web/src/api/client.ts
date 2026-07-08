export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    let message = `${res.status} ${res.statusText}`;
    try {
      body = await res.json();
      const err = body as { error?: string; message?: string };
      message = err.error ?? err.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
