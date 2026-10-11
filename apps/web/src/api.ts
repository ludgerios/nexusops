import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});
let csrfToken = '';
export function setCsrf(token: string) {
  csrfToken = token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    signal: options.signal,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('nexusops:session-expired'));
    throw new ApiError(
      data.error?.message ??
        data.message ??
        'Não foi possível concluir a operação. Tente novamente.',
      response.status,
    );
  }
  return data as T;
}
export async function invalidate() {
  await queryClient.invalidateQueries();
}
export function queryString(values: Record<string, string | number | undefined>) {
  return new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
