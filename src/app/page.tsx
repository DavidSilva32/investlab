export const dynamic = "force-dynamic";
import Link from "next/link";
import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
export default async function HomePage() {
  const positions = await importRepository.listLatestPositions();
  const total = positions.reduce(
    (sum, p) => sum + Number(p.totalValue ?? 0),
    0,
  );
  const hasTotal = positions.some((p) => p.totalValue !== null);
  return (
    <AppShell title="Dashboard">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Uma visão objetiva da sua carteira.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Patrimônio total</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {hasTotal ? formatCurrency(total) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dados da carteira</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/imports"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Importar dados
            </Link>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
