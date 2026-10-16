import { AppShell } from "@/components/app-shell";
import { AnalysesTabs } from "@/app/(private)/analyses/_components/analyses-tabs";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  return (
    <AppShell title="Análises">
      <AnalysesTabs
        initialTicker={
          ticker?.match(/^[A-Za-z]{4}[0-9]{1,2}$/)
            ? ticker.toUpperCase()
            : undefined
        }
      />
    </AppShell>
  );
}
