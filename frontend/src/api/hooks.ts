import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";

import { api, ApiError } from "./client";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The analysed period is historical, so responses never go stale within a session.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.isClientError) && failureCount < 2,
      },
    },
  });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: ({ signal }) => api.meta(signal) });
}

export function useDayView(deliveryDate: string, decisionTime: string) {
  return useQuery({
    queryKey: ["day", deliveryDate, decisionTime],
    queryFn: ({ signal }) => api.day(deliveryDate, decisionTime, signal),
    // Keep showing the previous day while the next one loads (no layout jump).
    placeholderData: keepPreviousData,
  });
}

export function useAccuracy(from: string, to: string, decisionTime: string) {
  return useQuery({
    queryKey: ["accuracy", from, to, decisionTime],
    queryFn: ({ signal }) => api.accuracy(from, to, decisionTime, signal),
    placeholderData: keepPreviousData,
  });
}
