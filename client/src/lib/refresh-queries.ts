import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Invalidate queries without blocking mutation settlement.
 * Awaiting invalidation on a cold Render instance can leave buttons stuck on "Saving…".
 */
export function refreshQueries(queryClient: QueryClient, ...keys: QueryKey[]) {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
