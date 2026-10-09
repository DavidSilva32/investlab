import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function QueryClientWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      }),
  );
  useEffect(() => {
    const invalidatePortfolio = () => {
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    };
    window.addEventListener("portfolio:updated", invalidatePortfolio);
    return () =>
      window.removeEventListener("portfolio:updated", invalidatePortfolio);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
