export const dynamic = "force-dynamic";

import Link from "next/link";
import { DashboardClient } from "@/app/_components/dashboard-client";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell title="Dashboard">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          O essencial da sua carteira, atualizado pela API.
        </p>
        <Link
          href="/imports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Importar dados
        </Link>
      </div>
      <DashboardClient />
    </AppShell>
  );
}
