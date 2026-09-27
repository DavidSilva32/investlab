import { AppShell } from "@/components/app-shell";
import { ScreenerDataSettings } from "@/app/settings/_components/screener-data-settings";
import { MarketDataSettings } from "@/app/settings/_components/market-data-settings";
import { InvestorContextSettings } from "@/app/settings/_components/investor-context-settings";

export default function SettingsPage() {
  return (
    <AppShell title="Configurações">
      <div className="w-full space-y-6">
        <InvestorContextSettings />
        <ScreenerDataSettings />
        <MarketDataSettings />
      </div>
    </AppShell>
  );
}
