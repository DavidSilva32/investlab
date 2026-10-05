import { AppShell } from "@/components/app-shell";
import { ScreenerDataSettings } from "@/app/settings/_components/screener-data-settings";
import { MarketDataSettings } from "@/app/settings/_components/market-data-settings";

export default function SettingsPage() {
  return (
    <AppShell title="Configurações">
      <div className="w-full space-y-5">
        <div className="flex flex-col justify-between gap-2 border-b pb-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Dados e serviços
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Fontes das análises
            </h2>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-right">
            Consulte o estado e atualize as fontes que alimentam as análises.
          </p>
        </div>
        <div className="space-y-5">
          <ScreenerDataSettings />
          <MarketDataSettings />
        </div>
      </div>
    </AppShell>
  );
}
