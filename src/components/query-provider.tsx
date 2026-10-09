"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const router = useRouter();

  useEffect(() => {
    const invalidatePortfolio = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
    };
    window.addEventListener("portfolio:updated", invalidatePortfolio);
    const handleUnauthorized = () => {
      if (window.location.pathname !== "/login") router.replace("/login");
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("portfolio:updated", invalidatePortfolio);
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
