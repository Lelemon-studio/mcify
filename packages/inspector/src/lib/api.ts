import type { ServerSnapshot } from './types';

const ORIGIN = typeof window === 'undefined' ? '' : window.location.origin;

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${ORIGIN}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
};

export const api = {
  server: () => get<ServerSnapshot>('/api/server'),
  invokeTool: async (
    name: string,
    args: unknown,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
    const res = await fetch(`${ORIGIN}/api/tools/${encodeURIComponent(name)}/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    return (await res.json()) as { ok: true; result: unknown } | { ok: false; error: string };
  },
};
