import { getAuthHeaders } from '../hooks/useAuth';

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const auth = getAuthHeaders();
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) {
      headers.set(k, v);
    }
  }
  return fetch(input, { ...init, headers });
}
