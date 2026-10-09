import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function usePortfolioOverview<T>(
  fallback = "Não foi possível carregar a carteira.",
) {
  return useQuery({
    queryKey: queryKeys.portfolio.overview(),
    queryFn: () => apiRequest<T>("/api/portfolio", undefined, fallback),
  });
}

export function usePortfolioObjectives<T>() {
  return useQuery({
    queryKey: queryKeys.portfolio.objectives(),
    queryFn: () =>
      apiRequest<T>(
        "/api/portfolio/objectives",
        undefined,
        "Não foi possível carregar os objetivos.",
      ),
  });
}

export function usePortfolioAllocation<T>(enabled = true) {
  return useQuery({
    queryKey: queryKeys.portfolio.allocation(),
    queryFn: () =>
      apiRequest<T>(
        "/api/portfolio/allocation",
        undefined,
        "Não foi possível carregar a alocação.",
      ),
    enabled,
  });
}
