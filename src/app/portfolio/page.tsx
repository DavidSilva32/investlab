export const dynamic = "force-dynamic";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PortfolioClient } from "./_components/portfolio-client";
import {
  PortfolioNavigation,
  type PortfolioView,
} from "./_components/portfolio-navigation";

export default async function PortfolioPage({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ view?: string }> } = {}) {
  const { view } = await searchParams;
  const activeView: PortfolioView =
    view === "positions" || view === "movements" ? view : "overview";
  return (
    <AppShell title="Carteira">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Uma leitura objetiva da sua carteira, atualizada pela API.
        </p>
        <Link
          href="/imports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Importar dados
        </Link>
      </div>
      <PortfolioNavigation activeView={activeView} />
      <PortfolioClient activeView={activeView} />
    </AppShell>
  );
}
