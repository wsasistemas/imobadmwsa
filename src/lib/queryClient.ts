import { QueryClient } from "@tanstack/react-query";

/**
 * Config global do React Query.
 * Cada request SSR usa um QueryClient novo (ver src/router.tsx).
 * Este export é usado em componentes cliente que precisam invalidar
 * (ex.: onAuthStateChange).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: 1 },
  },
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    queryClient.invalidateQueries({
      predicate: (q) => q.state.status === "error",
    });
  });
}
