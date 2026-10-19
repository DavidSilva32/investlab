export const dynamic = "force-dynamic";

import { DashboardClient } from "@/app/(private)/_components/dashboard-client";
import { AppShell } from "@/components/app-shell";

export default async function DashboardPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ openImport?: string }>;
} = {}) {
  const { openImport } = await searchParams;
  return (
    <AppShell title="Dashboard">
      <DashboardClient openImportOnLoad={openImport === "1"} />
    </AppShell>
  );
}
