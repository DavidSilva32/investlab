import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { ScreenerDataSettings } from "@/app/(private)/settings/_components/screener-data-settings";
import { MarketDataSettings } from "@/app/(private)/settings/_components/market-data-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/entrar");
  if (user.role !== "ADMIN") redirect("/");
  return (
    <AppShell title="Configurações">
      <div className="w-full space-y-5">
        <div className="flex flex-col justify-between gap-2 border-b pb-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Fontes das análises
            </h2>
          </div>
        </div>
        <div className="space-y-5">
          <ScreenerDataSettings />
          <MarketDataSettings />
        </div>
      </div>
    </AppShell>
  );
}
