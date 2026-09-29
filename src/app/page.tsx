export const dynamic = "force-dynamic";

import { DashboardClient } from "@/app/_components/dashboard-client";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell title="Dashboard">
      <DashboardClient />
    </AppShell>
  );
}
