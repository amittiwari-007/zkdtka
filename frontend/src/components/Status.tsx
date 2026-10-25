import { ApiError } from "../api/client";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="status" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong.";
  const retryable = !(error instanceof ApiError && error.isClientError);
  return (
    <div className="status error" role="alert">
      <h2>Couldn’t load this view</h2>
      <p>{message}</p>
      {retryable && onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
