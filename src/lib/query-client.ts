import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

function clearPrivateCacheAfterUnauthorized(client: QueryClient) {
  if (typeof window === "undefined") return;

  client.clear();
  window.dispatchEvent(new Event("auth:unauthorized"));
}

export function createQueryClient() {
  let client: QueryClient;
  const handleUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      clearPrivateCacheAfterUnauthorized(client);
    }
  };

  client = new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthorized }),
    mutationCache: new MutationCache({ onError: handleUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: false,
      },
      mutations: { retry: false },
    },
  });

  return client;
}
