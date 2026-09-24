import { AppShell } from "@/components/app-shell";
import { ScreenerDataSettings } from "@/app/settings/_components/screener-data-settings";

export default function SettingsPage() {
  return (
    <AppShell title="Configurações">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">InvestLab</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as fontes de dados usadas nas análises.
          </p>
        </header>
        <ScreenerDataSettings />
      </main>
    </AppShell>
  );
}
