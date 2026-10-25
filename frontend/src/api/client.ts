import type { AccuracyReport, DayView, Meta } from "./types";

// Same origin by default: Vite proxies /api in development, Vercel/Docker serve it in production.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** 4xx: the request itself is wrong, so retrying cannot help. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

type Params = Record<string, string | undefined>;

export async function getJson<T>(path: string, params: Params = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  const queryString = query.toString();
  const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    throw new ApiError(await describeError(response), response.status);
  }
  return (await response.json()) as T;
}

async function describeError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const { detail } = body as { detail: unknown };
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            item && typeof item === "object" && "msg" in item ? String(item.msg) : "",
          )
          .filter(Boolean)
          .join("; ");
      }
    }
  } catch {
    // Not JSON; fall through to the generic message.
  }
  return `Request failed (HTTP ${response.status}).`;
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<Meta>("/api/meta", {}, signal),

  day: (deliveryDate: string, decisionTime: string, signal?: AbortSignal) =>
    getJson<DayView>(
      "/api/day",
      { delivery_date: deliveryDate, decision_time: decisionTime },
      signal,
    ),

  accuracy: (from: string, to: string, decisionTime: string, signal?: AbortSignal) =>
    getJson<AccuracyReport>("/api/accuracy", { from, to, decision_time: decisionTime }, signal),
};
