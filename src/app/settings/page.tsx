import { AppShell } from "@/components/app-shell";
import { ScreenerDataSettings } from "@/app/settings/_components/screener-data-settings";
import { MarketDataSettings } from "@/app/settings/_components/market-data-settings";

export default function SettingsPage() {
  return (
    <AppShell title="Configurações">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Veja quais fontes alimentam as análises, quando foram atualizadas e
          quando revisar os dados.
        </p>
        <ScreenerDataSettings />
        <MarketDataSettings />
      </div>
    </AppShell>
  );
}
