export const dynamic = "force-dynamic";
import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
import { PortfolioImport } from "@/components/portfolio-import";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatQuantity } from "@/lib/utils";
const metrics = [
  "Patrimônio total",
  "Valor investido",
  "Resultado",
  "Rentabilidade",
];
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
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((label, index) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {index === 0 && hasTotal
                  ? formatCurrency(total)
                  : "Indisponível"}
              </p>
              {(index > 0 || !hasTotal) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sem dados suficientes
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Distribuição da carteira</CardTitle>
            <CardDescription>
              A composição será exibida quando houver dados suficientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
              Ainda não há uma distribuição disponível.
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Posições recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length ? (
              <ul className="divide-y divide-border">
                {positions.slice(0, 5).map((position) => (
                  <li
                    key={position.id}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {position.product}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatQuantity(Number(position.quantity))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-9 text-center text-sm text-muted-foreground">
                Nenhuma posição importada.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
      <section className="mt-6">
        <PortfolioImport />
      </section>
    </AppShell>
  );
}
