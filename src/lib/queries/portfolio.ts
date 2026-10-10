import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { MonthlyPortfolioReview } from "@/backend/services/monthly-portfolio-review";

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

export function useMonthlyPortfolioReview(
  period: string | null,
  enabled = true,
) {
  const search = period ? `?period=${encodeURIComponent(period)}` : "";
  return useQuery({
    queryKey: queryKeys.portfolio.monthlyReview(period),
    queryFn: () =>
      apiRequest<MonthlyPortfolioReview>(
        `/api/portfolio/monthly-review${search}`,
        undefined,
        "Não foi possível carregar os fechamentos da carteira.",
      ),
    enabled,
  });
}
