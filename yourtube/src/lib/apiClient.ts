import { auth } from "./firebase";
import { overrideHeaders } from "./testOverrides";

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: { error?: string; reason?: string; [key: string]: unknown }
  ) {
    super(data.error || `Request failed (${status})`);
  }
  get reason() {
    return this.data.reason;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the Firebase ID token (default true when signed in). */
  withToken?: boolean;
}

/** fetch() wrapper for /api routes: JSON in/out, ID token, test-override headers. */
export async function apiFetch<T>(path: string, { method = "GET", body, withToken = true }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...overrideHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const current = auth.currentUser;
  if (withToken && current) {
    headers.Authorization = `Bearer ${await current.getIdToken()}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong. Please try again.";
